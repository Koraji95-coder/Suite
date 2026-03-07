#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const host = (process.env.AGENT_GATEWAY_HOST || "").trim() || "127.0.0.1";
const port = (process.env.AGENT_GATEWAY_PORT || "").trim() || "3000";
const forwardedArgs = process.argv.slice(2);
const gatewayArgs =
	forwardedArgs.length > 0
		? ["gateway", ...forwardedArgs]
		: ["gateway", "--host", host, "--port", port];
const executableExt = process.platform === "win32" ? ".exe" : "";
const userHome = process.env.USERPROFILE || process.env.HOME || "";
const cargoBinDir = userHome ? path.join(userHome, ".cargo", "bin") : "";
const userCargoPath = cargoBinDir
	? path.join(cargoBinDir, `cargo${executableExt}`)
	: "";
const userZeroclawPath = cargoBinDir
	? path.join(cargoBinDir, `zeroclaw${executableExt}`)
	: "";

function fileExists(relativePath) {
	return fs.existsSync(path.join(repoRoot, relativePath));
}

function commandExists(command) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [command], { stdio: "ignore" })
			: spawnSync("which", [command], { stdio: "ignore" });
	return probe.status === 0;
}

function launch(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		...options,
	});

	child.on("error", (error) => {
		console.error(`Failed to start gateway command "${command}": ${error.message}`);
		process.exit(1);
	});

	child.on("exit", (code, signal) => {
		if (typeof code === "number") {
			process.exit(code);
			return;
		}
		if (signal) {
			console.error(`Gateway process terminated by signal: ${signal}`);
			process.exit(1);
			return;
		}
		process.exit(0);
	});
}

const binaryName = process.platform === "win32" ? "zeroclaw.exe" : "zeroclaw";
const localBinaryCandidates = [
	binaryName,
	path.join("zeroclaw-main", "target", "release", binaryName),
	path.join("zeroclaw-main", "target", "debug", binaryName),
];

const fallbackWebDistHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ZeroClaw Dashboard</title>
  </head>
  <body>
    <h1>ZeroClaw Dashboard Unavailable</h1>
    <p>Frontend assets are not bundled in this checkout. Build zeroclaw-main/web to populate web/dist.</p>
  </body>
</html>
`;

function ensureEmbeddedWebAssets() {
	const distDir = path.join(repoRoot, "zeroclaw-main", "web", "dist");
	const indexPath = path.join(distDir, "index.html");
	if (fs.existsSync(indexPath)) {
		return;
	}

	fs.mkdirSync(distDir, { recursive: true });
	fs.writeFileSync(indexPath, fallbackWebDistHtml, "utf8");
	console.warn(
		"Missing zeroclaw-main/web/dist/index.html; generated a placeholder so gateway can compile.",
	);
}

function withCargoWorkarounds() {
	const env = { ...process.env };

	// On some Windows setups (including this repo checkout), Cargo target directories
	// can inherit a read-only attribute that breaks autocfg/num-traits build scripts.
	if (process.platform === "win32" && !env.CARGO_TARGET_DIR) {
		env.CARGO_TARGET_DIR = path.join(repoRoot, "zeroclaw-main", "target-local");
	}

	// The zeroclaw binary can overflow the default Windows main-thread stack in debug builds.
	// Increase linker stack size when launching from source to keep local dev stable.
	if (process.platform === "win32") {
		const stackLinkArg = "-C link-arg=/STACK:33554432";
		const existingRustFlags = (env.RUSTFLAGS || "").trim();
		if (!existingRustFlags.includes("/STACK:")) {
			env.RUSTFLAGS = existingRustFlags
				? `${existingRustFlags} ${stackLinkArg}`
				: stackLinkArg;
		}
	}

	return env;
}

function main() {
	for (const candidate of localBinaryCandidates) {
		if (fileExists(candidate)) {
			launch(path.join(repoRoot, candidate), gatewayArgs);
			return;
		}
	}

	if (commandExists("zeroclaw")) {
		launch("zeroclaw", gatewayArgs);
		return;
	}
	if (userZeroclawPath && fs.existsSync(userZeroclawPath)) {
		launch(userZeroclawPath, gatewayArgs);
		return;
	}

	const manifestPath = path.join(repoRoot, "zeroclaw-main", "Cargo.toml");
	if (fs.existsSync(manifestPath)) {
		const cargoCommand =
			commandExists("cargo")
				? "cargo"
				: userCargoPath && fs.existsSync(userCargoPath)
					? userCargoPath
					: null;
		if (!cargoCommand) {
			console.error(
				"Unable to start gateway. `zeroclaw` command not found and `cargo` is unavailable.",
			);
			process.exit(1);
		}

		ensureEmbeddedWebAssets();
		launch(cargoCommand, [
			"run",
			"--manifest-path",
			manifestPath,
			"--",
			...gatewayArgs,
		], { env: withCargoWorkarounds() });
		return;
	}

	console.error(
		"Unable to start gateway. Install `zeroclaw`, build zeroclaw-main, or ensure zeroclaw-main/Cargo.toml exists.",
	);
	process.exit(1);
}

main();
