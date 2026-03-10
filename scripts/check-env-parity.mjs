#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function parseKeys(filePath) {
	if (!fs.existsSync(filePath)) return [];
	const text = fs.readFileSync(filePath, "utf8");
	const keys = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (!match) continue;
		keys.push(match[1]);
	}
	return keys;
}

if (!fs.existsSync(examplePath)) {
	console.error("env-parity: missing .env.example");
	process.exit(1);
}

if (!fs.existsSync(envPath)) {
	console.error(
		"env-parity: missing .env (copy .env.example and set local values)",
	);
	process.exit(1);
}

const envKeys = new Set(parseKeys(envPath));
const exampleKeys = new Set(parseKeys(examplePath));

const missingInEnv = Array.from(exampleKeys)
	.filter((key) => !envKeys.has(key))
	.sort();
const missingInExample = Array.from(envKeys)
	.filter((key) => !exampleKeys.has(key))
	.sort();

if (missingInEnv.length === 0 && missingInExample.length === 0) {
	console.log("env-parity: required keys present and no local-only keys detected.");
	process.exit(0);
}

if (missingInEnv.length === 0) {
	console.warn("env-parity: required keys present in .env.");
	if (missingInExample.length > 0) {
		console.warn("  Local-only keys present in .env (warning only):");
		for (const key of missingInExample) {
			console.warn(`    - ${key}`);
		}
	}
	process.exit(0);
}

console.error("env-parity: missing required keys in .env.");
if (missingInEnv.length > 0) {
	console.error("  Missing in .env:");
	for (const key of missingInEnv) {
		console.error(`    + ${key}`);
	}
}
if (missingInExample.length > 0) {
	console.error("  Local-only keys in .env (non-blocking cleanup candidates):");
	for (const key of missingInExample) {
		console.error(`    - ${key}`);
	}
}
process.exit(1);
