#!/usr/bin/env node
import { spawn } from "node:child_process";
import { loadRepoEnv } from "./lib/env-files.mjs";

const repoRoot = process.cwd();
const mergedEnv = {
	...loadRepoEnv(repoRoot),
	...process.env,
};

const pythonCommand = (process.env.SUITE_PYTHON_BIN || "").trim() || "python";
const child = spawn(pythonCommand, ["backend/api_server.py"], {
	cwd: repoRoot,
	env: mergedEnv,
	stdio: "inherit",
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

child.on("error", (error) => {
	console.error(
		`run-backend-dev: failed to launch ${pythonCommand}: ${error.message}`,
	);
	process.exit(1);
});

