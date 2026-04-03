#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildInstallationContextSummaryFromAcadeRoot } from "./extract-autodesk-acade-installation-context.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_ACADE_ROOT = "C:\\Program Files\\Autodesk\\AutoCAD 2026\\Acade";
const DEFAULT_OUTPUT_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-suite-integration-playbook.md",
);
const PROJECT_FLOW_DOC =
	"docs/development/autocad-electrical-2026-project-flow-reference.md";
const API_REFERENCE_DOC =
	"docs/development/AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md";
const INSTALL_CONTEXT_DOC =
	"docs/development/autocad-electrical-2026-installation-context-reference.md";
const INSTALL_CONTEXT_YAML =
	"docs/development/autocad-electrical-2026-installation-context.generated.yaml";
const LOOKUP_INDEX_JSON =
	"docs/development/autocad-electrical-2026-lookup-index.generated.json";
const REGRESSION_FIXTURES_DOC =
	"docs/development/autocad-electrical-2026-regression-fixtures.md";
const REFERENCE_PACK_DOC =
	"docs/development/autocad-electrical-2026-reference-pack.md";
const MENU_INDEX_JSON =
	"docs/development/autocad-electrical-2026-menu-index.generated.json";

function readCliArg(flag) {
	const index = process.argv.indexOf(flag);
	if (index < 0) {
		return "";
	}
	return process.argv[index + 1] || "";
}

function normalizeText(value) {
	return String(value || "")
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function toPosix(filePath) {
	return String(filePath || "").replaceAll("\\", "/");
}

function formatInlineCode(value) {
	return `\`${String(value || "").replaceAll("`", "\\`")}\``;
}

function topCategories(menu, count = 5) {
	return (menu.topLevelEntries || [])
		.map((entry) => normalizeText(entry.label))
		.filter(Boolean)
		.slice(0, count);
}

function classifyMenu(menu) {
	const fileName = String(menu.fileName || "").toUpperCase();

	if (fileName.includes("PANEL") || fileName === "WD_PMENU.DAT") {
		return "panel";
	}
	if (
		fileName.includes("PID") ||
		fileName.includes("HYD") ||
		fileName.includes("PNEU")
	) {
		return "process";
	}
	if (fileName.includes("LOCS")) {
		return "utility";
	}
	if (fileName.endsWith("_MENU.DAT") || fileName === "WD_MENU.DAT" || fileName === "IEC_MENU.DAT") {
		return "schematic";
	}
	return "other";
}

function menuFamilyLabel(fileName) {
	const normalized = String(fileName || "").toUpperCase();
	if (normalized.includes("IEC-60617")) return "IEC 60617";
	if (normalized.includes("ACE_IEC_MENU")) return "IEC";
	if (normalized.includes("ACE_IEEE")) return "IEEE";
	if (normalized.includes("ACE_JIC")) return "JIC";
	if (normalized.includes("ACE_JIS")) return "JIS";
	if (normalized.includes("ACE_NFPA")) return "NFPA";
	if (normalized.includes("ACE_GB")) return "GB";
	if (normalized.includes("ACE_AS")) return "AS";
	if (normalized.includes("ACE_PANEL")) return "Panel Layout";
	if (normalized.includes("ACE_PID")) return "P&ID";
	if (normalized.includes("ACE_HYD")) return "Hydraulic";
	if (normalized.includes("ACE_PNEU")) return "Pneumatic";
	if (normalized.includes("WD_MENU")) return "Legacy JIC";
	if (normalized.includes("IEC_MENU")) return "Legacy IEC";
	if (normalized.includes("WD_PMENU")) return "Legacy Panel";
	if (normalized.includes("WD_LOCS")) return "Location Symbols";
	if (normalized.includes("WD_PNEU")) return "Legacy Pneumatic";
	return String(fileName || "");
}

function menuNote(fileName) {
	const normalized = String(fileName || "").toUpperCase();
	if (normalized.includes("PANEL") || normalized === "WD_PMENU.DAT") {
		return "Use for panel-layout symbol discovery, not schematic insert search.";
	}
	if (normalized.includes("PID")) {
		return "Useful when Suite needs process/instrumentation vocabulary instead of electrical-only symbols.";
	}
	if (normalized.includes("HYD") || normalized.includes("PNEU")) {
		return "Treat as fluid-power surface area, separate from standard electrical insert flows.";
	}
	if (normalized.includes("WD_MENU") || normalized.includes("IEC_MENU")) {
		return "Legacy/default menu path that still matters for fallback menu-loading behavior.";
	}
	if (normalized.includes("IEC-60617")) {
		return "Most complete IEC-style schematic set on this workstation.";
	}
	if (normalized.includes("JIC") || normalized.includes("NFPA")) {
		return "Good candidate for North American operator-facing defaults.";
	}
	return "Use as a standards-aware insert taxonomy source.";
}

function buildTable(headers, rows) {
	const normalizedRows = rows.map((row) => row.map((cell) => String(cell || "")));
	const allRows = [headers, ...normalizedRows];
	const widths = headers.map((_, columnIndex) =>
		Math.max(...allRows.map((row) => row[columnIndex].length)),
	);

	const formatRow = (row) =>
		`| ${row
			.map((cell, index) => cell.padEnd(widths[index], " "))
			.join(" | ")} |`;
	const divider = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

	return [formatRow(headers), divider, ...normalizedRows.map((row) => formatRow(row))].join("\n");
}

function buildSourceSetSection(summary) {
	return [
		"## Source Set",
		"",
		"- Project flow reference: " + formatInlineCode(PROJECT_FLOW_DOC),
		"- AutoLISP/API reference: " + formatInlineCode(API_REFERENCE_DOC),
		"- Install-context reference: " + formatInlineCode(INSTALL_CONTEXT_DOC),
		"- Structured inventory: " + formatInlineCode(INSTALL_CONTEXT_YAML),
		"- Runtime menu index: " + formatInlineCode(MENU_INDEX_JSON),
		"- Runtime lookup index: " + formatInlineCode(LOOKUP_INDEX_JSON),
		"- Regression fixture plan: " + formatInlineCode(REGRESSION_FIXTURES_DOC),
		"- Combined pack: " + formatInlineCode(REFERENCE_PACK_DOC),
		`- Generated at: ${summary.generatedAt}`,
		"",
		"Use this playbook as the short operational layer on top of the fuller local reference pack.",
	].join("\n");
}

function buildStandardsMenuSection(summary) {
	const schematicMenus = summary.menuSummaries
		.filter((menu) => classifyMenu(menu) === "schematic")
		.sort((left, right) => left.fileName.localeCompare(right.fileName));
	const panelMenus = summary.menuSummaries
		.filter((menu) => classifyMenu(menu) === "panel")
		.sort((left, right) => left.fileName.localeCompare(right.fileName));
	const processMenus = summary.menuSummaries
		.filter((menu) => classifyMenu(menu) === "process")
		.sort((left, right) => left.fileName.localeCompare(right.fileName));
	const utilityMenus = summary.menuSummaries
		.filter((menu) => classifyMenu(menu) === "utility")
		.sort((left, right) => left.fileName.localeCompare(right.fileName));

	const schematicTable = buildTable(
		["Family", "File", "Entries", "Top Categories", "Note"],
		schematicMenus.map((menu) => [
			menuFamilyLabel(menu.fileName),
			menu.fileName,
			String(menu.totalEntryCount),
			topCategories(menu).join(", "),
			menuNote(menu.fileName),
		]),
	);
	const panelTable = buildTable(
		["Family", "File", "Entries", "Top Categories", "Note"],
		panelMenus.map((menu) => [
			menuFamilyLabel(menu.fileName),
			menu.fileName,
			String(menu.totalEntryCount),
			topCategories(menu).join(", "),
			menuNote(menu.fileName),
		]),
	);
	const processTable = buildTable(
		["Family", "File", "Entries", "Top Categories", "Note"],
		processMenus.map((menu) => [
			menuFamilyLabel(menu.fileName),
			menu.fileName,
			String(menu.totalEntryCount),
			topCategories(menu).join(", "),
			menuNote(menu.fileName),
		]),
	);

	const lines = [
		"## Standards and Symbol Surface",
		"",
		"- Schematic symbol standards are the highest-value source for standards-aware command discovery inside Suite.",
		"- Panel menus should stay a separate lane from schematic insert search because their commands and expectations differ.",
		"- Process, hydraulic, and pneumatic menus expand the surface area beyond electrical-only automation and should remain opt-in.",
		"",
		"### Schematic Standards",
		"",
		schematicTable,
		"",
		"### Panel Layout Menus",
		"",
		panelTable,
		"",
		"### Process and Fluid-Power Menus",
		"",
		processTable,
	];

	if (utilityMenus.length > 0) {
		lines.push("");
		lines.push("### Utility and Location Menus");
		lines.push("");
		for (const menu of utilityMenus) {
			lines.push(
				`- ${formatInlineCode(menu.fileName)}: ${menu.firstPageTitle} (${menu.totalEntryCount} entries).`,
			);
		}
	}

	return lines.join("\n");
}

function buildAutomationSurfaceSection(summary) {
	const wdio = summary.supportScripts.find((script) => script.fileName.toLowerCase() === "wdio.lsp");
	const wdLoad = summary.supportScripts.find(
		(script) => script.fileName.toLowerCase() === "wd_load.lsp",
	);
	const defaultCat = summary.databaseInventories.find((database) =>
		path.basename(database.filePath).toLowerCase() === "default_cat.mdb",
	);
	const acePlc = summary.databaseInventories.find((database) =>
		path.basename(database.filePath).toLowerCase() === "ace_plc.mdb",
	);
	const viaMap = summary.databaseInventories.find((database) =>
		path.basename(database.filePath).toLowerCase() === "wdviacmp.mdb",
	);
	const footprintLookup = summary.databaseInventories.find((database) =>
		path.basename(database.filePath).toLowerCase() === "footprint_lookup.mdb",
	);
	const plcSample = summary.sampleDrawings.find((filePath) =>
		path.basename(filePath).toLowerCase().includes("plc"),
	);
	const demoProject = summary.demoProjects.find((project) =>
		project.projectFiles.some((filePath) => path.basename(filePath).toLowerCase() === "wddemo.wdp"),
	);

	const lines = [
		"## Automation Surface That Matters Most",
		"",
		"### Support Scripts",
		"",
		`- ${formatInlineCode("wd_load.lsp")}: ${wdLoad ? "startup/search-path and demand-load behavior" : "expected startup/search-path behavior"}.`,
		`- ${formatInlineCode("wdio.lsp")}: ${wdio ? `${wdio.defuns.length} defuns and ${wdio.commandEntryPoints.length} command entry points on this workstation.` : "PLC-generation support surface."}`,
	];

	if (wdio?.commandEntryPoints?.length) {
		lines.push(
			`- Preferred plugin-facing PLC entry points: ${wdio.commandEntryPoints
				.map((name) => formatInlineCode(name))
				.join(", ")}.`,
		);
	}
	if (wdio?.fileReferences?.length) {
		lines.push(
			`- Key PLC-adjacent files referenced by ${formatInlineCode("wdio.lsp")}: ${wdio.fileReferences
				.filter((value) =>
					/\.(?:dcl|xls|wdi|mdb|dwt)$/i.test(value),
				)
				.slice(0, 8)
				.map((value) => formatInlineCode(value))
				.join(", ")}.`,
		);
	}
	lines.push(
		"- Current Suite runtime foothold: read-only reference endpoints at "
			+ `${formatInlineCode("/api/autocad/reference/menu-index")} and `
			+ `${formatInlineCode("/api/autocad/reference/standards")} from the generated local menu catalog.`,
	);
	lines.push(
		"- Current lookup-data foothold: read-only summary/detail endpoints at "
			+ `${formatInlineCode("/api/autocad/reference/lookups/summary")} and `
			+ `${formatInlineCode("/api/autocad/reference/lookups/<lookup_id>")} backed by the generated local MDB inventory.`,
	);

	lines.push("");
	lines.push("### Lookup Databases");
	lines.push("");
	if (defaultCat) {
		lines.push(
			`- ${formatInlineCode("default_cat.mdb")}: broadest catalog/footprint/family lookup source with ${defaultCat.tableCount} tables.`,
		);
	}
	if (acePlc) {
		lines.push(
			`- ${formatInlineCode("ace_plc.mdb")}: PLC manufacturer/style surface with ${acePlc.tableCount} tables.`,
		);
	}
	if (viaMap) {
		lines.push(
			`- ${formatInlineCode("wdviacmp.mdb")}: via-component mapping surface for attribute/component swaps.`,
		);
	}
	if (footprintLookup) {
		lines.push(
			`- ${formatInlineCode("footprint_lookup.mdb")}: currently present but empty on this workstation, so treat it as optional data rather than a guaranteed source.`,
		);
	}

	lines.push("");
	lines.push("### Samples and Fixtures");
	lines.push("");
	lines.push(
		`- Shipped sample drawings: ${summary.sampleDrawings.length}. These are useful as realistic regression fixtures before Suite starts issuing ACADE-side automation.`,
	);
	if (plcSample) {
		lines.push(
			`- PLC-focused sample drawing: ${formatInlineCode(path.basename(plcSample))}.`,
		);
	}
	if (demoProject) {
		lines.push(
			`- Demo project seed worth treating as a canonical test project: ${formatInlineCode(path.basename(demoProject.projectFiles[0]))}.`,
		);
	}

	return lines.join("\n");
}

function buildGuardrailsSection() {
	return [
		"## Recommended Guardrails",
		"",
		"- Read Autodesk install assets and project payloads; do not mutate the installed support tree in place.",
		"- Let ACADE own `.wdp`, `.aepx`, `.wdt`, `.wdl`, and related project sidecars. Suite should pass operator intent into AutoCAD instead of fabricating these files.",
		"- Treat Access lookup databases as read-only reference sources until there is an explicit migration or override design.",
		"- Use plugin-side commands or AutoCAD-hosted automation bridges for writes, inserts, and project mutations.",
		"- Keep panel/process/fluid-power symbol flows distinct from core schematic flows so Suite does not mix incompatible insert vocabularies.",
	].join("\n");
}

function buildFeatureOpportunitiesSection(summary) {
	const hasPanel = summary.menuSummaries.some((menu) => classifyMenu(menu) === "panel");
	const hasProcess = summary.menuSummaries.some((menu) => classifyMenu(menu) === "process");
	return [
		"## Recommended Suite Feature Opportunities",
		"",
		"- Standards-aware command palette: use the schematic menu families to rank and filter insert actions by standard instead of relying on generic keyword search.",
		`- Menu-aware symbol suggestions: surface the top-level menu categories as browseable entry points for operators${hasPanel ? ", while keeping panel-layout suggestions in a separate lane" : ""}.`,
		"- Read-only lookup explorer: expose catalog, family, PLC, and via-component relationships from the shipped `.mdb` files for inspection and validation.",
		"- PLC workflow assistant: stage spreadsheet-to-PLC runs around the `wdio` command surface instead of inventing a parallel Suite-only PLC generator.",
		`- Sample-backed validation: use the shipped demo projects and sample drawings as regression fixtures for new ACADE-facing features${hasProcess ? ", including non-schematic process/fluid-power paths when needed" : ""}.`,
		"- Standards onboarding and documentation: use the menu families and support-script surface to guide operators toward the right ACADE mode before Suite attempts any automation.",
	].join("\n");
}

function buildNextStepSection() {
	return [
		"## Suggested Next Steps",
		"",
		"1. Design plugin-side command bridges around `wdio` and project-manager flows instead of direct filesystem mutation.",
		"2. Use the staged regression fixtures to validate project open, drawing-list, and title-block flows against copied Autodesk payloads.",
		"3. Wire the menu and lookup indexes into operator-facing search and command suggestions.",
		"4. Decide whether lookup browsing should stay backend-only or become a dedicated Suite reference explorer.",
	].join("\n");
}

export async function buildAcadeIntegrationPlaybookMarkdown(options = {}) {
	const summary =
		options.summary ||
		(await buildInstallationContextSummaryFromAcadeRoot(
			options.acadeRoot || DEFAULT_ACADE_ROOT,
			options,
		));

	const lines = [
		"# AutoCAD Electrical 2026 Suite Integration Playbook",
		"",
		"Do not edit this file manually. Regenerate it from the locally installed ACADE reference set on the workstation.",
		"",
		buildSourceSetSection(summary),
		"",
		buildStandardsMenuSection(summary),
		"",
		buildAutomationSurfaceSection(summary),
		"",
		buildGuardrailsSection(),
		"",
		buildFeatureOpportunitiesSection(summary),
		"",
		buildNextStepSection(),
		"",
	];

	return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

async function runCli() {
	const acadeRoot =
		readCliArg("--acade-root") ||
		process.env.SUITE_AUTODESK_ACADE_ROOT ||
		DEFAULT_ACADE_ROOT;
	const outputPath = readCliArg("--output") || DEFAULT_OUTPUT_PATH;
	const markdown = await buildAcadeIntegrationPlaybookMarkdown({ acadeRoot });
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, markdown, "utf8");
	console.log(`Generated ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runCli().catch((error) => {
		console.error("Failed to generate AutoCAD Electrical integration playbook:", error);
		process.exit(1);
	});
}
