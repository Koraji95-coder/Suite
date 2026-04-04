#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const lockTargets = [
	{
		label: "backend-api",
		relativePath: "backend/requirements-api.lock.txt",
	},
	{
		label: "transmittal-builder",
		relativePath: "backend/Transmittal-Builder/requirements.lock.txt",
	},
];
const ignoredPackages = new Set(["pip", "setuptools", "wheel"]);

function getPythonInvocation() {
	const configured = (process.env.SUITE_PYTHON_BIN || "").trim();
	if (configured) {
		return { argsPrefix: [], command: configured };
	}
	if (process.platform === "win32") {
		return { argsPrefix: ["-3.14"], command: "py" };
	}
	return { argsPrefix: [], command: "python" };
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	if (result.error) {
		throw result.error;
	}
	return result;
}

function runChecked(command, args, context, allowStatuses = [0]) {
	const result = run(command, args);
	if (!allowStatuses.includes(result.status ?? 1)) {
		const message = result.stderr.trim() || result.stdout.trim() || context;
		throw new Error(message);
	}
	return result;
}

function resolveVenvPython(tempDir) {
	return process.platform === "win32"
		? path.join(tempDir, "Scripts", "python.exe")
		: path.join(tempDir, "bin", "python");
}

function formatUpdates(updates) {
	if (updates.length === 0) {
		return "  - no newer releases detected";
	}
	return updates
		.map(
			(update) =>
				`  - ${update.name}: ${update.version} -> ${update.latest_version} (${update.latest_filetype})`,
		)
		.join("\n");
}

const pythonInvocation = getPythonInvocation();

try {
	const versionProbe = runChecked(
		pythonInvocation.command,
		[...pythonInvocation.argsPrefix, "--version"],
		"python-updates: failed to probe python version",
	);
	const versionText =
		versionProbe.stdout.trim() ||
		versionProbe.stderr.trim() ||
		pythonInvocation.command;
	console.log(`python-updates: using ${versionText}`);
} catch (error) {
	console.error(`python-updates: ${error.message}`);
	process.exit(1);
}

let totalUpdates = 0;

for (const target of lockTargets) {
	const lockfile = path.join(repoRoot, target.relativePath);
	if (!fs.existsSync(lockfile)) {
		console.error(`python-updates: missing lockfile ${target.relativePath}`);
		process.exit(1);
	}

	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), `suite-python-updates-${target.label}-`),
	);
	const venvPython = resolveVenvPython(tempDir);

	try {
		console.log(`python-updates: checking ${target.label}...`);
		runChecked(
			pythonInvocation.command,
			[...pythonInvocation.argsPrefix, "-m", "venv", tempDir],
			`python-updates: failed to create venv for ${target.label}`,
		);
		runChecked(
			venvPython,
			["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "--upgrade", "pip"],
			`python-updates: failed to upgrade pip for ${target.label}`,
		);
		runChecked(
			venvPython,
			[
				"-m",
				"pip",
				"install",
				"--disable-pip-version-check",
				"--quiet",
				"-r",
				lockfile,
			],
			`python-updates: failed to install lockfile for ${target.label}`,
		);
		const outdatedResult = runChecked(
			venvPython,
			["-m", "pip", "list", "--outdated", "--format=json"],
			`python-updates: failed to inspect updates for ${target.label}`,
		);
		const raw = outdatedResult.stdout.trim();
		const updates = (raw ? JSON.parse(raw) : [])
			.filter((item) => !ignoredPackages.has(item.name.toLowerCase()))
			.sort((left, right) => left.name.localeCompare(right.name));
		totalUpdates += updates.length;
		console.log("%s", formatUpdates(updates));
	} catch (error) {
		console.error(`python-updates: ${error.message}`);
		process.exitCode = 1;
		break;
	} finally {
		fs.rmSync(tempDir, { force: true, recursive: true });
	}
}

if (process.exitCode && process.exitCode !== 0) {
	process.exit(process.exitCode);
}

if (totalUpdates === 0) {
	console.log("python-updates: no newer Python package releases detected.");
	process.exit(0);
}

console.log(
	`python-updates: ${totalUpdates} Python package${totalUpdates === 1 ? "" : "s"} have newer releases available across the locked environments.`,
);
