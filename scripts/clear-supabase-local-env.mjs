#!/usr/bin/env node
import fs from "node:fs";
import {
	getRepoEnvPaths,
	readEnvFile,
	writeEnvEntries,
} from "./lib/env-files.mjs";
import { ACTIVE_LOCAL_SUPABASE_KEYS } from "./lib/supabase-local-mode.mjs";

const repoRoot = process.cwd();
const { localEnvPath } = getRepoEnvPaths(repoRoot);

if (!fs.existsSync(localEnvPath)) {
	console.log("supabase:env:clear: no .env.local file to update.");
	process.exit(0);
}

const existingLocalEnv = readEnvFile(localEnvPath);
const preservedEntries = Object.entries(existingLocalEnv)
	.filter(([key]) => !ACTIVE_LOCAL_SUPABASE_KEYS.has(key))
	.sort(([left], [right]) => left.localeCompare(right));

if (preservedEntries.length === 0) {
	fs.unlinkSync(localEnvPath);
	console.log("supabase:env:clear: removed .env.local");
	process.exit(0);
}

writeEnvEntries(localEnvPath, preservedEntries, [
	"Machine-local overrides preserved after `npm run supabase:env:clear`.",
]);

console.log(
	`supabase:env:clear: removed managed local Supabase target overrides from ${localEnvPath}`,
);
