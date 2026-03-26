#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const preservedPlaywrightAuthFiles = [
	path.join(repoRoot, "output", "playwright", "auth-state.json"),
	path.join(repoRoot, "output", "playwright", "auth-state.meta.json"),
];

function parseArgs(argv) {
	const options = {
		dryRun: false,
		includePlaywrightAuth: false,
	};

	for (const arg of argv) {
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--include-playwright-auth") {
			options.includePlaywrightAuth = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function printHelp() {
	console.log(
		[
			"Clean local scratch/build artifacts without touching repo-tracked files.",
			"",
			"Usage:",
			"  node scripts/clean-local.mjs [--dry-run] [--include-playwright-auth]",
			"",
			"Options:",
			"  --dry-run                  Show what would be removed.",
			"  --include-playwright-auth Remove output/playwright auth-state files too.",
		].join("\n"),
	);
}

function pathExists(targetPath) {
	return fs.existsSync(targetPath);
}

function statSafe(targetPath) {
	try {
		return fs.lstatSync(targetPath);
	} catch {
		return null;
	}
}

function isDirectory(targetPath) {
	const stat = statSafe(targetPath);
	return Boolean(stat?.isDirectory());
}

function formatBytes(bytes) {
	if (bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let index = 0;
	while (value >= 1024 && index < units.length - 1) {
		value /= 1024;
		index += 1;
	}
	return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function measureBytes(targetPath) {
	const stat = statSafe(targetPath);
	if (!stat || stat.isSymbolicLink()) return 0;
	if (stat.isFile()) return stat.size;
	if (!stat.isDirectory()) return 0;

	let total = 0;
	for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
		total += measureBytes(path.join(targetPath, entry.name));
	}
	return total;
}

function collectDotnetArtifactDirectories(rootDirectory) {
	const results = [];
	const dotnetRoot = path.join(rootDirectory, "dotnet");
	if (!isDirectory(dotnetRoot)) return results;

	const stack = [dotnetRoot];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;

		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const absolutePath = path.join(current, entry.name);
			if (entry.name === "bin" || entry.name === "obj" || entry.name === "artifacts") {
				results.push(absolutePath);
				continue;
			}
			stack.push(absolutePath);
		}
	}

	return results;
}

function collectOutputFiles(rootDirectory, includePlaywrightAuth) {
	const outputRoot = path.join(rootDirectory, "output");
	if (!isDirectory(outputRoot)) return [];

	const preserved = new Set(
		includePlaywrightAuth ? [] : preservedPlaywrightAuthFiles.map((entry) => path.normalize(entry)),
	);
	const removableFiles = [];
	const stack = [outputRoot];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;

		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}
			if (preserved.has(path.normalize(absolutePath))) {
				continue;
			}
			removableFiles.push(absolutePath);
		}
	}

	return removableFiles;
}

function pruneEmptyDirectories(rootDirectory) {
	if (!isDirectory(rootDirectory)) return;

	for (const entry of fs.readdirSync(rootDirectory, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const absolutePath = path.join(rootDirectory, entry.name);
		pruneEmptyDirectories(absolutePath);
	}

	if (rootDirectory === path.join(repoRoot, "output")) {
		return;
	}

	const remainingEntries = fs.readdirSync(rootDirectory);
	if (remainingEntries.length === 0) {
		fs.rmSync(rootDirectory, { recursive: true, force: true });
	}
}

function uniqueTargets(targets) {
	const seen = new Set();
	return targets.filter((target) => {
		const normalized = path.normalize(target.absolutePath);
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

function buildTargets(options) {
	const targets = [];
	const rootDirectoryTargets = [
		"dist",
		"dist-ssr",
		"test-results",
		".playwright-cli",
		".codex-runtime",
	];

	for (const relativePath of rootDirectoryTargets) {
		const absolutePath = path.join(repoRoot, relativePath);
		if (!pathExists(absolutePath)) continue;
		targets.push({
			absolutePath,
			relativePath,
			type: "directory",
			bytes: measureBytes(absolutePath),
		});
	}

	const runLogsDirectory = path.join(repoRoot, ".runlogs");
	if (isDirectory(runLogsDirectory)) {
		for (const entry of fs.readdirSync(runLogsDirectory, { withFileTypes: true })) {
			const absolutePath = path.join(runLogsDirectory, entry.name);
			targets.push({
				absolutePath,
				relativePath: path.relative(repoRoot, absolutePath),
				type: entry.isDirectory() ? "directory" : "file",
				bytes: measureBytes(absolutePath),
			});
		}
	}

	for (const absolutePath of collectDotnetArtifactDirectories(repoRoot)) {
		targets.push({
			absolutePath,
			relativePath: path.relative(repoRoot, absolutePath),
			type: "directory",
			bytes: measureBytes(absolutePath),
		});
	}

	for (const absolutePath of collectOutputFiles(repoRoot, options.includePlaywrightAuth)) {
		targets.push({
			absolutePath,
			relativePath: path.relative(repoRoot, absolutePath),
			type: "file",
			bytes: measureBytes(absolutePath),
		});
	}

	return uniqueTargets(targets);
}

function buildPreservationList(options) {
	const items = [
		".env",
		".worktale",
		"supabase/.temp",
	];

	if (!options.includePlaywrightAuth) {
		items.push("output/playwright/auth-state.json");
		items.push("output/playwright/auth-state.meta.json");
	}

	return items;
}

function removeTarget(target) {
	if (target.type === "directory") {
		fs.rmSync(target.absolutePath, { recursive: true, force: true });
		return;
	}
	fs.rmSync(target.absolutePath, { force: true });
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const targets = buildTargets(options);
	const preservedItems = buildPreservationList(options);
	const totalBytes = targets.reduce((sum, target) => sum + target.bytes, 0);
	const actionLabel = options.dryRun ? "dry-run" : "ok";

	console.log(`Suite local cleanup: ${actionLabel}`);
	console.log(`- targets: ${targets.length}`);
	console.log(`- reclaimable: ${formatBytes(totalBytes)}`);

	if (targets.length > 0) {
		console.log(options.dryRun ? "Would remove:" : "Removed:");
		for (const target of targets) {
			console.log(`- ${target.relativePath} (${formatBytes(target.bytes)})`);
		}
	} else {
		console.log(options.dryRun ? "Would remove: nothing" : "Removed: nothing");
	}

	console.log("Preserving:");
	for (const item of preservedItems) {
		console.log(`- ${item}`);
	}

	if (options.dryRun) {
		return;
	}

	for (const target of targets) {
		removeTarget(target);
	}

	pruneEmptyDirectories(path.join(repoRoot, "output"));
}

try {
	main();
} catch (error) {
	console.error(`clean-local failed: ${error.message}`);
	process.exit(1);
}
