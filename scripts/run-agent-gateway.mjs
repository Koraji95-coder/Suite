#!/usr/bin/env node
import { loadRepoEnv } from "./lib/env-files.mjs";

const repoRoot = process.cwd();
const runtimeEnv = { ...loadRepoEnv(repoRoot), ...process.env };
const forwardedArgs = process.argv.slice(2);

const { main: runSuiteAgentGateway } = await import("./suite-agent-gateway.mjs");
await runSuiteAgentGateway({
	repoRoot,
	runtimeEnv,
	forwardedArgs,
});
