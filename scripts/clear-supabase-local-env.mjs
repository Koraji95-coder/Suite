#!/usr/bin/env node
import fs from "node:fs";
import {
	getRepoEnvPaths,
	readEnvFile,
	writeEnvEntries,
} from "./lib/env-files.mjs";

const repoRoot = process.cwd();
const { localEnvPath } = getRepoEnvPaths(repoRoot);
const MANAGED_KEYS = new Set([
	"VITE_SUPABASE_URL",
	"VITE_SUPABASE_ANON_KEY",
	"SUPABASE_URL",
	"SUPABASE_ANON_KEY",
	"SUPABASE_SERVICE_ROLE_KEY",
	"SUPABASE_JWT_SECRET",
	"VITE_DEV_ADMIN_SOURCE",
	"VITE_DEV_ADMIN_EMAIL",
	"VITE_DEV_ADMIN_EMAILS",
]);

if (!fs.existsSync(localEnvPath)) {
	console.log("supabase:env:clear: no .env.local file to update.");
	process.exit(0);
}

const existingLocalEnv = readEnvFile(localEnvPath);
const preservedEntries = Object.entries(existingLocalEnv)
	.filter(([key]) => !MANAGED_KEYS.has(key))
	.sort(([left], [right]) => left.localeCompare(right));

if (preservedEntries.length === 0) {
	fs.unlinkSync(localEnvPath);
	console.log("supabase:env:clear: removed .env.local");
	process.exit(0);
}

writeEnvEntries(localEnvPath, preservedEntries, [
	"Machine-local overrides preserved after `npm run supabase:env:clear`.",
]);

console.log(`supabase:env:clear: removed managed Supabase overrides from ${localEnvPath}`);

