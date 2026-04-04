#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const [rawMode, ...rawForwardedArgs] = process.argv.slice(2);
const forwardedArgs =
	rawForwardedArgs[0] === "--" ? rawForwardedArgs.slice(1) : rawForwardedArgs;

const modeSteps = {
	dev: [
		{
			label: "docs manifest ensure",
			args: ["scripts/ensure-suite-docs-manifest.mjs"],
		},
		{
			label: "architecture ensure",
			args: ["scripts/ensure-architecture-model.mjs"],
		},
		{
			label: "vite dev",
			args: [
				path.join("node_modules", "vite", "bin", "vite.js"),
				...forwardedArgs,
			],
		},
	],
	build: [
		{
			label: "docs manifest generate",
			args: ["scripts/generate-suite-docs-manifest.mjs"],
		},
		{
			label: "architecture ensure",
			args: ["scripts/ensure-architecture-model.mjs"],
		},
		{
			label: "vite build",
			args: [
				path.join("node_modules", "vite", "bin", "vite.js"),
				"build",
				...forwardedArgs,
			],
		},
	],
};

function printUsage() {
	console.error(
		[
			"Usage: node scripts/run-frontend-pipeline.mjs <dev|build> [vite args...]",
			"",
			"Examples:",
			"  node scripts/run-frontend-pipeline.mjs dev --host 127.0.0.1",
			"  node scripts/run-frontend-pipeline.mjs build --mode production",
		].join("\n"),
	);
}

function isHelpFlag(value) {
	return value === "--help" || value === "-h";
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

async function main() {
	if (!rawMode || isHelpFlag(rawMode)) {
		printUsage();
		process.exit(rawMode ? 0 : 1);
	}

	const steps = modeSteps[rawMode];
	if (!steps) {
		console.error(`[frontend-pipeline] Unsupported mode: ${rawMode}`);
		printUsage();
		process.exit(1);
	}

	// Avoid nested `npm run ... && ...` shell wrappers so the frontend pipeline stays off DEP0190.
	for (const step of steps) {
		const result = await runNodeStep(step.label, step.args);
		if (result.signal) {
			if (result.signalForwarded) {
				process.exit(0);
			}
			console.error(
				`[frontend-pipeline] ${result.label} exited via signal ${result.signal}.`,
			);
			process.exit(1);
		}
		if (result.code !== 0) {
			process.exit(result.code);
		}
	}
}

await main();
