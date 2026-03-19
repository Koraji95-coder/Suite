#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const WORKTALE_BIN = "worktale";
const USE_SHELL = process.platform === "win32";
const POST_COMMIT_COMMAND = "worktale capture --silent 2>/dev/null || true";
const POST_PUSH_COMMAND = "echo \"  Tip: run 'worktale digest' to review today's work\" 2>/dev/null || true";

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

function isKnownBrokenWorktaleHook(content, expectedCommand) {
	const normalizedLines = String(content || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (!normalizedLines.length) return false;
	const allowedLines = new Set([
		"#!/bin/sh",
		"# Worktale post-commit hook",
		"# Worktale post-push reminder",
		"# --- Worktale hook start ---",
		"# --- Worktale hook end ---",
		expectedCommand,
		"else",
		"fi",
	]);
	return (
		normalizedLines.some((line) => line === "else" || line === "fi") &&
		normalizedLines.every((line) => allowedLines.has(line))
	);
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

function isPostCommitHookHealthy(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	const postCommit = readText(hookPaths.postCommit);
	if (!isPostCommitHookInstalled(repoRoot)) return false;
	if (!postCommit.trim()) return false;
	return !isKnownBrokenWorktaleHook(postCommit, POST_COMMIT_COMMAND);
}

function isPostPushHookHealthy(repoRoot) {
	const hookPaths = resolveHookPaths(repoRoot);
	const postPush = readText(hookPaths.postPush);
	if (!isPostPushHookInstalled(repoRoot)) return false;
	if (!postPush.trim()) return false;
	return !isKnownBrokenWorktaleHook(postPush, POST_PUSH_COMMAND);
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
	postCommitHookHealthy: isPostCommitHookHealthy(repoRoot),
	postPushHookInstalled: isPostPushHookInstalled(repoRoot),
	postPushHookHealthy: isPostPushHookHealthy(repoRoot),
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
	state.postCommitHookHealthy,
	state.postCommitHookHealthy
		? "automatic commit capture is installed"
		: state.postCommitHookInstalled
			? "automatic commit capture is installed but malformed"
			: "automatic commit capture is missing",
);
printCheck(
	"Post-push hook",
	state.postPushHookHealthy,
	state.postPushHookHealthy
		? "digest reminder is installed"
		: state.postPushHookInstalled
			? "digest reminder is installed but malformed"
			: "digest reminder is missing",
);

const ready =
	state.cliInstalled &&
	state.repoExists &&
	state.gitRepository &&
	state.bootstrapped &&
	state.gitEmailConfigured &&
	state.postCommitHookHealthy &&
	state.postPushHookHealthy;

console.log(`ready: ${ready ? "yes" : "no"}`);
if (!ready) {
	console.log("next: npm run worktale:bootstrap");
	process.exit(1);
}
