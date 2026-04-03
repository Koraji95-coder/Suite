#!/usr/bin/env node
import process from "node:process";

import { runWorktale } from "./lib/worktale-support.mjs";

const args = process.argv.slice(2);
const result = runWorktale(args, {
	cwd: process.cwd(),
	stdio: "inherit",
	persistCache: true,
});

if (!result.ok) {
	if (result.error) {
		console.error(result.error);
	}
	process.exit(result.status || 1);
}
