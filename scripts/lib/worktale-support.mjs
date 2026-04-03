import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const COMPAT_NODE_PACKAGE =
	process.env.SUITE_WORKTALE_NODE_PACKAGE || "node@22";
const RUNNER_CACHE_BASENAME = "suite-runner.json";

function normalizeRepoRoot(repoRoot) {
	return path.resolve(String(repoRoot || process.cwd()));
}

function resolveCommandPath(command) {
	const normalizedCommand = String(command || "");
	if (
		process.platform === "win32" &&
		!/[/\\]/.test(normalizedCommand) &&
		!/\.(exe|cmd)$/i.test(normalizedCommand)
	) {
		const commandShim = path.join(
			path.dirname(process.execPath),
			`${normalizedCommand}.cmd`,
		);
		if (fs.existsSync(commandShim)) {
			return commandShim;
		}
	}
	return normalizedCommand;
}

function getBundledNpmCliPath(scriptName) {
	const candidate = path.join(
		path.dirname(process.execPath),
		"node_modules",
		"npm",
		"bin",
		scriptName,
	);
	return fs.existsSync(candidate) ? candidate : "";
}

export function runCommand(command, args, { cwd, stdio = "pipe" }) {
	const resolvedCommand = resolveCommandPath(command);
	const normalizedLower = resolvedCommand.toLowerCase();
	const spawnOptions = {
		cwd,
		encoding: "utf8",
		shell: false,
		stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
	};
	const npxCliPath =
		process.platform === "win32" &&
		(normalizedLower.endsWith("\\npx.cmd") || normalizedLower === "npx")
			? getBundledNpmCliPath("npx-cli.js")
			: "";
	const npmCliPath =
		process.platform === "win32" &&
		(normalizedLower.endsWith("\\npm.cmd") || normalizedLower === "npm")
			? getBundledNpmCliPath("npm-cli.js")
			: "";
	const result = npxCliPath
		? spawnSync(process.execPath, [npxCliPath, ...args], spawnOptions)
		: npmCliPath
			? spawnSync(process.execPath, [npmCliPath, ...args], spawnOptions)
			: spawnSync(resolvedCommand, args, spawnOptions);
	return {
		ok: (result.status ?? 1) === 0,
		status: result.status ?? 1,
		stdout: String(result.stdout || "").trim(),
		stderr: String(result.stderr || "").trim(),
		error: result.error ? String(result.error.message || result.error) : "",
	};
}

export function readText(filePath) {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return "";
	}
}

function writeExecutableHook(filePath, content) {
	fs.writeFileSync(filePath, content.replace(/\n/g, os.EOL), "utf8");
	try {
		fs.chmodSync(filePath, 0o755);
	} catch {
		// Windows may ignore POSIX executable bits.
	}
}

export function resolveHookPaths(repoRoot) {
	const hooksRoot = path.join(normalizeRepoRoot(repoRoot), ".git", "hooks");
	return {
		postCommit: path.join(hooksRoot, "post-commit"),
		postCommitPs1: path.join(hooksRoot, "post-commit.ps1"),
		postPush: path.join(hooksRoot, "post-push"),
	};
}

function getRunnerScriptRelativePath() {
	return path.posix.join("scripts", "run-worktale-cli.mjs");
}

function buildPostCommitHook() {
	const runnerPath = getRunnerScriptRelativePath();
	return `#!/bin/sh
# Worktale post-commit hook
# --- Worktale hook start ---
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -n "$REPO_ROOT" ] && command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/${runnerPath}" capture --silent 2>/dev/null || true
fi
# --- Worktale hook end ---
`;
}

function buildPostCommitPowerShellHook() {
	return `# Worktale post-commit hook (Windows)
$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($repoRoot)) {
  $runner = Join-Path $repoRoot "scripts\\run-worktale-cli.mjs"
  if (Test-Path -LiteralPath $runner -PathType Leaf) {
    & node $runner capture --silent *> $null
  }
}
`;
}

function buildPostPushHook() {
	return `#!/bin/sh
# Worktale post-push reminder
# --- Worktale hook start ---
echo "  Tip: run 'npm run worktale:digest' to review today's work" 2>/dev/null || true
# --- Worktale hook end ---
`;
}

function normalizeHookContent(content) {
	return String(content || "")
		.replace(/\r\n/g, "\n")
		.trim();
}

export function isPostCommitHookInstalled(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	const postCommit = readText(hookPaths.postCommit).toLowerCase();
	const postCommitPs1 = readText(hookPaths.postCommitPs1).toLowerCase();
	return (
		postCommit.includes("worktale post-commit hook") ||
		postCommit.includes("worktale capture") ||
		postCommit.includes("run-worktale-cli.mjs") ||
		postCommitPs1.includes("worktale post-commit hook") ||
		postCommitPs1.includes("worktale capture") ||
		postCommitPs1.includes("run-worktale-cli.mjs")
	);
}

export function isPostPushHookInstalled(repoRoot) {
	const postPush = readText(resolveHookPaths(repoRoot).postPush).toLowerCase();
	return (
		postPush.includes("worktale post-push reminder") ||
		postPush.includes("worktale digest") ||
		postPush.includes("run-worktale-cli.mjs digest") ||
		postPush.includes("worktale:digest")
	);
}

export function isPostCommitHookHealthy(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	return (
		normalizeHookContent(readText(hookPaths.postCommit)) ===
			normalizeHookContent(buildPostCommitHook()) &&
		normalizeHookContent(readText(hookPaths.postCommitPs1)) ===
			normalizeHookContent(buildPostCommitPowerShellHook())
	);
}

export function isPostPushHookHealthy(repoRoot) {
	return (
		normalizeHookContent(readText(resolveHookPaths(repoRoot).postPush)) ===
		normalizeHookContent(buildPostPushHook())
	);
}

export function installSuiteWorktaleHooks(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	fs.mkdirSync(path.dirname(hookPaths.postCommit), { recursive: true });
	writeExecutableHook(hookPaths.postCommit, buildPostCommitHook());
	writeExecutableHook(hookPaths.postCommitPs1, buildPostCommitPowerShellHook());
	writeExecutableHook(hookPaths.postPush, buildPostPushHook());
}

function resolveGlobalCliCandidates(repoRoot) {
	const candidates = [];
	const resolvedRepoRoot = normalizeRepoRoot(repoRoot);
	const envCliPath = String(process.env.SUITE_WORKTALE_CLI_PATH || "").trim();
	if (envCliPath) {
		candidates.push(path.resolve(envCliPath));
	}
	candidates.push(
		path.join(resolvedRepoRoot, "node_modules", "worktale", "dist", "cli.js"),
	);
	if (process.platform === "win32" && process.env.APPDATA) {
		candidates.push(
			path.join(
				process.env.APPDATA,
				"npm",
				"node_modules",
				"worktale",
				"dist",
				"cli.js",
			),
		);
	}
	const npmRootResult = runCommand("npm", ["root", "-g"], {
		cwd: resolvedRepoRoot,
		stdio: "pipe",
	});
	if (npmRootResult.ok && npmRootResult.stdout) {
		candidates.push(
			path.join(npmRootResult.stdout.trim(), "worktale", "dist", "cli.js"),
		);
	}
	return Array.from(new Set(candidates.filter(Boolean)));
}

function resolveWorktaleCliPath(repoRoot) {
	for (const candidate of resolveGlobalCliCandidates(repoRoot)) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return "";
}

function getRunnerCachePath(repoRoot) {
	return path.join(normalizeRepoRoot(repoRoot), ".worktale", RUNNER_CACHE_BASENAME);
}

function loadRunnerCache(repoRoot, cliPath) {
	const cachePath = getRunnerCachePath(repoRoot);
	try {
		const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
		if (!raw || typeof raw !== "object") return null;
		if (String(raw.cliPath || "") !== String(cliPath || "")) return null;
		if (raw.strategy !== "current-node" && raw.strategy !== "node22-npx") {
			return null;
		}
		return {
			strategy: raw.strategy,
			cliPath: String(raw.cliPath || ""),
		};
	} catch {
		return null;
	}
}

function saveRunnerCache(repoRoot, runner) {
	const cachePath = getRunnerCachePath(repoRoot);
	try {
		fs.mkdirSync(path.dirname(cachePath), { recursive: true });
		fs.writeFileSync(
			cachePath,
			JSON.stringify(
				{
					strategy: runner.strategy,
					cliPath: runner.cliPath,
				},
				null,
				2,
			),
			"utf8",
		);
	} catch {
		// Ignore cache write failures; the runner can still execute.
	}
}

function clearRunnerCache(repoRoot) {
	try {
		fs.rmSync(getRunnerCachePath(repoRoot), { force: true });
	} catch {
		// Ignore cache delete failures.
	}
}

function buildCurrentNodeRunner(cliPath) {
	return {
		strategy: "current-node",
		cliPath,
		command: process.execPath,
		commandArgs: [cliPath],
	};
}

function buildCompatNodeRunner(cliPath) {
	return {
		strategy: "node22-npx",
		cliPath,
		command: "npx",
		commandArgs: ["-y", COMPAT_NODE_PACKAGE, cliPath],
	};
}

function executeRunner(runner, worktaleArgs, { cwd, stdio }) {
	const commandArgs = [...runner.commandArgs, ...worktaleArgs];
	const result = runCommand(runner.command, commandArgs, { cwd, stdio });
	return {
		...result,
		cliPath: runner.cliPath,
		runnerStrategy: runner.strategy,
		command: runner.command,
		commandArgs,
	};
}

function isAbiMismatch(result) {
	const diagnostic = `${result.stderr || ""}\n${result.stdout || ""}\n${result.error || ""}`.toLowerCase();
	return (
		diagnostic.includes("node_module_version") ||
		diagnostic.includes("better-sqlite3") ||
		diagnostic.includes("better_sqlite3.node")
	);
}

function ensureCompatRunner(cliPath, worktaleArgs, { cwd, stdio, persistCache }) {
	const compatRunner = buildCompatNodeRunner(cliPath);
	const compatResult = executeRunner(compatRunner, worktaleArgs, { cwd, stdio });
	if (compatResult.ok && persistCache) {
		saveRunnerCache(cwd, compatRunner);
	}
	return compatResult;
}

function executeAutoRunner(cliPath, worktaleArgs, { cwd, stdio, persistCache }) {
	const cachedRunner = loadRunnerCache(cwd, cliPath);
	if (cachedRunner) {
		const runner =
			cachedRunner.strategy === "node22-npx"
				? buildCompatNodeRunner(cliPath)
				: buildCurrentNodeRunner(cliPath);
		const cachedResult = executeRunner(runner, worktaleArgs, { cwd, stdio });
		if (cachedResult.ok || !isAbiMismatch(cachedResult)) {
			return cachedResult;
		}
		clearRunnerCache(cwd);
	}

	const currentRunner = buildCurrentNodeRunner(cliPath);
	const currentResult = executeRunner(currentRunner, worktaleArgs, { cwd, stdio });
	if (currentResult.ok) {
		if (persistCache) {
			saveRunnerCache(cwd, currentRunner);
		}
		return currentResult;
	}
	if (!isAbiMismatch(currentResult)) {
		return currentResult;
	}
	return ensureCompatRunner(cliPath, worktaleArgs, { cwd, stdio, persistCache });
}

export function probeWorktaleCli(repoRoot, { persistCache = false } = {}) {
	const resolvedRepoRoot = normalizeRepoRoot(repoRoot);
	const cliPath = resolveWorktaleCliPath(resolvedRepoRoot);
	if (!cliPath) {
		return {
			ok: false,
			status: 1,
			stdout: "",
			stderr: "",
			error: "Worktale CLI package could not be found.",
			cliPath: "",
			runnerStrategy: "",
			command: "",
			commandArgs: [],
		};
	}
	return executeAutoRunner(cliPath, ["status"], {
		cwd: resolvedRepoRoot,
		stdio: "pipe",
		persistCache,
	});
}

export function runWorktale(
	worktaleArgs,
	{ cwd = process.cwd(), stdio = "pipe", persistCache = true } = {},
) {
	const resolvedRepoRoot = normalizeRepoRoot(cwd);
	const cliPath = resolveWorktaleCliPath(resolvedRepoRoot);
	if (!cliPath) {
		return {
			ok: false,
			status: 1,
			stdout: "",
			stderr: "",
			error: "Worktale CLI package could not be found.",
			cliPath: "",
			runnerStrategy: "",
			command: "",
			commandArgs: [],
		};
	}
	return executeAutoRunner(cliPath, worktaleArgs, {
		cwd: resolvedRepoRoot,
		stdio,
		persistCache,
	});
}
