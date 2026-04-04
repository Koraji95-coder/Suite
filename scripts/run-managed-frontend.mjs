#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const viteBinPath = path.join("node_modules", "vite", "bin", "vite.js");
const distIndexPath = path.join(repoRoot, "dist", "index.html");

const rawArgs = process.argv.slice(2);
const showHelp =
	rawArgs.includes("--help") || rawArgs.includes("-h") || rawArgs.includes("/?");
const prepareOnly = rawArgs.includes("--prepare-only");
const forceBuild = rawArgs.includes("--force-build");
const forwardedArgs = rawArgs.filter(
	(argument) => argument !== "--prepare-only" && argument !== "--force-build",
);

const INPUT_PATHS = [
	".env",
	".env.local",
	".env.development",
	".env.development.local",
	".env.production",
	".env.production.local",
	"index.html",
	"package.json",
	"package-lock.json",
	"tsconfig.app.json",
	"tsconfig.json",
	"vite.config.ts",
	"vite.proxy-targets.ts",
	"src",
	"public",
	"src/data/architectureSnapshot.generated.ts",
	"src/routes/developer/control/modules/generated/developerDocsManifest.generated.json",
];

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
	"bin",
	"obj",
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
	".mdx",
]);

function printUsage() {
	console.log(
		[
			"Usage: node scripts/run-managed-frontend.mjs [options] [vite preview args...]",
			"",
			"Options:",
			"  --prepare-only   Ensure generated inputs and build output, then exit.",
			"  --force-build    Rebuild even when dist/index.html is newer than tracked inputs.",
			"  --help, -h, /?   Show this help text.",
			"",
			"Examples:",
			"  node scripts/run-managed-frontend.mjs --host 0.0.0.0 --port 5173 --strictPort",
			"  node scripts/run-managed-frontend.mjs --prepare-only",
		].join("\n"),
	);
}

function isHelpFlag(value) {
	return value === "--help" || value === "-h" || value === "/?";
}

function runNodeStep(label, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, {
			cwd: repoRoot,
			env: process.env,
			shell: false,
			stdio: "inherit",
		});

		let signalForwarded = false;
		const forwardSignal = (signal) => {
			signalForwarded = true;
			if (!child.killed) {
				try {
					child.kill(signal);
				} catch {
					// Ignore signal forwarding failures and wait for the child to exit.
				}
			}
		};
		const handleSigint = () => forwardSignal("SIGINT");
		const handleSigterm = () => forwardSignal("SIGTERM");
		const cleanup = () => {
			process.removeListener("SIGINT", handleSigint);
			process.removeListener("SIGTERM", handleSigterm);
		};

		process.once("SIGINT", handleSigint);
		process.once("SIGTERM", handleSigterm);

		child.once("error", (error) => {
			cleanup();
			reject(error);
		});

		child.once("exit", (code, signal) => {
			cleanup();
			resolve({
				code: typeof code === "number" ? code : 0,
				signal,
				signalForwarded,
				label,
			});
		});
	});
}

async function runRequiredStep(label, args) {
	const result = await runNodeStep(label, args);
	if (result.signal) {
		if (result.signalForwarded) {
			process.exit(0);
		}
		console.error(
			`[managed-frontend] ${result.label} exited via signal ${result.signal}.`,
		);
		process.exit(1);
	}
	if (result.code !== 0) {
		process.exit(result.code);
	}
}

async function statSafe(absPath) {
	try {
		return await fs.stat(absPath);
	} catch {
		return null;
	}
}

function shouldTrackFile(absPath) {
	const base = path.basename(absPath);
	if (base === ".env" || base.startsWith(".env.")) {
		return true;
	}
	if (base === "package.json" || base === "package-lock.json") {
		return true;
	}
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
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;

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

			const childPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(childPath);
				continue;
			}
			if (!entry.isFile() || !shouldTrackFile(childPath)) {
				continue;
			}

			const childStat = await statSafe(childPath);
			if (childStat?.isFile()) {
				newest = Math.max(newest, childStat.mtimeMs);
			}
		}
	}

	return newest;
}

async function newestInputMtimeMs() {
	let newest = 0;
	for (const relPath of INPUT_PATHS) {
		newest = Math.max(newest, await newestMtimeForPath(path.join(repoRoot, relPath)));
	}
	return newest;
}

async function resolveBuildRequirement() {
	if (forceBuild) {
		return "forced";
	}

	const distIndexStat = await statSafe(distIndexPath);
	if (!distIndexStat?.isFile()) {
		return "missing";
	}

	const newestInput = await newestInputMtimeMs();
	if (newestInput > distIndexStat.mtimeMs) {
		return "stale";
	}

	return null;
}

async function ensureManagedFrontendBuild() {
	await runRequiredStep("docs manifest ensure", [
		"scripts/ensure-suite-docs-manifest.mjs",
	]);
	await runRequiredStep("architecture ensure", [
		"scripts/ensure-architecture-model.mjs",
	]);

	const buildRequirement = await resolveBuildRequirement();
	if (!buildRequirement) {
		console.log(
			"[managed-frontend] Existing dist output is current. Skipping frontend rebuild.",
		);
		return;
	}

	const reasonText =
		buildRequirement === "forced"
			? "Forced rebuild requested."
			: buildRequirement === "missing"
				? "Managed frontend build output is missing."
				: "Managed frontend build output is stale.";
	console.log(`[managed-frontend] ${reasonText} Running vite build...`);
	await runRequiredStep("vite build", [viteBinPath, "build"]);
}

async function main() {
	if (rawArgs.some(isHelpFlag)) {
		printUsage();
		process.exit(0);
	}

	await ensureManagedFrontendBuild();

	if (prepareOnly) {
		console.log(
			"[managed-frontend] Prepare-only mode completed. Frontend preview was not started.",
		);
		return;
	}

	const previewArgs = [viteBinPath, "preview", ...forwardedArgs];
	const result = await runNodeStep("vite preview", previewArgs);
	if (result.signal) {
		if (result.signalForwarded) {
			process.exit(0);
		}
		console.error(
			`[managed-frontend] ${result.label} exited via signal ${result.signal}.`,
		);
		process.exit(1);
	}
	if (result.code !== 0) {
		process.exit(result.code);
	}
}

main().catch((error) => {
	console.error(
		`[managed-frontend] Startup failed: ${error?.message || String(error)}`,
	);
	process.exit(1);
});
