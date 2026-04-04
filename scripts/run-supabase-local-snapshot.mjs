#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	collectSupabaseResultOutput,
	createSupabaseRuntimeEnv,
	runSupabaseStartWithRetry,
	runSupabaseSync,
} from "./lib/supabase-cli.mjs";
import {
	buildRepoMigrationFingerprint,
	buildSnapshotId,
	DEFAULT_SNAPSHOT_EXCLUDES,
	DEFAULT_SNAPSHOT_SCHEMAS,
	ensureDirectory,
	getSnapshotManifestPath,
	getSupabaseSnapshotRoot,
	hashFile,
	listLocalSupabaseSnapshots,
	parseSupabaseStatusOutput,
	resolveSnapshotSelection,
	summarizeSupabaseStatus,
} from "./lib/supabase-local-snapshot.mjs";

const repoRoot = process.cwd();
const runtimeEnv = createSupabaseRuntimeEnv(repoRoot, process.env);
const [command = "help", ...argv] = process.argv.slice(2);

function getCodexConfigPath() {
	if (String(process.env.CODEX_HOME || "").trim()) {
		return path.join(String(process.env.CODEX_HOME).trim(), "config.toml");
	}
	if (String(process.env.USERPROFILE || "").trim()) {
		return path.join(String(process.env.USERPROFILE).trim(), ".codex", "config.toml");
	}
	return null;
}

function readTomlStringValue(filePath, key) {
	if (!filePath || !key || !fs.existsSync(filePath)) {
		return null;
	}

	const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*=\\s*"([^"]*)"`);
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const match = line.match(pattern);
		if (match) {
			return String(match[1] || "").trim() || null;
		}
	}

	return null;
}

function resolveWorkstationId() {
	const codexConfigPath = getCodexConfigPath();
	return (
		readTomlStringValue(codexConfigPath, "SUITE_WORKSTATION_ID") ||
		String(process.env.SUITE_WORKSTATION_ID || "").trim() ||
		String(process.env.COMPUTERNAME || "").trim() ||
		os.hostname()
	);
}

function printUsage() {
	console.log(`Usage:
  node scripts/run-supabase-local-snapshot.mjs list [--snapshot-root <path>] [--limit <n>]
  node scripts/run-supabase-local-snapshot.mjs export [--name <label>] [--snapshot-root <path>] [--no-start]
  node scripts/run-supabase-local-snapshot.mjs import --snapshot <id|path|latest> [--snapshot-root <path>] [--force] [--allow-migration-drift] [--dry-run] [--no-start]

Notes:
  - This is a recovery-only lane for local Supabase data and auth state.
  - Schema continuity remains Git + repo migrations, not snapshots.
  - Imports reset the local database before replaying the snapshot data dump.
  - Local storage object blobs and Docker volumes are not included.`);
}

function parseArgs(tokens) {
	const options = { _: [] };
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token.startsWith("--")) {
			options._.push(token);
			continue;
		}

		const trimmed = token.slice(2);
		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex >= 0) {
			options[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
			continue;
		}

		const next = tokens[index + 1];
		if (next && !next.startsWith("--")) {
			options[trimmed] = next;
			index += 1;
			continue;
		}

		options[trimmed] = true;
	}

	return options;
}

function trimOutput(text) {
	return String(text || "").trim();
}

function formatBytes(bytes) {
	const numeric = Number(bytes || 0);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let value = numeric;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function runSupabaseCommand(args, { maxBuffer = 32 * 1024 * 1024 } = {}) {
	const result = runSupabaseSync(args, {
		cwd: repoRoot,
		env: runtimeEnv,
		encoding: "utf8",
		stdio: "pipe",
		maxBuffer,
	});
	return {
		ok: !result.error && Number(result.status ?? 0) === 0,
		status: Number(result.status ?? 0),
		error: result.error || null,
		outputText: trimOutput(collectSupabaseResultOutput(result)),
		stdout: trimOutput(result.stdout),
		stderr: trimOutput(result.stderr),
	};
}

async function ensureLocalSupabaseReady({ allowStart = true } = {}) {
	const statusArgs = ["--agent=no", "status", "-o", "json"];
	const statusResult = runSupabaseCommand(statusArgs);
	const statusPayload = parseSupabaseStatusOutput(statusResult.outputText);
	if (statusResult.ok && statusPayload?.API_URL && statusPayload?.DB_URL) {
		return statusPayload;
	}

	if (!allowStart) {
		throw new Error(
			statusResult.outputText || "Local Supabase is not running and auto-start was disabled.",
		);
	}

	console.log("Local Supabase is not ready. Starting the local stack first...");
	const { result } = await runSupabaseStartWithRetry(
		() =>
			runSupabaseSync(["--agent=no", "start"], {
				cwd: repoRoot,
				env: runtimeEnv,
				encoding: "utf8",
				stdio: "pipe",
				maxBuffer: 32 * 1024 * 1024,
			}),
		{
			delayMs: 4000,
			onRetry: ({ nextAttempt, maxAttempts, outputText }) => {
				const retryReason = /Conflict\./i.test(outputText)
					? "Docker container name conflict"
					: "transient Supabase startup failure";
				console.warn(
					`Supabase local start retry: ${retryReason} (${nextAttempt}/${maxAttempts}).`,
				);
			},
		},
	);

	if (result?.error || Number(result?.status ?? 0) !== 0) {
		const outputText = trimOutput(collectSupabaseResultOutput(result));
		throw new Error(outputText || "Local Supabase could not be started.");
	}

	const readyStatus = runSupabaseCommand(statusArgs);
	const readyPayload = parseSupabaseStatusOutput(readyStatus.outputText);
	if (!readyStatus.ok || !readyPayload?.API_URL || !readyPayload?.DB_URL) {
		throw new Error(
			readyStatus.outputText ||
				"Local Supabase did not report a usable status after startup.",
		);
	}

	return readyPayload;
}

function buildSnapshotManifest({
	snapshotId,
	snapshotDir,
	createdAt,
	dataPath,
	dataHash,
	dataSizeBytes,
	statusPayload,
	migrationFingerprint,
}) {
	const workstationId = String(resolveWorkstationId() || "").trim();
	return {
		schemaVersion: "suite.supabase-snapshot.v1",
		snapshotId,
		createdAt: createdAt.toISOString(),
		snapshotDir,
		repoRoot,
		workstationId: workstationId || null,
		computerName: String(process.env.COMPUTERNAME || "").trim() || null,
		mode: "data_only",
		resetBeforeImport: true,
		schemaContinuity: "repo_migrations",
		schemas: [...DEFAULT_SNAPSHOT_SCHEMAS],
		excludes: [...DEFAULT_SNAPSHOT_EXCLUDES],
		localEndpoints: summarizeSupabaseStatus(statusPayload),
		migrationFingerprint,
		files: {
			data: {
				path: dataPath,
				sizeBytes: dataSizeBytes,
				sha256: dataHash,
			},
		},
		warnings: [
			"Recovery-only lane. Normal workstation continuity stays Git + Docker bootstrap.",
			"Imports reset the local database before replaying this data-only snapshot.",
			"Local storage object blobs and Docker volumes are not included in this snapshot.",
		],
	};
}

async function runExport(options) {
	const snapshotRoot = ensureDirectory(
		path.resolve(String(options["snapshot-root"] || getSupabaseSnapshotRoot())),
	);
	const statusPayload = await ensureLocalSupabaseReady({
		allowStart: !options["no-start"],
	});
	const createdAt = new Date();
	const snapshotId = buildSnapshotId({
		createdAt,
		workstationId: resolveWorkstationId(),
		label: String(options.name || "").trim(),
	});
	const snapshotDir = path.join(snapshotRoot, snapshotId);
	if (fs.existsSync(snapshotDir)) {
		throw new Error(`Snapshot directory already exists: ${snapshotDir}`);
	}

	ensureDirectory(snapshotDir);
	const dataPath = path.join(snapshotDir, "data.sql");
	const dumpArgs = [
		"--agent=no",
		"db",
		"dump",
		"--local",
		"--data-only",
		"--schema",
		DEFAULT_SNAPSHOT_SCHEMAS.join(","),
		"--file",
		dataPath,
	];
	for (const excludedTable of DEFAULT_SNAPSHOT_EXCLUDES) {
		dumpArgs.push("--exclude", excludedTable);
	}

	console.log(`Writing local Supabase recovery snapshot to ${snapshotDir}`);
	const dumpResult = runSupabaseCommand(dumpArgs, { maxBuffer: 64 * 1024 * 1024 });
	if (!dumpResult.ok || !fs.existsSync(dataPath)) {
		fs.rmSync(snapshotDir, { recursive: true, force: true });
		throw new Error(
			dumpResult.outputText || "Local Supabase data snapshot export failed.",
		);
	}

	const migrationFingerprint = buildRepoMigrationFingerprint(repoRoot);
	const dataSizeBytes = fs.statSync(dataPath).size;
	const dataHash = hashFile(dataPath);
	const manifest = buildSnapshotManifest({
		snapshotId,
		snapshotDir,
		createdAt,
		dataPath,
		dataHash,
		dataSizeBytes,
		statusPayload,
		migrationFingerprint,
	});
	const manifestPath = getSnapshotManifestPath(snapshotDir);
	const manifestTmp = `${manifestPath}.tmp`;
	fs.writeFileSync(
		manifestTmp,
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8",
	);
	fs.renameSync(manifestTmp, manifestPath);

	console.log(
		`Snapshot saved: ${snapshotId} (${formatBytes(dataSizeBytes)}) at ${snapshotDir}`,
	);
}

function printSnapshotPlan({
	descriptor,
	currentFingerprint,
	migrationDrift,
}) {
	const manifest = descriptor.manifest;
	const dataPath = manifest?.files?.data?.path || path.join(descriptor.snapshotDir, "data.sql");
	console.log(`Snapshot: ${descriptor.snapshotId}`);
	console.log(`Created: ${manifest?.createdAt || "unknown"}`);
	console.log(`Directory: ${descriptor.snapshotDir}`);
	console.log(`Data file: ${dataPath}`);
	console.log(`Data size: ${formatBytes(descriptor.sizeBytes)}`);
	console.log(`Migration fingerprint match: ${migrationDrift ? "no" : "yes"}`);
	if (manifest?.migrationFingerprint?.latest || currentFingerprint.latest) {
		console.log(
			`Snapshot migration tip: ${manifest?.migrationFingerprint?.latest || "none"}`,
		);
		console.log(`Current migration tip: ${currentFingerprint.latest || "none"}`);
	}
	console.log("Import plan:");
	console.log("1. Ensure local Supabase is running.");
	console.log("2. Reset the local database from repo migrations.");
	console.log("3. Replay the snapshot data-only SQL dump.");
	console.log(
		"4. Leave Docker-owned runtime services and machine-local DB volumes otherwise disposable.",
	);
	if (migrationDrift) {
		console.log(
			"Warning: repo migrations changed since this snapshot was exported.",
		);
	}
}

async function runImport(options) {
	const snapshotRoot = path.resolve(
		String(options["snapshot-root"] || getSupabaseSnapshotRoot()),
	);
	const selection =
		String(options.snapshot || options._[0] || "").trim() || "latest";
	const descriptor = resolveSnapshotSelection(selection, snapshotRoot);
	if (!descriptor) {
		throw new Error(
			`Supabase snapshot '${selection}' was not found under ${snapshotRoot}.`,
		);
	}

	const manifest = descriptor.manifest;
	if (!manifest) {
		throw new Error(`Snapshot manifest is missing: ${descriptor.snapshotDir}`);
	}

	const dataPath = manifest?.files?.data?.path || path.join(descriptor.snapshotDir, "data.sql");
	if (!fs.existsSync(dataPath)) {
		throw new Error(`Snapshot data file is missing: ${dataPath}`);
	}

	const currentFingerprint = buildRepoMigrationFingerprint(repoRoot);
	const snapshotFingerprint = manifest?.migrationFingerprint || null;
	const migrationDrift =
		Boolean(snapshotFingerprint?.hash) &&
		Boolean(currentFingerprint.hash) &&
		snapshotFingerprint.hash !== currentFingerprint.hash;

	if (options["dry-run"]) {
		printSnapshotPlan({
			descriptor,
			currentFingerprint,
			migrationDrift,
		});
		return;
	}

	if (!options.force) {
		throw new Error(
			"Import is destructive to the local Supabase database. Re-run with --force.",
		);
	}

	if (migrationDrift && !options["allow-migration-drift"]) {
		throw new Error(
			"Snapshot migrations do not match the current repo migrations. Align the repo or re-run with --allow-migration-drift if you intentionally want the recovery import anyway.",
		);
	}

	await ensureLocalSupabaseReady({
		allowStart: !options["no-start"],
	});
	console.log(`Resetting local Supabase from current repo migrations...`);
	const resetResult = runSupabaseCommand(
		["--agent=no", "db", "reset", "--local", "--yes"],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	if (!resetResult.ok) {
		throw new Error(resetResult.outputText || "Local Supabase reset failed.");
	}

	console.log(`Replaying snapshot data from ${dataPath}...`);
	const importResult = runSupabaseCommand(
		["--agent=no", "db", "query", "--local", "--file", dataPath],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	if (!importResult.ok) {
		throw new Error(importResult.outputText || "Local Supabase import failed.");
	}

	const importReportPath = path.join(descriptor.snapshotDir, "last-import.json");
	const importReportTmp = `${importReportPath}.tmp`;
	fs.writeFileSync(
		importReportTmp,
		`${JSON.stringify(
			{
				importedAt: new Date().toISOString(),
				repoRoot,
				snapshotId: descriptor.snapshotId,
				migrationDrift,
				currentMigrationFingerprint: currentFingerprint,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	fs.renameSync(importReportTmp, importReportPath);

	console.log(`Snapshot import completed: ${descriptor.snapshotId}`);
	if (migrationDrift) {
		console.warn(
			"Snapshot import completed with migration drift override. Review runtime behavior before relying on this workstation state.",
		);
	}
}

function runList(options) {
	const snapshotRoot = path.resolve(
		String(options["snapshot-root"] || getSupabaseSnapshotRoot()),
	);
	const limit = Number.parseInt(String(options.limit || "20"), 10);
	const snapshots = listLocalSupabaseSnapshots(snapshotRoot).slice(
		0,
		Number.isFinite(limit) && limit > 0 ? limit : 20,
	);
	console.log(`Snapshot root: ${snapshotRoot}`);
	if (snapshots.length === 0) {
		console.log("No local Supabase recovery snapshots were found.");
		return;
	}

	for (const snapshot of snapshots) {
		console.log(
			`- ${snapshot.snapshotId} | ${snapshot.createdAt || "unknown"} | ${formatBytes(snapshot.sizeBytes)}${snapshot.workstationId ? ` | ${snapshot.workstationId}` : ""}`,
		);
	}
}

async function main() {
	const options = parseArgs(argv);
	switch (String(command || "").trim().toLowerCase()) {
		case "list":
			runList(options);
			return;
		case "export":
			await runExport(options);
			return;
		case "import":
			await runImport(options);
			return;
		case "help":
		case "--help":
		case "-h":
			printUsage();
			return;
		default:
			throw new Error(`Unknown command '${command}'.`);
	}
}

main().catch((error) => {
	console.error(`supabase-local-snapshot: ${error.message}`);
	printUsage();
	process.exit(1);
});
