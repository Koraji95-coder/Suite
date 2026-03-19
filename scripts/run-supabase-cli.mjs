#!/usr/bin/env node
import { spawnSupabase, normalizeSupabaseDotEnv } from "./lib/supabase-cli.mjs";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("run-supabase-cli: missing Supabase CLI arguments.");
	process.exit(1);
}

const normalized = normalizeSupabaseDotEnv(repoRoot);
if (normalized) {
	console.log("run-supabase-cli: normalized UTF-8 BOM from .env for Supabase CLI compatibility.");
}

const child = spawnSupabase(args, {
	cwd: repoRoot,
	env: process.env,
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
	console.error(`run-supabase-cli: failed to launch Supabase CLI: ${error.message}`);
	process.exit(1);
});

