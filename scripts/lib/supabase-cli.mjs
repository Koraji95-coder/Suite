#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function normalizeSupabaseDotEnv(repoRoot = process.cwd()) {
	const envPath = path.join(repoRoot, ".env");
	if (!fs.existsSync(envPath)) {
		return false;
	}

	const current = fs.readFileSync(envPath);
	const hasUtf8Bom =
		current.length >= 3 &&
		current[0] === 0xef &&
		current[1] === 0xbb &&
		current[2] === 0xbf;

	if (!hasUtf8Bom) {
		return false;
	}

	fs.writeFileSync(envPath, current.subarray(3));
	return true;
}

export function createSupabaseInvocation(args = []) {
	if (process.platform === "win32") {
		return {
			command: "cmd.exe",
			args: ["/d", "/c", "npx", "supabase", ...args],
		};
	}

	return {
		command: "npx",
		args: ["supabase", ...args],
	};
}

export function spawnSupabase(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const invocation = createSupabaseInvocation(args);
	return spawn(invocation.command, invocation.args, {
		cwd,
		env: options.env || process.env,
		stdio: options.stdio || "inherit",
	});
}

export function runSupabaseSync(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const invocation = createSupabaseInvocation(args);
	return spawnSync(invocation.command, invocation.args, {
		cwd,
		env: options.env || process.env,
		encoding: options.encoding || "utf8",
		maxBuffer: options.maxBuffer,
		stdio: options.stdio,
	});
}

