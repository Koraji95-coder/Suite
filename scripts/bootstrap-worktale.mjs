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

function readState(repoRoot) {
	const gitEmailResult = runCommand("git", ["config", "user.email"], { cwd: repoRoot });
	return {
		cliInstalled: !runCommand(WORKTALE_BIN, ["--help"], { cwd: repoRoot }).error,
		repoExists: fs.existsSync(repoRoot),
		gitRepository: fs.existsSync(path.join(repoRoot, ".git")),
		gitEmailConfigured: gitEmailResult.ok && Boolean(gitEmailResult.stdout),
		gitEmail: gitEmailResult.ok ? gitEmailResult.stdout : "",
		bootstrapped: fs.existsSync(path.join(repoRoot, ".worktale")),
		postCommitHookInstalled: isPostCommitHookInstalled(repoRoot),
		postPushHookInstalled: isPostPushHookInstalled(repoRoot),
	};
}

function logStep(message) {
	console.log(`worktale: ${message}`);
}

function printFailure(result, fallbackMessage) {
	const message =
		result.stderr || result.stdout || result.error || fallbackMessage || "Command failed.";
	console.error(`worktale: ${message}`);
	process.exit(1);
}

function ensureReady(repoRoot) {
	let state = readState(repoRoot);
	if (!state.cliInstalled) {
		console.error("worktale: CLI is not installed or is not available on PATH.");
		process.exit(1);
	}
	if (!state.repoExists || !state.gitRepository) {
		console.error("worktale: current directory is not a Git repository root.");
		process.exit(1);
	}

	if (!state.bootstrapped) {
		logStep("initializing repository metadata with `worktale init`");
		const initResult = runCommand(WORKTALE_BIN, ["init"], { cwd: repoRoot });
		if (!initResult.ok) {
			printFailure(initResult, "Worktale init failed.");
		}
		state = readState(repoRoot);
	}

	if (!state.postCommitHookInstalled && !state.postPushHookInstalled) {
		logStep("installing missing Worktale hooks");
		const installResult = runCommand(
			WORKTALE_BIN,
			["hook", "install", repoRoot],
			{ cwd: repoRoot },
		);
		if (!installResult.ok) {
			printFailure(installResult, "Worktale hook install failed.");
		}
		state = readState(repoRoot);
	}

	if (state.postCommitHookInstalled !== state.postPushHookInstalled) {
		logStep("repairing partial Worktale hook install");
		const uninstallResult = runCommand(
			WORKTALE_BIN,
			["hook", "uninstall", repoRoot],
			{ cwd: repoRoot },
		);
		if (!uninstallResult.ok) {
			printFailure(uninstallResult, "Worktale hook uninstall failed.");
		}
		const installResult = runCommand(
			WORKTALE_BIN,
			["hook", "install", repoRoot],
			{ cwd: repoRoot },
		);
		if (!installResult.ok) {
			printFailure(installResult, "Worktale hook reinstall failed.");
		}
		state = readState(repoRoot);
	}

	if (!state.postCommitHookInstalled || !state.postPushHookInstalled) {
		console.error(
			"worktale: bootstrap finished but the hook set is still incomplete. Run `npm run worktale:doctor`.",
		);
		process.exit(1);
	}

	const emailState = state.gitEmailConfigured
		? state.gitEmail
		: "not configured";
	logStep("repository is bootstrapped");
	console.log(`  .worktale:    ${state.bootstrapped ? "present" : "missing"}`);
	console.log(
		`  post-commit:  ${state.postCommitHookInstalled ? "installed" : "missing"}`,
	);
	console.log(
		`  post-push:    ${state.postPushHookInstalled ? "installed" : "missing"}`,
	);
	console.log(`  git email:    ${emailState}`);
	if (!state.gitEmailConfigured) {
		console.log('  next step:    git config user.email "you@example.com"');
	}
}

ensureReady(process.cwd());
