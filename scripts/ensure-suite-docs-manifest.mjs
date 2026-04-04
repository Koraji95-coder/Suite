#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const generatorPath = path.join(repoRoot, "scripts", "generate-suite-docs-manifest.mjs");
const outputPath = path.join(
	repoRoot,
	"src",
	"routes",
	"developer",
	"control",
	"modules",
	"generated",
	"developerDocsManifest.generated.json",
);
const verifyOnly = process.argv.includes("--verify");

const SKIP_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
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

const WATCH_EXTENSIONS = new Set([".md", ".mdx"]);

async function statSafe(targetPath) {
	try {
		return await fs.stat(targetPath);
	} catch {
		return null;
	}
}

function shouldTrackFile(targetPath) {
	return WATCH_EXTENSIONS.has(path.extname(targetPath).toLowerCase());
}

async function newestDocsMtimeMs(rootPath) {
	const rootStat = await statSafe(rootPath);
	if (!rootStat?.isDirectory()) {
		return 0;
	}

	let newest = 0;
	const stack = [rootPath];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		let entries = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
				continue;
			}

			const nextPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(nextPath);
				continue;
			}
			if (!entry.isFile() || !shouldTrackFile(nextPath)) {
				continue;
			}

			const fileStat = await statSafe(nextPath);
			if (fileStat?.isFile()) {
				newest = Math.max(newest, fileStat.mtimeMs);
			}
		}
	}

	return newest;
}

function runDocsManifestGenerator() {
	const result = spawnSync("node", ["scripts/generate-suite-docs-manifest.mjs"], {
		cwd: repoRoot,
		stdio: "inherit",
	});
	if (typeof result.status === "number" && result.status !== 0) {
		process.exit(result.status);
	}
	if (result.error) {
		console.error("Failed to run docs manifest generator:", result.error);
		process.exit(1);
	}
}

async function main() {
	const outputStat = await statSafe(outputPath);
	if (!outputStat?.isFile()) {
		if (verifyOnly) {
			console.error(
				"Developer docs manifest is missing. Run `npm run docs:manifest` and commit the updated manifest.",
			);
			process.exit(1);
		}
		console.log("Developer docs manifest is missing. Generating...");
		runDocsManifestGenerator();
		return;
	}

	const newestDocsMtime = await newestDocsMtimeMs(docsRoot);
	const generatorStat = await statSafe(generatorPath);
	const newestInputMtime = Math.max(
		newestDocsMtime,
		generatorStat?.mtimeMs ?? 0,
	);

	if (newestInputMtime > outputStat.mtimeMs) {
		if (verifyOnly) {
			console.error(
				"Developer docs manifest is stale. Run `npm run docs:manifest` and commit the updated manifest.",
			);
			process.exit(1);
		}
		console.log("Developer docs manifest is stale. Regenerating...");
		runDocsManifestGenerator();
		return;
	}

	console.log("Developer docs manifest is up to date.");
}

main().catch((error) => {
	console.error("Failed to ensure developer docs manifest:", error);
	process.exit(1);
});
