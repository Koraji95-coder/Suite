#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ACADE_ROOT = "C:\\Program Files\\Autodesk\\AutoCAD 2026\\Acade";
const DEFAULT_MARKDOWN_OUTPUT_RELATIVE_PATH =
	"docs/development/autocad-electrical-2026-installation-context-reference.md";
const DEFAULT_YAML_OUTPUT_RELATIVE_PATH =
	"docs/development/autocad-electrical-2026-installation-context.generated.yaml";
const DEFAULT_OUTPUT_PATH = path.join(
	REPO_ROOT,
	...DEFAULT_MARKDOWN_OUTPUT_RELATIVE_PATH.split("/"),
);
const DEFAULT_YAML_OUTPUT_PATH = path.join(
	REPO_ROOT,
	...DEFAULT_YAML_OUTPUT_RELATIVE_PATH.split("/"),
);
const INSTALLATION_CONTEXT_SCHEMA_VERSION =
	"suite.autodesk.acade.installation-context.v1";
const MENU_ACTION_SUBMENU = /^\$S\s*=\s*(.+)$/i;
const MENU_ACTION_COMMAND = /^\$C\s*=\s*(.+)$/i;
const MDB_EXTENSIONS = new Set([".mdb"]);
const SUPPORT_SCRIPT_PATHS = [
	"wd_load.lsp",
	path.join("Support", "en-US", "Shared", "wdio.lsp"),
];
const PRACTICAL_IMPLICATIONS = [
	"The *_MENU.DAT catalogs are Autodesk's shipped insert taxonomy. They are a better source for standards-aware command discovery than ad-hoc web examples.",
	"wd_load.lsp shows startup and search-path behavior, which matters for any plugin, patch, or demand-load integration work.",
	"wdio.lsp exposes the spreadsheet-to-PLC automation surface and is the strongest local reference for PLC-generation workflows.",
	"The .mdb files are canonical lookup sources for catalog, footprint, PLC, and via/component relationships. Treat them as read-first assets unless there is a controlled migration story.",
	"The shipped sample drawings and demo .wdp projects are strong regression fixtures for future Suite automation features that need realistic ACADE content.",
];

function normalizeText(value) {
	return String(value || "")
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeLineEndings(value) {
	return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toPosix(filePath) {
	return String(filePath || "").replaceAll("\\", "/");
}

function formatInlineCode(value) {
	return `\`${String(value || "").replaceAll("`", "\\`")}\``;
}

function formatPathForDisplay(filePath) {
	const resolvedPath = path.resolve(String(filePath || ""));
	if (
		resolvedPath === REPO_ROOT ||
		resolvedPath.startsWith(`${REPO_ROOT}${path.sep}`)
	) {
		return toPosix(path.relative(REPO_ROOT, resolvedPath));
	}
	return toPosix(resolvedPath);
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function addLines(lines, ...nextLines) {
	for (const line of nextLines) {
		lines.push(line);
	}
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listDirectoryEntries(root, options = {}) {
	const { type = "all" } = options;
	if (!(await pathExists(root))) {
		return [];
	}

	const entries = await fs.readdir(root, { withFileTypes: true });
	return entries
		.filter((entry) => {
			if (type === "file") {
				return entry.isFile();
			}
			if (type === "directory") {
				return entry.isDirectory();
			}
			return true;
		})
		.map((entry) => path.join(root, entry.name));
}

function summarizeExtensionCounts(filePaths) {
	const counts = new Map();
	for (const filePath of filePaths) {
		const extension = path.extname(filePath).toLowerCase() || "<none>";
		counts.set(extension, (counts.get(extension) || 0) + 1);
	}
	return [...counts.entries()]
		.map(([extension, count]) => ({ extension, count }))
		.sort((left, right) => right.count - left.count || left.extension.localeCompare(right.extension));
}

export function parseMenuDat(text, fileName = "") {
	const lines = normalizeLineEndings(text).split("\n");
	const pages = [];
	let currentPage = null;

	function finishCurrentPage() {
		if (!currentPage) {
			return;
		}
		currentPage.entries = currentPage.entries.filter((entry) => entry.label || entry.action);
		if (currentPage.title || currentPage.entries.length > 0) {
			pages.push(currentPage);
		}
		currentPage = null;
	}

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith(";")) {
			continue;
		}

		if (line.startsWith("**M")) {
			finishCurrentPage();
			currentPage = {
				id: line.slice(2).trim(),
				layout: "",
				title: "",
				entries: [],
			};
			continue;
		}

		if (!currentPage) {
			continue;
		}

		if (!currentPage.layout) {
			currentPage.layout = line;
			continue;
		}

		if (!currentPage.title) {
			currentPage.title = normalizeText(line);
			continue;
		}

		if (line === "||") {
			continue;
		}

		const parts = rawLine.split("|");
		const label = normalizeText(parts[0] || "");
		const icon = normalizeText(parts[1] || "");
		const action = normalizeText(parts.slice(2).join("|"));
		const submenuMatch = action.match(MENU_ACTION_SUBMENU);
		const commandMatch = action.match(MENU_ACTION_COMMAND);
		currentPage.entries.push({
			label,
			icon,
			action,
			submenuId: submenuMatch ? normalizeText(submenuMatch[1]) : "",
			command: commandMatch ? normalizeText(commandMatch[1]) : "",
			isSubmenu: Boolean(submenuMatch),
			isCommand: Boolean(commandMatch),
			isSymbolInsert: Boolean(action) && !submenuMatch && !commandMatch,
		});
	}

	finishCurrentPage();

	const firstPage = pages[0] || null;
	const allEntries = pages.flatMap((page) => page.entries);
	const topLevelEntries = (firstPage?.entries || []).filter((entry) => entry.label);

	return {
		fileName,
		pageCount: pages.length,
		totalEntryCount: allEntries.length,
		submenuCount: allEntries.filter((entry) => entry.isSubmenu).length,
		commandActionCount: allEntries.filter((entry) => entry.isCommand).length,
		symbolInsertCount: allEntries.filter((entry) => entry.isSymbolInsert).length,
		firstPageTitle: firstPage?.title || "",
		topLevelEntries,
		pages,
	};
}

export function parseLispSurface(text, fileName = "") {
	const normalized = normalizeLineEndings(text);
	const defuns = unique(
		[...normalized.matchAll(/\(defun\s+([^\s()]+)/gi)].map((match) => normalizeText(match[1])),
	);
	const commandEntryPoints = defuns.filter((name) => name.toLowerCase().startsWith("c:"));
	const fileReferences = unique(
		[
			...normalized.matchAll(
				/"([^"\r\n]+\.(?:fas|vlx|lsp|dcl|env|mdb|dat|wdi|wdt|xls|csv|dwg|dwt))"/gi,
			),
		].map((match) => normalizeText(match[1])),
	);
	const globals = unique(
		[...normalized.matchAll(/\bGBL_[A-Za-z0-9_]+\b/g)].map((match) => normalizeText(match[0])),
	);

	return {
		fileName,
		defuns,
		commandEntryPoints,
		fileReferences,
		globalVariables: globals,
	};
}

function escapePowerShellSingleQuoted(value) {
	return String(value || "").replace(/'/g, "''");
}

function inspectAccessDatabase(filePath) {
	const escapedPath = escapePowerShellSingleQuoted(filePath);
	const script = [
		`$filePath = '${escapedPath}'`,
		'$connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$filePath;Persist Security Info=False;"',
		"$cn = New-Object System.Data.OleDb.OleDbConnection($connectionString)",
		"$cn.Open()",
		"$tables = @($cn.GetSchema('Tables') | Where-Object { ($_.TABLE_TYPE -eq 'TABLE' -or $_.TABLE_TYPE -eq 'VIEW') -and $_.TABLE_NAME -notlike 'MSys*' } | Sort-Object TABLE_NAME)",
		"$columns = @($cn.GetSchema('Columns') | Where-Object { $_.TABLE_NAME -notlike 'MSys*' })",
		"$result = [ordered]@{",
		"  filePath = $filePath",
		"  tables = @(",
		"    foreach ($table in $tables) {",
		"      $tableColumns = @($columns | Where-Object { $_.TABLE_NAME -eq $table.TABLE_NAME } | Sort-Object ORDINAL_POSITION | Select-Object -ExpandProperty COLUMN_NAME)",
		"      [ordered]@{",
		"        name = [string]$table.TABLE_NAME",
		"        type = [string]$table.TABLE_TYPE",
		"        columnCount = $tableColumns.Count",
		"        columns = @($tableColumns | Select-Object -First 8)",
		"      }",
		"    }",
		"  )",
		"}",
		"$cn.Close()",
		"$result | ConvertTo-Json -Depth 6 -Compress",
	].join("\n");

	try {
		const output = execFileSync(
			"powershell.exe",
			["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
			{ encoding: "utf8" },
		).trim();
		if (!output) {
			return {
				filePath,
				error: "No schema metadata returned by PowerShell.",
			};
		}
		const parsed = JSON.parse(output);
		return {
			filePath,
			tables: Array.isArray(parsed.tables) ? parsed.tables : [],
		};
	} catch (error) {
		return {
			filePath,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function scoreDatabaseTable(table) {
	const name = String(table.name || "").toLowerCase();
	let score = 0;
	if (name.startsWith("_")) score += 8;
	if (/pin|lookup|family|proj|wire|xref|term|catalog|plc|footprint|component|signal/.test(name)) {
		score += 5;
	}
	return score;
}

function summarizeInterestingTables(tables) {
	return [...tables]
		.sort((left, right) => {
			const scoreDelta = scoreDatabaseTable(right) - scoreDatabaseTable(left);
			if (scoreDelta !== 0) {
				return scoreDelta;
			}
			return String(left.name || "").localeCompare(String(right.name || ""));
		})
		.slice(0, 8);
}

function normalizeDatabaseInventory(entry) {
	const tables = Array.isArray(entry.tables) ? entry.tables : [];
	return {
		filePath: entry.filePath,
		error: entry.error || "",
		tableCount: tables.length,
		tables,
		interestingTables: summarizeInterestingTables(tables),
	};
}

async function collectDatabaseInventories(acadeRoot, options = {}) {
	if (Array.isArray(options.databaseInventories)) {
		return options.databaseInventories.map(normalizeDatabaseInventory);
	}

	const databaseRoots = [
		path.join(acadeRoot, "en-US", "DB"),
		path.join(acadeRoot, "UserDataCache", "en-US", "Electrical", "UserSupport"),
	];
	const discovered = [];
	for (const root of databaseRoots) {
		const files = await listDirectoryEntries(root, { type: "file" });
		for (const filePath of files) {
			if (MDB_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
				discovered.push(filePath);
			}
		}
	}

	return discovered
		.sort((left, right) => left.localeCompare(right))
		.map((filePath) => normalizeDatabaseInventory(inspectAccessDatabase(filePath)));
}

async function collectMenuSummaries(userSupportRoot) {
	const files = await listDirectoryEntries(userSupportRoot, { type: "file" });
	const menuFiles = [];
	for (const filePath of files) {
		if (path.extname(filePath).toLowerCase() !== ".dat") {
			continue;
		}
		const text = await fs.readFile(filePath, "utf8");
		const parsed = parseMenuDat(text, path.basename(filePath));
		if (parsed.pageCount > 0) {
			menuFiles.push({
				...parsed,
				filePath,
			});
		}
	}

	return menuFiles.sort((left, right) => left.fileName.localeCompare(right.fileName));
}

async function collectSupportScriptSummaries(acadeRoot) {
	const summaries = [];
	for (const relativePath of SUPPORT_SCRIPT_PATHS) {
		const filePath = path.join(acadeRoot, relativePath);
		if (!(await pathExists(filePath))) {
			continue;
		}
		const text = await fs.readFile(filePath, "utf8");
		summaries.push({
			...parseLispSurface(text, path.basename(filePath)),
			filePath,
		});
	}
	return summaries;
}

async function collectSampleDrawings(sampleRoot) {
	const files = await listDirectoryEntries(sampleRoot, { type: "file" });
	return files
		.filter((filePath) => /\.dwg$/i.test(filePath))
		.sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function collectDemoProjects(demoRoot) {
	const directories = await listDirectoryEntries(demoRoot, { type: "directory" });
	const projects = [];

	for (const directory of directories.sort((left, right) => left.localeCompare(right))) {
		const files = await listDirectoryEntries(directory, { type: "file" });
		const projectFiles = files.filter((filePath) => /\.wdp$/i.test(filePath));
		const drawingFiles = files.filter((filePath) => /\.(dwg|dwt)$/i.test(filePath));
		const sidecarFiles = files.filter((filePath) => /\.(wdl|wdt|wdd|wdr|dat|mdb|txt)$/i.test(filePath));
		projects.push({
			name: path.basename(directory),
			rootPath: directory,
			projectFiles,
			drawingFiles,
			sidecarFiles,
		});
	}

	return projects;
}

async function collectUserSupportSummary(userSupportRoot) {
	const files = await listDirectoryEntries(userSupportRoot, { type: "file" });
	return {
		rootPath: userSupportRoot,
		filePaths: files.sort((left, right) => left.localeCompare(right)),
		extensionCounts: summarizeExtensionCounts(files),
	};
}

function buildSourceAuthoritySection(summary) {
	return [
		"## Source Authority",
		"",
		"- This document is generated from the locally installed AutoCAD Electrical payload on this workstation.",
		`- Generated at: ${summary.generatedAt}`,
		`- Install root: ${formatInlineCode(toPosix(summary.acadeRoot))}`,
		`- User support root: ${formatInlineCode(toPosix(summary.userSupport.rootPath))}`,
		`- Sample root: ${formatInlineCode(toPosix(summary.sampleRoot))}`,
		`- Demo project root: ${formatInlineCode(toPosix(summary.demoRoot))}`,
		`- Structured YAML companion: ${formatInlineCode(summary.yamlOutputReference)}`,
		`- Menu catalogs indexed: ${summary.menuSummaries.length}`,
		`- Support scripts mapped: ${summary.supportScripts.length}`,
		`- MDB inventories captured: ${summary.databaseInventories.length}`,
		`- Shipped sample drawings indexed: ${summary.sampleDrawings.length}`,
		`- Demo project roots indexed: ${summary.demoProjects.length}`,
	].join("\n");
}

function buildUserSupportSection(summary) {
	const lines = ["## User Support Payload", ""];
	addLines(lines, `- Root: ${formatInlineCode(toPosix(summary.userSupport.rootPath))}`);
	addLines(lines, `- Total files indexed: ${summary.userSupport.filePaths.length}`);
	addLines(lines, "");
	addLines(lines, "### File-Type Mix", "");
	for (const entry of summary.userSupport.extensionCounts.slice(0, 12)) {
		addLines(lines, `- ${formatInlineCode(entry.extension)}: ${entry.count}`);
	}
	addLines(lines, "");
	addLines(lines, "### Menu Catalogs", "");
	for (const menu of summary.menuSummaries) {
		const topLevelLabels = menu.topLevelEntries
			.slice(0, 10)
			.map((entry) => entry.label)
			.filter(Boolean)
			.join(", ");
		addLines(lines, `#### ${menu.fileName}`, "");
		addLines(lines, `- Main page: ${menu.firstPageTitle || "Untitled"}`);
		addLines(lines, `- Pages: ${menu.pageCount}`);
		addLines(lines, `- Entries: ${menu.totalEntryCount}`);
		addLines(lines, `- Submenus: ${menu.submenuCount}`);
		addLines(lines, `- Command actions: ${menu.commandActionCount}`);
		addLines(lines, `- Direct symbol inserts: ${menu.symbolInsertCount}`);
		if (topLevelLabels) {
			addLines(lines, `- Top-level categories: ${topLevelLabels}`);
		}
		addLines(lines, "");
	}
	return lines.join("\n").trim();
}

function buildSupportScriptsSection(summary) {
	const lines = ["## Support Script Surface", ""];

	for (const script of summary.supportScripts) {
		addLines(lines, `### ${script.fileName}`, "");
		addLines(lines, `- Path: ${formatInlineCode(toPosix(script.filePath))}`);
		addLines(lines, `- Defuns: ${script.defuns.length}`);
		addLines(lines, `- Command entry points: ${script.commandEntryPoints.length}`);
		if (script.commandEntryPoints.length > 0) {
			addLines(
				lines,
				`- Commands: ${script.commandEntryPoints.map((name) => formatInlineCode(name)).join(", ")}`,
			);
		}
		if (script.fileReferences.length > 0) {
			addLines(
				lines,
				`- Referenced files: ${script.fileReferences
					.slice(0, 12)
					.map((name) => formatInlineCode(name))
					.join(", ")}`,
			);
		}
		if (script.globalVariables.length > 0) {
			addLines(
				lines,
				`- Globals touched: ${script.globalVariables
					.slice(0, 10)
					.map((name) => formatInlineCode(name))
					.join(", ")}`,
			);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildDatabaseSection(summary) {
	const lines = ["## Lookup Database Inventory", ""];

	for (const database of summary.databaseInventories) {
		addLines(lines, `### ${path.basename(database.filePath)}`, "");
		addLines(lines, `- Path: ${formatInlineCode(toPosix(database.filePath))}`);
		if (database.error) {
			addLines(lines, `- Schema probe error: ${database.error}`);
			addLines(lines, "");
			continue;
		}
		addLines(lines, `- Tables: ${database.tableCount}`);
		for (const table of database.interestingTables) {
			const columnPreview =
				Array.isArray(table.columns) && table.columns.length > 0
					? table.columns.map((name) => formatInlineCode(name)).join(", ")
					: "no preview columns";
			addLines(
				lines,
				`- ${formatInlineCode(table.name)} (${table.columnCount} columns): ${columnPreview}`,
			);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildSamplesSection(summary) {
	const lines = ["## Samples and Demo Projects", ""];

	addLines(lines, "### Shipped Sample Drawings", "");
	for (const sampleDrawing of summary.sampleDrawings) {
		addLines(lines, `- ${formatInlineCode(path.basename(sampleDrawing))}`);
	}
	addLines(lines, "");
	addLines(lines, "### Demo Project Seeds", "");
	for (const project of summary.demoProjects) {
		const projectFileList = project.projectFiles.map((filePath) => path.basename(filePath));
		addLines(lines, `#### ${project.name}`, "");
		addLines(lines, `- Root: ${formatInlineCode(toPosix(project.rootPath))}`);
		addLines(lines, `- Project files: ${projectFileList.length > 0 ? projectFileList.map((name) => formatInlineCode(name)).join(", ") : "none"}`);
		addLines(lines, `- Drawing count: ${project.drawingFiles.length}`);
		if (project.sidecarFiles.length > 0) {
			addLines(
				lines,
				`- Sidecars: ${project.sidecarFiles
					.slice(0, 8)
					.map((filePath) => formatInlineCode(path.basename(filePath)))
					.join(", ")}`,
			);
		}
		addLines(lines, "");
	}

	return lines.join("\n").trim();
}

function buildImplicationsSection() {
	return [
		"## Practical Implications for Suite",
		"",
		...PRACTICAL_IMPLICATIONS.map((item) => `- ${item}`),
	].join("\n");
}

function toStructuredMenuEntry(entry) {
	let actionType = "other";
	if (entry.isSubmenu) {
		actionType = "submenu";
	} else if (entry.isCommand) {
		actionType = "command";
	} else if (entry.isSymbolInsert) {
		actionType = "symbol_insert";
	}

	return compactValue({
		label: entry.label,
		icon: entry.icon,
		actionType,
		action: entry.action,
		submenuId: entry.submenuId,
		command: entry.command,
	});
}

function toStructuredFileEntry(filePath) {
	return {
		name: path.basename(filePath),
		path: toPosix(filePath),
	};
}

function compactValue(value) {
	if (Array.isArray(value)) {
		return value
			.map((item) => compactValue(item))
			.filter((item) => item !== undefined);
	}

	if (value && typeof value === "object") {
		const entries = Object.entries(value)
			.map(([key, childValue]) => [key, compactValue(childValue)])
			.filter(([, childValue]) => {
				if (childValue === undefined) {
					return false;
				}
				if (Array.isArray(childValue) && childValue.length === 0) {
					return false;
				}
				if (
					childValue &&
					typeof childValue === "object" &&
					!Array.isArray(childValue) &&
					Object.keys(childValue).length === 0
				) {
					return false;
				}
				return true;
			});

		if (entries.length === 0) {
			return undefined;
		}

		return Object.fromEntries(entries);
	}

	if (value === "" || value === null || value === undefined) {
		return undefined;
	}

	return value;
}

function buildStructuredSummary(summary) {
	return compactValue({
		schemaVersion: INSTALLATION_CONTEXT_SCHEMA_VERSION,
		generatedAt: summary.generatedAt,
		roots: {
			acade: toPosix(summary.acadeRoot),
			userSupport: toPosix(summary.userSupport.rootPath),
			samples: toPosix(summary.sampleRoot),
			demoProjects: toPosix(summary.demoRoot),
		},
		outputs: {
			markdown: summary.markdownOutputReference,
			yaml: summary.yamlOutputReference,
		},
		counts: {
			userSupportFiles: summary.userSupport.filePaths.length,
			menuCatalogs: summary.menuSummaries.length,
			supportScripts: summary.supportScripts.length,
			lookupDatabases: summary.databaseInventories.length,
			sampleDrawings: summary.sampleDrawings.length,
			demoProjectRoots: summary.demoProjects.length,
		},
		userSupport: {
			rootPath: toPosix(summary.userSupport.rootPath),
			files: summary.userSupport.filePaths.map((filePath) => toStructuredFileEntry(filePath)),
			fileTypeMix: summary.userSupport.extensionCounts,
			menuCatalogs: summary.menuSummaries.map((menu) =>
				compactValue({
					fileName: menu.fileName,
					filePath: toPosix(menu.filePath),
					firstPageTitle: menu.firstPageTitle,
					pageCount: menu.pageCount,
					totalEntryCount: menu.totalEntryCount,
					submenuCount: menu.submenuCount,
					commandActionCount: menu.commandActionCount,
					symbolInsertCount: menu.symbolInsertCount,
					topLevelEntries: menu.topLevelEntries
						.slice(0, 12)
						.map((entry) => toStructuredMenuEntry(entry)),
				}),
			),
		},
		supportScripts: summary.supportScripts.map((script) =>
			compactValue({
				fileName: script.fileName,
				filePath: toPosix(script.filePath),
				defuns: script.defuns,
				commandEntryPoints: script.commandEntryPoints,
				referencedFiles: script.fileReferences,
				globalVariables: script.globalVariables,
			}),
		),
		lookupDatabases: summary.databaseInventories.map((database) =>
			compactValue({
				fileName: path.basename(database.filePath),
				filePath: toPosix(database.filePath),
				tableCount: database.tableCount,
				error: database.error,
				tables: database.tables.map((table) =>
					compactValue({
						name: table.name,
						type: table.type,
						columnCount: table.columnCount,
						columns: table.columns,
					}),
				),
			}),
		),
		samples: {
			shippedSampleDrawings: summary.sampleDrawings.map((filePath) =>
				toStructuredFileEntry(filePath),
			),
			demoProjects: summary.demoProjects.map((project) =>
				compactValue({
					name: project.name,
					rootPath: toPosix(project.rootPath),
					projectFiles: project.projectFiles.map((filePath) => toStructuredFileEntry(filePath)),
					drawingFiles: project.drawingFiles.map((filePath) => toStructuredFileEntry(filePath)),
					sidecarFiles: project.sidecarFiles.map((filePath) => toStructuredFileEntry(filePath)),
				}),
			),
		},
		practicalImplications: PRACTICAL_IMPLICATIONS,
	});
}

function buildDocFromSummary(summary) {
	const lines = [
		"# AutoCAD Electrical 2026 Installation Context Reference",
		"",
		"Do not edit this file manually. Regenerate it from the installed Autodesk AutoCAD Electrical payload on the workstation.",
		"",
		buildSourceAuthoritySection(summary),
		"",
		"## Scope",
		"",
		"- Complement the local CHM/API reference with the shipped user-support catalogs, support scripts, lookup databases, and sample/demo content.",
		"- Capture the on-disk structure that Suite can safely read when reasoning about ACADE automation and standards-aware behavior.",
		"- Preserve enough local context to design integrations against Autodesk's actual install payload instead of guessing from generic web summaries.",
		"",
		buildUserSupportSection(summary),
		"",
		buildSupportScriptsSection(summary),
		"",
		buildDatabaseSection(summary),
		"",
		buildSamplesSection(summary),
		"",
		buildImplicationsSection(),
		"",
	];

	return `${lines.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function buildYamlFromSummary(summary) {
	const structuredSummary = buildStructuredSummary(summary);
	return stringifyYaml(structuredSummary, {
		lineWidth: 0,
		minContentWidth: 0,
	});
}

export async function buildInstallationContextSummaryFromAcadeRoot(acadeRoot, options = {}) {
	const normalizedRoot = path.resolve(acadeRoot || DEFAULT_ACADE_ROOT);
	const userSupportRoot = path.join(
		normalizedRoot,
		"UserDataCache",
		"en-US",
		"Electrical",
		"UserSupport",
	);
	const sampleRoot = path.join(normalizedRoot, "Sample");
	const demoRoot = path.join(
		normalizedRoot,
		"UserDataCache",
		"My Documents",
		"Acade 2026",
		"AeData",
		"Proj",
	);
	const generatedAt = options.generatedAt || new Date().toISOString();
	const markdownOutputReference = formatPathForDisplay(
		options.markdownOutputPath || DEFAULT_OUTPUT_PATH,
	);
	const yamlOutputReference = formatPathForDisplay(
		options.yamlOutputPath || DEFAULT_YAML_OUTPUT_PATH,
	);

	const [userSupport, menuSummaries, supportScripts, databaseInventories, sampleDrawings, demoProjects] =
		await Promise.all([
			collectUserSupportSummary(userSupportRoot),
			collectMenuSummaries(userSupportRoot),
			collectSupportScriptSummaries(normalizedRoot),
			collectDatabaseInventories(normalizedRoot, options),
			collectSampleDrawings(sampleRoot),
			collectDemoProjects(demoRoot),
		]);

	return {
		generatedAt,
		acadeRoot: normalizedRoot,
		markdownOutputReference,
		yamlOutputReference,
		userSupport,
		menuSummaries,
		supportScripts,
		databaseInventories,
		sampleDrawings,
		demoProjects,
		sampleRoot,
		demoRoot,
	};
}

export async function buildDocFromAcadeRoot(acadeRoot, options = {}) {
	const summary = await buildInstallationContextSummaryFromAcadeRoot(
		acadeRoot,
		options,
	);
	return buildDocFromSummary(summary);
}

export async function buildYamlFromAcadeRoot(acadeRoot, options = {}) {
	const summary = await buildInstallationContextSummaryFromAcadeRoot(
		acadeRoot,
		options,
	);
	return buildYamlFromSummary(summary);
}

export async function buildArtifactsFromAcadeRoot(acadeRoot, options = {}) {
	const summary = await buildInstallationContextSummaryFromAcadeRoot(
		acadeRoot,
		options,
	);
	return {
		summary,
		markdown: buildDocFromSummary(summary),
		yaml: buildYamlFromSummary(summary),
	};
}

function readCliArg(flag) {
	const index = process.argv.indexOf(flag);
	if (index < 0) {
		return "";
	}
	return process.argv[index + 1] || "";
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;
	const yamlOutputPath = readCliArg("--yaml-output") || DEFAULT_YAML_OUTPUT_PATH;
	const { markdown, yaml } = await buildArtifactsFromAcadeRoot(acadeRoot, {
		markdownOutputPath: outputPath,
		yamlOutputPath,
	});
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.mkdir(path.dirname(yamlOutputPath), { recursive: true });
	await Promise.all([
		fs.writeFile(outputPath, markdown, "utf8"),
		fs.writeFile(yamlOutputPath, yaml, "utf8"),
	]);
	console.log(`Generated ${outputPath}`);
	console.log(`Generated ${yamlOutputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical installation context reference:", error);
		process.exit(1);
	});
}
