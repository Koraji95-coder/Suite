#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const WORKTALE_BIN = "worktale";
const USE_SHELL = process.platform === "win32";

function runCommand(command, args, { cwd }) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		shell: USE_SHELL,
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		ok: (result.status ?? 1) === 0,
		status: result.status ?? 1,
		stdout: String(result.stdout || "").trim(),
		stderr: String(result.stderr || "").trim(),
		error: result.error ? String(result.error.message || result.error) : "",
	};
}

function readText(filePath) {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return "";
	}
}

function resolveHookPaths(repoRoot) {
	const hooksRoot = path.join(repoRoot, ".git", "hooks");
	return {
		postCommit: path.join(hooksRoot, "post-commit"),
		postCommitPs1: path.join(hooksRoot, "post-commit.ps1"),
		postPush: path.join(hooksRoot, "post-push"),
	};
}

function isPostCommitHookInstalled(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	const postCommit = readText(hookPaths.postCommit).toLowerCase();
	const postCommitPs1 = readText(hookPaths.postCommitPs1).toLowerCase();
	return (
		postCommit.includes("worktale post-commit hook") ||
		postCommit.includes("worktale capture") ||
		postCommitPs1.includes("worktale post-commit hook") ||
		postCommitPs1.includes("worktale capture")
	);
}

function isPostPushHookInstalled(repoRoot) {
	const postPush = readText(resolveHookPaths(repoRoot).postPush).toLowerCase();
	return (
		postPush.includes("worktale post-push reminder") ||
		postPush.includes("worktale digest")
	);
}

function printCheck(label, ok, detail) {
	console.log(`${ok ? "ok " : "no "} ${label}: ${detail}`);
}

const repoRoot = process.cwd();
const cliProbe = runCommand(WORKTALE_BIN, ["--help"], { cwd: repoRoot });
const gitEmailResult = runCommand("git", ["config", "user.email"], { cwd: repoRoot });

const state = {
	cliInstalled: !cliProbe.error,
	repoExists: fs.existsSync(repoRoot),
	gitRepository: fs.existsSync(path.join(repoRoot, ".git")),
	bootstrapped: fs.existsSync(path.join(repoRoot, ".worktale")),
	gitEmailConfigured: gitEmailResult.ok && Boolean(gitEmailResult.stdout),
	gitEmail: gitEmailResult.ok ? gitEmailResult.stdout : "",
	postCommitHookInstalled: isPostCommitHookInstalled(repoRoot),
	postPushHookInstalled: isPostPushHookInstalled(repoRoot),
};

printCheck(
	"CLI",
	state.cliInstalled,
	state.cliInstalled ? "worktale is available on PATH" : "install the Worktale CLI",
);
printCheck(
	"Repo",
	state.repoExists && state.gitRepository,
	state.gitRepository ? repoRoot : "current directory is not a Git repo root",
);
printCheck(
	"Bootstrap",
	state.bootstrapped,
	state.bootstrapped ? ".worktale is present" : ".worktale is missing",
);
printCheck(
	"Git email",
	state.gitEmailConfigured,
	state.gitEmailConfigured ? state.gitEmail : "git user.email is not configured",
);
printCheck(
	"Post-commit hook",
	state.postCommitHookInstalled,
	state.postCommitHookInstalled ? "automatic commit capture is installed" : "automatic commit capture is missing",
);
printCheck(
	"Post-push hook",
	state.postPushHookInstalled,
	state.postPushHookInstalled ? "digest reminder is installed" : "digest reminder is missing",
);

const ready =
	state.cliInstalled &&
	state.repoExists &&
	state.gitRepository &&
	state.bootstrapped &&
	state.gitEmailConfigured &&
	state.postCommitHookInstalled &&
	state.postPushHookInstalled;

console.log(`ready: ${ready ? "yes" : "no"}`);
if (!ready) {
	console.log("next: npm run worktale:bootstrap");
	process.exit(1);
}
