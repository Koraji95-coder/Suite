#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
const dryRun = process.argv.includes("--dry");

const START_MARKER =
	"# --- suite env sync additions (generated from .env.example) ---";
const END_MARKER = "# --- end suite env sync additions ---";

function parseKeyEntries(filePath) {
	if (!fs.existsSync(filePath)) return [];
	const text = fs.readFileSync(filePath, "utf8");
	const entries = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const trimmedLine = rawLine.trim();
		if (!trimmedLine || trimmedLine.startsWith("#")) continue;
		const match = rawLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (!match) continue;
		entries.push({
			key: match[1],
			line: rawLine,
		});
	}
	return entries;
}

if (!fs.existsSync(examplePath)) {
	console.error("env-sync: missing .env.example");
	process.exit(1);
}

const exampleEntries = parseKeyEntries(examplePath);
if (exampleEntries.length === 0) {
	console.error("env-sync: no key entries found in .env.example");
	process.exit(1);
}

const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const envKeys = new Set(parseKeyEntries(envPath).map((entry) => entry.key));
const missingEntries = exampleEntries.filter((entry) => !envKeys.has(entry.key));

if (missingEntries.length === 0) {
	console.log("env-sync: .env already contains all required keys.");
	process.exit(0);
}

if (dryRun) {
	console.log(
		`env-sync: ${missingEntries.length} keys would be appended to .env:`,
	);
	for (const entry of missingEntries) {
		console.log(`  + ${entry.key}`);
	}
	process.exit(0);
}

const newline = envText.includes("\r\n") ? "\r\n" : "\n";
const nextTextParts = [];
const normalizedEnvText = envText;

if (normalizedEnvText) {
	const envWithTerminator = normalizedEnvText.endsWith(newline)
		? normalizedEnvText
		: `${normalizedEnvText}${newline}`;
	nextTextParts.push(envWithTerminator);
} else {
	nextTextParts.push("");
}

if (!nextTextParts[0].endsWith(`${newline}${newline}`) && nextTextParts[0]) {
	nextTextParts[0] = `${nextTextParts[0]}${newline}`;
}

const appendedBlock = [
	START_MARKER,
	...missingEntries.map((entry) => entry.line),
	END_MARKER,
	"",
].join(newline);
nextTextParts.push(appendedBlock);

fs.writeFileSync(envPath, nextTextParts.join(""), "utf8");

console.log(`env-sync: appended ${missingEntries.length} missing keys to .env.`);
for (const entry of missingEntries) {
	console.log(`  + ${entry.key}`);
}
