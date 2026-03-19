#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { runSupabaseSync } from "./lib/supabase-cli.mjs";

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "src", "supabase", "database.ts");
const commandArgs = [
	"gen",
	"types",
	"typescript",
	"--local",
	"--schema",
	"public",
];

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let result = null;
for (let attempt = 1; attempt <= 3; attempt += 1) {
	result = runSupabaseSync(commandArgs, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});

	if (result.status === 0) {
		break;
	}

	const stderr = String(result.stderr || "");
	if (!stderr.includes("ECONNREFUSED") || attempt === 3) {
		break;
	}

	console.warn(
		`supabase:types: local database is still restarting after reset (attempt ${attempt}/3). Retrying...`,
	);
	await wait(attempt * 3000);
}

if (!result || result.status !== 0) {
	const stderr = String(result?.stderr || "").trim();
	const stdout = String(result?.stdout || "").trim();
	console.error(
		[
			"supabase:types: unable to generate local types.",
			"Run `npm run supabase:start` and `npm run supabase:db:reset` first.",
			stderr || stdout || "Supabase CLI did not return any output.",
		]
			.filter(Boolean)
			.join("\n"),
	);
	process.exit(result.status || 1);
}

const generatedTypes = String(result.stdout || "").trim();
if (!generatedTypes) {
	console.error("supabase:types: Supabase CLI returned an empty type definition.");
	process.exit(1);
}

const header = `/**
 * Auto-generated Supabase database types.
 * Generated via: npm run supabase:types
 * Source of truth: local Supabase migrations in supabase/migrations/
 *
 * Refresh flow:
 *   1. npm run supabase:start
 *   2. npm run supabase:db:reset
 *   3. npm run supabase:types
 */

`;

fs.writeFileSync(outputPath, `${header}${generatedTypes}\n`, "utf8");
console.log(`supabase:types: wrote ${outputPath}`);
