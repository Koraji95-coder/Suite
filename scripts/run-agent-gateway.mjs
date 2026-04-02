#!/usr/bin/env node
import { loadRepoEnv } from "./lib/env-files.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const runtimeEnv = { ...loadRepoEnv(repoRoot), ...process.env };
const forwardedArgs = process.argv.slice(2);

const { main: runSuiteAgentGateway } = await import("./suite-agent-gateway.mjs");
await runSuiteAgentGateway({
	repoRoot,
	runtimeEnv,
	forwardedArgs,
});
