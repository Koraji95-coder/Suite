#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
	installSuiteWorktaleHooks,
	isPostCommitHookHealthy,
	isPostCommitHookInstalled,
	isPostPushHookHealthy,
	isPostPushHookInstalled,
	probeWorktaleCli,
	runWorktale,
	runCommand,
} from "./lib/worktale-support.mjs";

function readState(repoRoot) {
	const gitEmailResult = runCommand("git", ["config", "user.email"], {
		cwd: repoRoot,
		stdio: "pipe",
	});
	const cliProbe = probeWorktaleCli(repoRoot);
	return {
		cliInstalled: cliProbe.ok,
		cliPath: cliProbe.cliPath,
		runnerStrategy: cliProbe.runnerStrategy,
		repoExists: fs.existsSync(repoRoot),
		gitRepository: fs.existsSync(path.join(repoRoot, ".git")),
		gitEmailConfigured: gitEmailResult.ok && Boolean(gitEmailResult.stdout),
		gitEmail: gitEmailResult.ok ? gitEmailResult.stdout : "",
		bootstrapped: fs.existsSync(path.join(repoRoot, ".worktale")),
		postCommitHookInstalled: isPostCommitHookInstalled(repoRoot),
		postCommitHookHealthy: isPostCommitHookHealthy(repoRoot),
		postPushHookInstalled: isPostPushHookInstalled(repoRoot),
		postPushHookHealthy: isPostPushHookHealthy(repoRoot),
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
		logStep("initializing repository metadata with the Suite Worktale runner");
		const initResult = runWorktale(["init"], {
			cwd: repoRoot,
			stdio: "pipe",
			persistCache: true,
		});
		if (!initResult.ok) {
			printFailure(initResult, "Worktale init failed.");
		}
		state = readState(repoRoot);
	}

	if (
		!state.postCommitHookHealthy ||
		!state.postPushHookHealthy ||
		state.postCommitHookInstalled !== state.postPushHookInstalled
	) {
		logStep("installing Suite-managed Worktale hooks");
		installSuiteWorktaleHooks(repoRoot);
		state = readState(repoRoot);
	}

	if (!state.postCommitHookHealthy || !state.postPushHookHealthy) {
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
		`  post-commit:  ${state.postCommitHookHealthy ? "installed" : "missing"}`,
	);
	console.log(
		`  post-push:    ${state.postPushHookHealthy ? "installed" : "missing"}`,
	);
	console.log(`  git email:    ${emailState}`);
	if (state.cliPath) {
		console.log(`  cli path:     ${state.cliPath}`);
	}
	if (state.runnerStrategy) {
		console.log(`  runner:       ${state.runnerStrategy}`);
	}
	if (!state.gitEmailConfigured) {
		console.log('  next step:    git config user.email "you@example.com"');
	}
}

ensureReady(process.cwd());
