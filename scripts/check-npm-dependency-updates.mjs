#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		throw result.error;
	}
	return result;
}

let result;
try {
	result =
		process.platform === "win32"
			? run(process.env.ComSpec || "cmd.exe", [
					"/d",
					"/s",
					"/c",
					"npm outdated --all --json",
				])
			: run("npm", ["outdated", "--all", "--json"]);
} catch (error) {
	console.error(`npm-updates: failed to run npm outdated: ${error.message}`);
	process.exit(1);
}

if (result.status !== 0 && result.status !== 1) {
	console.error(result.stderr.trim() || "npm-updates: npm outdated failed.");
	process.exit(result.status ?? 1);
}

const raw = result.stdout.trim();
const payload = raw ? JSON.parse(raw) : {};
const repoPackageJson = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
);
const directDependencyNames = new Set([
	...Object.keys(repoPackageJson.dependencies || {}),
	...Object.keys(repoPackageJson.devDependencies || {}),
	...Object.keys(repoPackageJson.optionalDependencies || {}),
]);
const showAll = process.argv.includes("--all");
const entries = Object.entries(payload)
	.map(([name, info]) => ({
		name,
		current: info.current ?? "n/a",
		wanted: info.wanted ?? "n/a",
		latest: info.latest ?? "n/a",
		location: info.location ?? "n/a",
		dependents: Array.isArray(info.dependentBy)
			? info.dependentBy.join(", ")
			: "n/a",
	}))
	.sort((left, right) => left.name.localeCompare(right.name));
const directEntries = entries.filter((entry) => directDependencyNames.has(entry.name));
const displayEntries = showAll ? entries : directEntries;

if (entries.length === 0) {
	console.log("npm-updates: no newer npm package releases detected.");
	process.exit(0);
}

console.log(
	`npm-updates: ${entries.length} package${entries.length === 1 ? "" : "s"} have newer releases available (${directEntries.length} direct, ${entries.length - directEntries.length} transitive).`,
);
if (!showAll && displayEntries.length === 0) {
	console.log(
		"npm-updates: no direct dependency updates detected. Run `node scripts/check-npm-dependency-updates.mjs --all` for the full transitive report.",
	);
	process.exit(0);
}
for (const entry of displayEntries) {
	console.log(
		`  - ${entry.name}: ${entry.current} -> ${entry.latest} (wanted ${entry.wanted}; ${entry.location})`,
	);
}
if (!showAll && entries.length !== displayEntries.length) {
	console.log(
		"npm-updates: rerun with `node scripts/check-npm-dependency-updates.mjs --all` for the full transitive report.",
	);
}
