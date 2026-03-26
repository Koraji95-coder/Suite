#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const snapshotPath = path.join(
	repoRoot,
	"src/data/architectureSnapshot.generated.ts",
);
const verifyOnly = process.argv.includes("--verify");

const INPUT_ROOTS = [
	"src/routes",
	"src/components/apps",
	"src/auth",
	"src/services",
	"backend",
	"dotnet",
	"src/supabase",
	"supabase",
	"backend/supabase",
	"docs",
	"scripts",
	".env.example",
	"package.json",
];

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

const WATCH_EXTENSIONS = new Set([
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

async function statSafe(absPath) {
	try {
		return await fs.stat(absPath);
	} catch {
		return null;
	}
}

function shouldTrackFile(absPath) {
	const base = path.basename(absPath);
	if (base === ".env.example" || base === "package.json") return true;
	return WATCH_EXTENSIONS.has(path.extname(absPath).toLowerCase());
}

async function newestMtimeForPath(absPath) {
	const stat = await statSafe(absPath);
	if (!stat) return 0;
	if (stat.isFile()) {
		return shouldTrackFile(absPath) ? stat.mtimeMs : 0;
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
			if (!entry.isFile() || !shouldTrackFile(childAbs)) continue;

			const childStat = await statSafe(childAbs);
			if (childStat?.isFile()) {
				newest = Math.max(newest, childStat.mtimeMs);
			}
		}
	}

	return newest;
}

async function newestInputMtimeMs() {
	let newest = 0;
	for (const relPath of INPUT_ROOTS) {
		const absPath = path.join(repoRoot, relPath);
		newest = Math.max(newest, await newestMtimeForPath(absPath));
	}
	return newest;
}

function runArchitectureGenerator() {
	const result = spawnSync("node", ["scripts/generate-architecture-model.mjs"], {
		cwd: repoRoot,
		stdio: "inherit",
	});
	if (typeof result.status === "number" && result.status !== 0) {
		process.exit(result.status);
	}
	if (result.error) {
		console.error("Failed to run architecture generator:", result.error);
		process.exit(1);
	}
}

async function main() {
	const snapshotStat = await statSafe(snapshotPath);
	if (!snapshotStat?.isFile()) {
		if (verifyOnly) {
			console.error(
				"Architecture snapshot is missing. Run `npm run arch:generate` and commit the updated snapshot.",
			);
			process.exit(1);
		}
		console.log("Architecture snapshot missing. Generating...");
		runArchitectureGenerator();
		return;
	}

	const newestInput = await newestInputMtimeMs();
	if (newestInput > snapshotStat.mtimeMs) {
		if (verifyOnly) {
			console.error(
				"Architecture snapshot is stale. Run `npm run arch:generate` and commit the updated snapshot.",
			);
			process.exit(1);
		}
		console.log("Architecture snapshot is stale. Regenerating...");
		runArchitectureGenerator();
		return;
	}

	console.log("Architecture snapshot is up to date.");
}

main().catch((error) => {
	console.error("Failed to ensure architecture snapshot:", error);
	process.exit(1);
});
