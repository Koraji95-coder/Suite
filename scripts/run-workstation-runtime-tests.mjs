#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const vitestEntrypoint = path.join(
	repoRoot,
	"node_modules",
	"vitest",
	"vitest.mjs",
);

const result = spawnSync(
	process.execPath,
	[vitestEntrypoint, "run", "src/lib/workstationRuntimeScripts.test.ts"],
	{
		cwd: repoRoot,
		stdio: "inherit",
		env: {
			...process.env,
			SUITE_RUN_WORKSTATION_INTEGRATION: "1",
		},
	},
);

if (result.error) {
	console.error("Failed to run workstation runtime integration tests:", result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
