#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv } from "./lib/env-files.mjs";

const repoRoot = process.cwd();
const runtimeEnv = { ...loadRepoEnv(repoRoot), ...process.env };

function envString(key) {
	return String(runtimeEnv[key] || "").trim();
}

const host = envString("AGENT_GATEWAY_HOST") || "127.0.0.1";
const port = envString("AGENT_GATEWAY_PORT") || "3000";
const forwardedArgs = process.argv.slice(2);
const gatewayCommandArgs =
	forwardedArgs.length > 0
		? ["gateway", ...forwardedArgs]
		: ["gateway", "--host", host, "--port", port];
const gatewayBinaryArgs =
	forwardedArgs.length > 0
		? [...forwardedArgs]
		: ["--host", host, "--port", port];
const executableExt = process.platform === "win32" ? ".exe" : "";
const userHome = runtimeEnv.USERPROFILE || runtimeEnv.HOME || "";
const cargoBinDir = userHome ? path.join(userHome, ".cargo", "bin") : "";
const userCargoPath = cargoBinDir
	? path.join(cargoBinDir, `cargo${executableExt}`)
	: "";
const userGatewayPath = cargoBinDir
	? path.join(cargoBinDir, `zeroclaw-gateway${executableExt}`)
	: "";
const userZeroclawPath = cargoBinDir
	? path.join(cargoBinDir, `zeroclaw${executableExt}`)
	: "";
const useFullCliGateway =
	/^(1|true|yes)$/i.test(
		envString("SUITE_GATEWAY_USE_FULL_CLI"),
	);
const providerMode = (envString("SUITE_AGENT_PROVIDER_MODE") || "local")
	.toLowerCase()
	.trim();
const preferredLocalProvider = envString("SUITE_LOCAL_PROVIDER") || "ollama";
const preferredLocalModel =
	envString("SUITE_LOCAL_AGENT_MODEL") || "devstral-small-2:latest";

function resolveGatewayTargetDir() {
	const targetDirSuffix = envString("SUITE_GATEWAY_TARGET_SUFFIX") || "v2";
	const localWritableRoot =
		runtimeEnv.LOCALAPPDATA ||
		runtimeEnv.TEMP ||
		path.join(repoRoot, ".runlogs");
	return path.join(localWritableRoot, "Suite", `zeroclaw-target-${targetDirSuffix}`);
}

function fileExists(candidatePath) {
	const resolved = path.isAbsolute(candidatePath)
		? candidatePath
		: path.join(repoRoot, candidatePath);
	return fs.existsSync(resolved);
}

function commandExists(command) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [command], { stdio: "ignore" })
			: spawnSync("which", [command], { stdio: "ignore" });
	return probe.status === 0;
}

function parseModelList(rawValue) {
	if (!rawValue) return [];
	return String(rawValue)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function dedupe(values = []) {
	const out = [];
	const seen = new Set();
	for (const value of values) {
		const normalized = String(value || "").trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
}

function collectExpectedProfileModels() {
	const profileKeys = [
		"KORO",
		"DEVSTRAL",
		"SENTINEL",
		"FORGE",
		"DRAFTSMITH",
		"GRIDSAGE",
	];
	const expected = [];
	for (const key of profileKeys) {
		const primary =
			envString(`AGENT_MODEL_${key}_PRIMARY`) ||
			envString(`VITE_AGENT_MODEL_${key}_PRIMARY`);
		expected.push(primary);
		const fallbacks =
			envString(`AGENT_MODEL_${key}_FALLBACKS`) ||
			envString(`VITE_AGENT_MODEL_${key}_FALLBACKS`);
		expected.push(...parseModelList(fallbacks));
	}
	return dedupe(expected);
}

function listPulledOllamaModels() {
	if (!commandExists("ollama")) return null;
	const probe = spawnSync("ollama", ["list"], { encoding: "utf8" });
	if (probe.status !== 0) return null;
	const lines = String(probe.stdout || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length <= 1) return [];
	return lines
		.slice(1)
		.map((line) => line.split(/\s+/)[0]?.trim())
		.filter(Boolean);
}

function launch(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		env: runtimeEnv,
		...options,
	});

	child.on("error", (error) => {
		console.error(
			`Failed to start gateway command "${command}": ${error.message}`,
		);
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

const gatewayBinaryName =
	process.platform === "win32" ? "zeroclaw-gateway.exe" : "zeroclaw-gateway";
const legacyBinaryName = process.platform === "win32" ? "zeroclaw.exe" : "zeroclaw";
const localGatewayTargetDir = resolveGatewayTargetDir();
const localBinaryCandidates = [
	gatewayBinaryName,
	path.join("zeroclaw-main", "target", "release", gatewayBinaryName),
	path.join("zeroclaw-main", "target", "debug", gatewayBinaryName),
	path.join(localGatewayTargetDir, "release", gatewayBinaryName),
	path.join(localGatewayTargetDir, "debug", gatewayBinaryName),
	legacyBinaryName,
	path.join("zeroclaw-main", "target", "release", legacyBinaryName),
	path.join("zeroclaw-main", "target", "debug", legacyBinaryName),
	path.join(localGatewayTargetDir, "release", legacyBinaryName),
	path.join(localGatewayTargetDir, "debug", legacyBinaryName),
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
	const env = { ...runtimeEnv };

	// On some Windows setups (including this repo checkout), Cargo target directories
	// can inherit a read-only attribute that breaks autocfg/num-traits build scripts.
	if (process.platform === "win32" && !env.CARGO_TARGET_DIR) {
		env.CARGO_TARGET_DIR = resolveGatewayTargetDir();
		fs.mkdirSync(env.CARGO_TARGET_DIR, { recursive: true });
	}

	// The zeroclaw binary can overflow the default Windows main-thread stack in debug builds.
	// Increase linker stack size when launching from source to keep local dev stable.
	if (process.platform === "win32") {
		// Work around intermittent rustc ICEs observed with incremental builds on some toolchain versions.
		if (!env.CARGO_INCREMENTAL) {
			env.CARGO_INCREMENTAL = "0";
		}

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

function resolveVsDevCmdPath() {
	if (process.platform !== "win32") return null;

	const fromEnv = envString("VSDEVCMD_PATH");
	if (fromEnv && fs.existsSync(fromEnv)) {
		return fromEnv;
	}

	const vswherePath =
		"C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
	if (fs.existsSync(vswherePath)) {
		const probe = spawnSync(
			vswherePath,
			[
				"-latest",
				"-products",
				"*",
				"-requires",
				"Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
				"-property",
				"installationPath",
			],
			{ encoding: "utf8" },
		);
		const installPath = String(probe.stdout || "").trim();
		if (probe.status === 0 && installPath) {
			const vsDevCmd = path.join(
				installPath,
				"Common7",
				"Tools",
				"VsDevCmd.bat",
			);
			if (fs.existsSync(vsDevCmd)) {
				return vsDevCmd;
			}
		}
	}

	const fallbackCandidates = [
		"C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
		"C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat",
		"C:\\Program Files\\Microsoft Visual Studio\\18\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
		"C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\Common7\\Tools\\VsDevCmd.bat",
	];
	for (const candidate of fallbackCandidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	return null;
}

function ensureWindowsMsvcLinker() {
	if (process.platform !== "win32") {
		return { ready: true, useVsDevCmd: false, vsDevCmdPath: "" };
	}
	if (commandExists("link")) {
		return { ready: true, useVsDevCmd: false, vsDevCmdPath: "" };
	}

	const vsDevCmdPath = resolveVsDevCmdPath();
	if (vsDevCmdPath) {
		return { ready: true, useVsDevCmd: true, vsDevCmdPath };
	}

	console.error(
		"Missing MSVC linker (link.exe). Install Visual Studio Build Tools 2022 with workload: 'Desktop development with C++'.",
	);
	console.error(
		"Then start your shell from 'x64 Native Tools Command Prompt for VS 2022' or run:",
	);
	console.error(
		'  "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat" -arch=x64',
	);
	console.error("After toolchain setup, rerun: npm run gateway:dev");
	return { ready: false, useVsDevCmd: false, vsDevCmdPath: "" };
}

function launchCargoWithVsDevCmd(vsDevCmdPath, cargoCommand, cargoArgs) {
	const env = withCargoWorkarounds();
	console.warn(
		`MSVC linker is not on PATH; bootstrapping via VsDevCmd: ${vsDevCmdPath}`,
	);
	launch(
		"cmd.exe",
		[
			"/d",
			"/c",
			"call",
			vsDevCmdPath,
			"-arch=x64",
			"-host_arch=x64",
			"&&",
			cargoCommand,
			...cargoArgs,
		],
		{ env },
	);
}

function applySuiteProviderPolicy() {
	const explicitProvider =
		envString("ZEROCLAW_PROVIDER") ||
		envString("ZEROCLAW_MODEL_PROVIDER") ||
		envString("MODEL_PROVIDER") ||
		envString("PROVIDER");
	const hasOpenRouterKey = Boolean(envString("OPENROUTER_API_KEY"));
	const selectedMode =
		providerMode === "local" || providerMode === "config" || providerMode === "auto"
			? providerMode
			: "local";
	const shouldUseLocal =
		selectedMode === "local" ||
		(selectedMode === "auto" && !explicitProvider && !hasOpenRouterKey);

	if (shouldUseLocal) {
		runtimeEnv.ZEROCLAW_PROVIDER = preferredLocalProvider;
		if (!envString("ZEROCLAW_MODEL") && !envString("MODEL")) {
			runtimeEnv.ZEROCLAW_MODEL = preferredLocalModel;
		}
		console.warn(
			`Gateway provider policy applied: provider=${runtimeEnv.ZEROCLAW_PROVIDER} model=${
				runtimeEnv.ZEROCLAW_MODEL || envString("MODEL") || "<config-default>"
			} mode=${selectedMode}`,
		);
		return;
	}

	if (!hasOpenRouterKey && (explicitProvider || "").trim().toLowerCase() === "openrouter") {
		console.warn(
			"OPENROUTER_API_KEY is missing while provider is openrouter. Set OPENROUTER_API_KEY or set SUITE_AGENT_PROVIDER_MODE=local.",
		);
	}
}

function warnIfMissingLocalOllamaProfileModels() {
	const effectiveProvider = (
		envString("ZEROCLAW_PROVIDER") ||
		envString("ZEROCLAW_MODEL_PROVIDER") ||
		envString("MODEL_PROVIDER") ||
		envString("PROVIDER") ||
		""
	)
		.trim()
		.toLowerCase();

	if (effectiveProvider !== "ollama") {
		return;
	}

	const expectedModels = collectExpectedProfileModels();
	if (!expectedModels.length) {
		return;
	}

	const localModels = listPulledOllamaModels();
	if (localModels === null) {
		console.warn(
			"Ollama preflight skipped: `ollama` CLI not available or `ollama list` failed.",
		);
		return;
	}

	const localSet = new Set(localModels);
	const missing = expectedModels.filter((model) => !localSet.has(model));
	if (!missing.length) {
		console.warn(
			`Ollama preflight: all ${expectedModels.length} profile models are available locally.`,
		);
		return;
	}

	console.warn("Ollama preflight: missing profile models:");
	for (const model of missing) {
		console.warn(`  - ${model}`);
	}
	console.warn("Pull missing models before running agent workflows:");
	console.warn(
		`  ollama pull ${missing.join(" && ollama pull ")}`,
	);
}

function warnIfLikelyMissingProviderKeys() {
	const effectiveProvider =
		(envString("ZEROCLAW_PROVIDER") ||
			envString("ZEROCLAW_MODEL_PROVIDER") ||
			envString("MODEL_PROVIDER") ||
			envString("PROVIDER") ||
			"")
			.trim()
			.toLowerCase();
	if (effectiveProvider && effectiveProvider !== "openrouter") {
		return;
	}
	const hasOpenRouter = Boolean(envString("OPENROUTER_API_KEY"));
	if (!hasOpenRouter) {
		console.warn(
			"OPENROUTER_API_KEY is not set in process env or .env. OpenRouter-backed agent models will fail with 500 until configured.",
		);
	}
}

function main() {
	applySuiteProviderPolicy();
	warnIfMissingLocalOllamaProfileModels();

	if (useFullCliGateway) {
		console.warn(
			"SUITE_GATEWAY_USE_FULL_CLI is enabled; forcing legacy `zeroclaw gateway` launch path.",
		);
	}
	warnIfLikelyMissingProviderKeys();

	const cargoArgs = useFullCliGateway
		? [
				"run",
				"--manifest-path",
				path.join(repoRoot, "zeroclaw-main", "Cargo.toml"),
				"--bin",
				"zeroclaw",
				"--",
				...gatewayCommandArgs,
			]
		: [
				"run",
				"--manifest-path",
				path.join(repoRoot, "zeroclaw-main", "Cargo.toml"),
				"--bin",
				"zeroclaw-gateway",
				"--",
				...gatewayBinaryArgs,
			];

	const preferredLocalBinaryCandidates = useFullCliGateway
		? [
				legacyBinaryName,
				path.join("zeroclaw-main", "target", "release", legacyBinaryName),
				path.join("zeroclaw-main", "target", "debug", legacyBinaryName),
				path.join(localGatewayTargetDir, "release", legacyBinaryName),
				path.join(localGatewayTargetDir, "debug", legacyBinaryName),
			]
		: localBinaryCandidates;

	for (const candidate of preferredLocalBinaryCandidates) {
		if (fileExists(candidate)) {
			const isGatewayBinary = path.basename(candidate) === gatewayBinaryName;
			const executablePath = path.isAbsolute(candidate)
				? candidate
				: path.join(repoRoot, candidate);
			launch(
				executablePath,
				isGatewayBinary ? gatewayBinaryArgs : gatewayCommandArgs,
			);
			return;
		}
	}

	if (!useFullCliGateway) {
		if (commandExists("zeroclaw-gateway")) {
			launch("zeroclaw-gateway", gatewayBinaryArgs);
			return;
		}
		if (userGatewayPath && fs.existsSync(userGatewayPath)) {
			launch(userGatewayPath, gatewayBinaryArgs);
			return;
		}
	}

	if (commandExists("zeroclaw")) {
		launch("zeroclaw", gatewayCommandArgs);
		return;
	}
	if (userZeroclawPath && fs.existsSync(userZeroclawPath)) {
		launch(userZeroclawPath, gatewayCommandArgs);
		return;
	}

	const manifestPath = path.join(repoRoot, "zeroclaw-main", "Cargo.toml");
	if (fs.existsSync(manifestPath)) {
		const msvc = ensureWindowsMsvcLinker();
		if (!msvc.ready) {
			process.exit(1);
		}

		const cargoCommand = commandExists("cargo")
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
		if (msvc.useVsDevCmd) {
			launchCargoWithVsDevCmd(msvc.vsDevCmdPath, cargoCommand, cargoArgs);
			return;
		}
		launch(cargoCommand, cargoArgs, { env: withCargoWorkarounds() });
		return;
	}

	console.error(
		"Unable to start gateway. Install `zeroclaw`, build zeroclaw-main, or ensure zeroclaw-main/Cargo.toml exists.",
	);
	process.exit(1);
}

main();
