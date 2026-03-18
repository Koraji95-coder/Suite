#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const outputPath = path.join(
	repoRoot,
	"src/data/architectureSnapshot.generated.ts",
);
const SNAPSHOT_INPUT_ROOTS = [
	"src/routes",
	"src/components/apps",
	"src/auth",
	"src/services",
	"backend",
	"dotnet",
	"src/supabase",
	"supabase",
	"backend/supabase",
	"zeroclaw-main/src",
	"docs",
	"scripts",
	".env.example",
	"package.json",
];

const DOMAIN_ROOTS = [
	{
		domainId: "frontend",
		roots: [
			"src/routes",
			"src/components/apps",
			"src/components/apps/dxfer",
			"src/auth",
			"src/services",
		],
		maxChildrenPerRoot: 10,
	},
	{
		domainId: "backend",
		roots: ["backend", "dotnet"],
		maxChildrenPerRoot: 10,
	},
	{
		domainId: "data",
		roots: ["src/supabase", "supabase", "backend/supabase"],
		maxChildrenPerRoot: 10,
	},
	{
		domainId: "agent",
		roots: [
			"src/routes/agent",
			"src/services/agentService.ts",
			"zeroclaw-main/src",
		],
		maxChildrenPerRoot: 10,
	},
	{
		domainId: "docs",
		roots: ["docs", "scripts", ".env.example", "package.json"],
		maxChildrenPerRoot: 10,
	},
];

const HOTSPOT_ROOTS = ["src", "backend", "zeroclaw-main/src"];
const HOTSPOT_LIMIT = 25;

const SKIP_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"bin",
	"obj",
	"target",
	"coverage",
	".next",
	".turbo",
	".venv",
	"venv",
	"__pycache__",
	".pytest_cache",
	".idea",
	".vscode",
]);

const TEXT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".css",
	".scss",
	".html",
	".md",
	".txt",
	".py",
	".cs",
	".csproj",
	".sln",
	".props",
	".targets",
	".sql",
	".rs",
	".toml",
	".yaml",
	".yml",
	".sh",
	".ps1",
	".cmd",
	".bat",
]);

function runBiomeWrite(relativeOutput) {
	const isWindows = process.platform === "win32";
	const attempts = [
		{
			command: "npx",
			args: ["biome", "check", "--write", relativeOutput],
		},
		{
			command: "npm",
			args: ["exec", "--", "biome", "check", "--write", relativeOutput],
		},
	];

	for (const attempt of attempts) {
		const result = spawnSync(attempt.command, attempt.args, {
			cwd: repoRoot,
			stdio: "ignore",
			shell: isWindows,
		});
		if (!result.error && result.status === 0) {
			return true;
		}
	}

	return false;
}

function toPosix(relPath) {
	return relPath.split(path.sep).join("/");
}

function relFromRoot(absPath) {
	return toPosix(path.relative(repoRoot, absPath));
}

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function safeSummary(fileCount, lineCount) {
	return `${fileCount} file${fileCount === 1 ? "" : "s"}, ${lineCount.toLocaleString()} line${lineCount === 1 ? "" : "s"}`;
}

function toTsLiteral(value, indentLevel = 0) {
	const indent = "\t".repeat(indentLevel);
	const childIndent = "\t".repeat(indentLevel + 1);

	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value
			.map((entry) => `${childIndent}${toTsLiteral(entry, indentLevel + 1)},`)
			.join("\n");
		return `[\n${items}\n${indent}]`;
	}

	const entries = Object.entries(value);
	if (entries.length === 0) return "{}";
	const objectBody = entries
		.map(([key, entryValue]) => {
			const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
				? key
				: JSON.stringify(key);
			return `${childIndent}${safeKey}: ${toTsLiteral(entryValue, indentLevel + 1)},`;
		})
		.join("\n");
	return `{\n${objectBody}\n${indent}}`;
}

async function exists(absPath) {
	try {
		await fs.access(absPath);
		return true;
	} catch {
		return false;
	}
}

async function statSafe(absPath) {
	try {
		return await fs.stat(absPath);
	} catch {
		return null;
	}
}

function shouldTrackSnapshotInput(absPath) {
	const base = path.basename(absPath);
	if (base === ".env.example" || base === "package.json") return true;
	return TEXT_EXTENSIONS.has(path.extname(absPath).toLowerCase());
}

async function readTextLineCount(absPath) {
	const ext = path.extname(absPath).toLowerCase();
	if (!TEXT_EXTENSIONS.has(ext)) return 0;
	const stat = await statSafe(absPath);
	if (!stat || stat.size > 2_000_000) return 0;
	try {
		const content = await fs.readFile(absPath, "utf8");
		if (!content) return 0;
		const normalized = content.replace(/\r\n/g, "\n");
		return normalized.split("\n").length;
	} catch {
		return 0;
	}
}

async function readTextSafe(absPath, options = {}) {
	const maxBytes = Number(options.maxBytes) || 4_000_000;
	const ext = path.extname(absPath).toLowerCase();
	if (!TEXT_EXTENSIONS.has(ext)) return "";
	const stat = await statSafe(absPath);
	if (!stat?.isFile() || stat.size > maxBytes) return "";
	try {
		return await fs.readFile(absPath, "utf8");
	} catch {
		return "";
	}
}

function countRegexMatches(text, regex) {
	if (!text) return 0;
	return (text.match(regex) ?? []).length;
}

async function walkFiles(absRoot) {
	const files = [];
	const stack = [absRoot];

	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				if (entry.name !== ".env.example") continue;
			}
			const child = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				stack.push(child);
				continue;
			}
			if (entry.isFile()) files.push(child);
		}
	}

	return files;
}

async function newestMtimeForPath(absPath) {
	const stat = await statSafe(absPath);
	if (!stat) return 0;
	if (stat.isFile()) {
		return shouldTrackSnapshotInput(absPath) ? stat.mtimeMs : 0;
	}
	if (!stat.isDirectory()) return 0;

	let newest = 0;
	const stack = [absPath];
	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		let entries = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

			const childAbs = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(childAbs);
				continue;
			}
			if (!entry.isFile() || !shouldTrackSnapshotInput(childAbs)) continue;

			const childStat = await statSafe(childAbs);
			if (childStat?.isFile()) {
				newest = Math.max(newest, childStat.mtimeMs);
			}
		}
	}

	return newest;
}

async function newestSnapshotInputMtimeMs() {
	let newest = 0;
	for (const relPath of SNAPSHOT_INPUT_ROOTS) {
		const absPath = path.join(repoRoot, relPath);
		newest = Math.max(newest, await newestMtimeForPath(absPath));
	}
	return newest;
}

async function countFilesAndLines(absPath) {
	const stat = await statSafe(absPath);
	if (!stat) return { fileCount: 0, lineCount: 0 };
	if (stat.isFile()) {
		return { fileCount: 1, lineCount: await readTextLineCount(absPath) };
	}
	const files = await walkFiles(absPath);
	let lineCount = 0;
	for (const file of files) {
		lineCount += await readTextLineCount(file);
	}
	return { fileCount: files.length, lineCount };
}

async function buildAutoModules() {
	const modules = [];

	for (const domain of DOMAIN_ROOTS) {
		for (const relRoot of domain.roots) {
			const absRoot = path.join(repoRoot, relRoot);
			if (!(await exists(absRoot))) continue;
			const rootStats = await countFilesAndLines(absRoot);
			modules.push({
				id: `auto-${domain.domainId}-${slugify(relRoot)}-root`,
				domainId: domain.domainId,
				label: `${path.basename(relRoot)} (root)`,
				path: relRoot,
				summary: `Auto-discovered root: ${safeSummary(rootStats.fileCount, rootStats.lineCount)}.`,
				fileCount: rootStats.fileCount,
				lineCount: rootStats.lineCount,
				source: "auto",
			});

			const rootStat = await statSafe(absRoot);
			if (!rootStat?.isDirectory()) continue;

			let entries = [];
			try {
				entries = await fs.readdir(absRoot, { withFileTypes: true });
			} catch {
				entries = [];
			}

			const rankedChildren = [];
			for (const entry of entries) {
				if (entry.name.startsWith(".")) continue;
				if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
				const childAbs = path.join(absRoot, entry.name);
				const childRel = relFromRoot(childAbs);
				const stats = await countFilesAndLines(childAbs);
				if (stats.fileCount === 0) continue;
				rankedChildren.push({
					relPath: childRel,
					name: entry.name,
					fileCount: stats.fileCount,
					lineCount: stats.lineCount,
				});
			}

			rankedChildren.sort((a, b) => {
				if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
				if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
				return a.relPath.localeCompare(b.relPath);
			});

			for (const child of rankedChildren.slice(0, domain.maxChildrenPerRoot)) {
				modules.push({
					id: `auto-${domain.domainId}-${slugify(child.relPath)}`,
					domainId: domain.domainId,
					label: child.name,
					path: child.relPath,
					summary: `Auto-discovered module: ${safeSummary(child.fileCount, child.lineCount)}.`,
					fileCount: child.fileCount,
					lineCount: child.lineCount,
					source: "auto",
				});
			}
		}
	}

	return modules;
}

async function buildHotspots() {
	const hotspots = [];

	for (const relRoot of HOTSPOT_ROOTS) {
		const absRoot = path.join(repoRoot, relRoot);
		const stat = await statSafe(absRoot);
		if (!stat?.isDirectory()) continue;
		const files = await walkFiles(absRoot);
		for (const absFile of files) {
			const lineCount = await readTextLineCount(absFile);
			if (!lineCount) continue;
			hotspots.push({
				path: relFromRoot(absFile),
				lines: lineCount,
			});
		}
	}

	hotspots.sort((a, b) => {
		if (b.lines !== a.lines) return b.lines - a.lines;
		return a.path.localeCompare(b.path);
	});

	return hotspots.slice(0, HOTSPOT_LIMIT);
}

async function buildBatchFindReplaceDetails() {
	const moduleDir = path.join(
		repoRoot,
		"src/components/apps/Batch_find_and_replace",
	);
	const routeFile = path.join(
		repoRoot,
		"src/routes/apps/batch-find-replace/BatchFindReplaceRoutePage.tsx",
	);
	const routeGroupFile = path.join(
		repoRoot,
		"backend/route_groups/api_batch_find_replace.py",
	);
	const registryFile = path.join(repoRoot, "backend/route_groups/api_registry.py");
	const backendFile = path.join(repoRoot, "backend/api_server.py");

	let moduleFiles = [];
	const moduleStat = await statSafe(moduleDir);
	if (moduleStat?.isDirectory()) {
		const files = await walkFiles(moduleDir);
		for (const absFile of files) {
			moduleFiles.push({
				path: relFromRoot(absFile),
				lines: await readTextLineCount(absFile),
			});
		}
		moduleFiles.sort((a, b) => {
			if (b.lines !== a.lines) return b.lines - a.lines;
			return a.path.localeCompare(b.path);
		});
	}

	let backendRouteCount = 0;
	const routeGroupText = await readTextSafe(routeGroupFile);
	if (routeGroupText) {
		backendRouteCount += countRegexMatches(
			routeGroupText,
			/@bp\.route\(\s*["'][^"']+["']/g,
		);
		if (
			routeGroupText.includes('url_prefix="/api/batch-find-replace"') ||
			routeGroupText.includes("url_prefix='/api/batch-find-replace'")
		) {
			backendRouteCount += 1;
		}
	}
	backendRouteCount += countRegexMatches(
		await readTextSafe(registryFile),
		/create_batch_find_replace_blueprint/g,
	);
	backendRouteCount += countRegexMatches(
		await readTextSafe(backendFile),
		/\/api\/batch-find-replace(?:\/|["'])/g,
	);

	return {
		moduleDir: relFromRoot(moduleDir),
		routeFile: relFromRoot(routeFile),
		moduleFileCount: moduleFiles.length,
		moduleFiles,
		backendRouteCount,
		namingNote:
			"The module folder uses `Batch_find_and_replace` while route slugs use `batch-find-replace`.",
	};
}

async function buildBackupRouteStatus() {
	const backupRouteGroupFile = path.join(
		repoRoot,
		"backend/route_groups/api_backup.py",
	);
	const registryFile = path.join(repoRoot, "backend/route_groups/api_registry.py");
	const backendFile = path.join(repoRoot, "backend/api_server.py");

	const routeGroupText = await readTextSafe(backupRouteGroupFile);
	const hasBackupPrefix =
		routeGroupText.includes('url_prefix="/api/backup"') ||
		routeGroupText.includes("url_prefix='/api/backup'");
	const backupHandlers = ["/save", "/list", "/read", "/delete"];
	const hasBackupHandlers = backupHandlers.every(
		(routePath) =>
			routeGroupText.includes(`@bp.route("${routePath}"`) ||
			routeGroupText.includes(`@bp.route('${routePath}'`),
	);
	if (hasBackupPrefix && hasBackupHandlers) {
		return { routeImplemented: true };
	}

	const legacyImplemented = /\/api\/backup\/(save|list|read|delete)/.test(
		await readTextSafe(backendFile),
	);
	const registryImplemented = /create_backup_blueprint/.test(
		await readTextSafe(registryFile),
	);
	return {
		routeImplemented: hasBackupPrefix || legacyImplemented || registryImplemented,
	};
}

async function main() {
	const [modules, hotspots, batchFindReplace, backupRoutes] = await Promise.all(
		[
			buildAutoModules(),
			buildHotspots(),
			buildBatchFindReplaceDetails(),
			buildBackupRouteStatus(),
		],
	);

	const payload = {
		generatedAt: new Date().toISOString(),
		modules,
		hotspots,
		batchFindReplace,
		backupRoutes,
	};

	const content = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated by: scripts/generate-architecture-model.mjs

export const ARCHITECTURE_SNAPSHOT = ${toTsLiteral(payload)} as const;
`;

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, content, "utf8");

	const relativeOutput = relFromRoot(outputPath);
	if (!runBiomeWrite(relativeOutput)) {
		console.warn(
			`Warning: unable to auto-format ${relativeOutput}. Run \`npx biome check --write ${relativeOutput}\` manually.`,
		);
	}

	const newestInputMtime = await newestSnapshotInputMtimeMs();
	const touchedAt = new Date(Math.max(Date.now(), newestInputMtime + 1000));
	await fs.utimes(outputPath, touchedAt, touchedAt);

	console.log(`Architecture snapshot generated at ${relativeOutput}`);
	console.log(
		`Modules: ${modules.length}, hotspots: ${hotspots.length}, batch files: ${batchFindReplace.moduleFileCount}`,
	);
}

main().catch((error) => {
	console.error("Failed to generate architecture snapshot:", error);
	process.exitCode = 1;
});
