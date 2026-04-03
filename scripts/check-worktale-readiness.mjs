#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
	isPostCommitHookHealthy,
	isPostCommitHookInstalled,
	isPostPushHookHealthy,
	isPostPushHookInstalled,
	probeWorktaleCli,
	runCommand,
} from "./lib/worktale-support.mjs";

const JSON_OUTPUT = process.argv.includes("--json");

function printCheck(label, ok, detail) {
	console.log(`${ok ? "ok " : "no "} ${label}: ${detail}`);
}

function collectIssues(state) {
	const issues = [];
	if (!state.cliInstalled) {
		issues.push("Install the Worktale CLI package.");
	}
	if (!state.repoExists || !state.gitRepository) {
		issues.push("Run this command from the Suite Git repository root.");
	}
	if (!state.bootstrapped) {
		issues.push("Initialize Worktale metadata with `npm run worktale:bootstrap`.");
	}
	if (!state.gitEmailConfigured) {
		issues.push("Configure `git user.email` for this workstation.");
	}
	if (!state.postCommitHookHealthy) {
		issues.push("Install or repair the Worktale post-commit hook.");
	}
	if (!state.postPushHookHealthy) {
		issues.push("Install or repair the Worktale post-push hook.");
	}
	return issues;
}

const repoRoot = process.cwd();
const cliProbe = probeWorktaleCli(repoRoot, { persistCache: true });
const gitEmailResult = runCommand("git", ["config", "user.email"], {
	cwd: repoRoot,
	stdio: "pipe",
});

const state = {
	cliInstalled: cliProbe.ok,
	cliPath: cliProbe.cliPath,
	runnerStrategy: cliProbe.runnerStrategy,
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

if (!JSON_OUTPUT) {
	printCheck(
		"CLI",
		state.cliInstalled,
		state.cliInstalled
			? `runner ${state.runnerStrategy || "available"} (${state.cliPath || "resolved"})`
			: "install the Worktale CLI package",
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
}

const ready =
	state.cliInstalled &&
	state.repoExists &&
	state.gitRepository &&
	state.bootstrapped &&
	state.gitEmailConfigured &&
	state.postCommitHookHealthy &&
	state.postPushHookHealthy;
const payload = {
	ready,
	repoRoot,
	checks: state,
	issues: collectIssues(state),
	recommendedActions: ready
		? []
		: ["Run `npm run worktale:bootstrap` to initialize the repository and repair hooks."],
	nextStep: ready ? null : "npm run worktale:bootstrap",
};

if (JSON_OUTPUT) {
	console.log(JSON.stringify(payload, null, 2));
	if (!ready) {
		process.exit(1);
	}
	process.exit(0);
}

console.log(`ready: ${ready ? "yes" : "no"}`);
if (!ready) {
	console.log("next: npm run worktale:bootstrap");
	process.exit(1);
}
