#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv } from "./env-files.mjs";

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

function resolveSupabaseSmtpPort(envMap = process.env) {
	const raw = String(envMap.SUPABASE_LOCAL_SMTP_PORT || "").trim();
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 2500;
}

function ensureGeneratedSupabaseWorkdir(
	repoRoot = process.cwd(),
	envMap = process.env,
) {
	const sourceDir = path.join(repoRoot, "supabase");
	const generatedRoot = path.join(sourceDir, ".temp", "cli-workdir");
	const generatedSupabaseDir = path.join(generatedRoot, "supabase");
	const sourceConfigPath = path.join(sourceDir, "config.toml");
	const generatedConfigPath = path.join(generatedSupabaseDir, "config.toml");

	fs.mkdirSync(generatedSupabaseDir, { recursive: true });

	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		if (entry.name === ".temp" || entry.name === "config.toml") {
			continue;
		}
		fs.cpSync(
			path.join(sourceDir, entry.name),
			path.join(generatedSupabaseDir, entry.name),
			{ recursive: true, force: true },
		);
	}

	const smtpPort = resolveSupabaseSmtpPort(envMap);
	const configText = fs.readFileSync(sourceConfigPath, "utf8");
	const generatedConfigText = configText.replace(
		/(\[auth\.email\.smtp\][\s\S]*?\nport = )\d+/m,
		`$1${smtpPort}`,
	);
	fs.writeFileSync(generatedConfigPath, generatedConfigText, "utf8");

	return generatedRoot;
}

export function createSupabaseInvocation(args = [], workdir = process.cwd()) {
	const cliArgs = ["supabase", "--workdir", workdir, ...args];
	if (process.platform === "win32") {
		return {
			command: "cmd.exe",
			args: ["/d", "/c", "npx", ...cliArgs],
		};
	}

	return {
		command: "npx",
		args: cliArgs,
	};
}

export function createSupabaseRuntimeEnv(
	repoRoot = process.cwd(),
	baseEnv = process.env,
) {
	return {
		...loadRepoEnv(repoRoot),
		...baseEnv,
	};
}

export function spawnSupabase(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const env = options.env || createSupabaseRuntimeEnv(cwd, process.env);
	const workdir = ensureGeneratedSupabaseWorkdir(cwd, env);
	const invocation = createSupabaseInvocation(args, workdir);
	return spawn(invocation.command, invocation.args, {
		cwd,
		env,
		stdio: options.stdio || "inherit",
	});
}

export function runSupabaseSync(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const env = options.env || createSupabaseRuntimeEnv(cwd, process.env);
	const workdir = ensureGeneratedSupabaseWorkdir(cwd, env);
	const invocation = createSupabaseInvocation(args, workdir);
	return spawnSync(invocation.command, invocation.args, {
		cwd,
		env,
		encoding: options.encoding || "utf8",
		maxBuffer: options.maxBuffer,
		stdio: options.stdio,
	});
}

