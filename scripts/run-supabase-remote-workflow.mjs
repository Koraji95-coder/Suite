#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv, readSetting } from "./lib/env-files.mjs";
import { runSupabaseSync } from "./lib/supabase-cli.mjs";
import {
	appendSupabaseSyncLogLine,
	getSupabaseSyncStatusPaths,
	writeSupabaseSyncStatus,
} from "./lib/supabase-sync-status.mjs";

const repoRoot = process.cwd();
const argv = process.argv.slice(2);
const command = String(argv[0] || "")
	.trim()
	.toLowerCase();
const flags = new Set(argv.slice(1));
const dryRun = flags.has("--dry-run");
const notifyOnFailure = flags.has("--notify-on-failure");
const silentSuccess = flags.has("--silent-success");
const mergedEnv = { ...loadRepoEnv(repoRoot), ...process.env };
const remoteProjectRef = readSetting(mergedEnv, "SUPABASE_REMOTE_PROJECT_REF");
const remoteDbPassword = readSetting(mergedEnv, "SUPABASE_DB_PASSWORD");
const statusPaths = getSupabaseSyncStatusPaths(mergedEnv);

if (!["preflight", "push"].includes(command)) {
	console.error(
		"Usage: node scripts/run-supabase-remote-workflow.mjs <preflight|push> [--dry-run] [--notify-on-failure] [--silent-success]",
	);
	process.exit(1);
}

function quotePowerShell(value) {
	return `'${String(value || "").replace(/'/g, "''")}'`;
}

function spawnPowerShell(commandText) {
	return spawnSync(
		"PowerShell.exe",
		["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandText],
		{
			cwd: repoRoot,
			encoding: "utf8",
			windowsHide: true,
		},
	);
}

function trimOutput(value) {
	return String(value || "").trim();
}

function excerptText(text, maxLines = 18, maxChars = 4000) {
	const trimmed = trimOutput(text);
	if (!trimmed) return "";
	const lines = trimmed.split(/\r?\n/).slice(0, maxLines).join("\n");
	if (lines.length <= maxChars) return lines;
	return `${lines.slice(0, maxChars)}…`;
}

function summarizeDryRunOutput(outputText) {
	const trimmed = trimOutput(outputText);
	if (!trimmed) return "Dry-run completed.";
	const lower = trimmed.toLowerCase();
	if (
		lower.includes("remote database is up to date") ||
		lower.includes("schema is up to date") ||
		lower.includes("no changes found")
	) {
		return "Hosted database is up to date.";
	}

	const migrationDir = path.join(repoRoot, "supabase", "migrations");
	let pendingCount = 0;
	if (fs.existsSync(migrationDir)) {
		for (const fileName of fs.readdirSync(migrationDir)) {
			if (trimmed.includes(fileName)) {
				pendingCount += 1;
			}
		}
	}
	if (pendingCount > 0) {
		return `${pendingCount} migration(s) pending for hosted Supabase.`;
	}
	return "Hosted migration dry-run completed.";
}

function resolveMode() {
	const explicit = readSetting(mergedEnv, "SUITE_SUPABASE_MODE").toLowerCase();
	if (explicit === "local") return "local";
	return "hosted";
}

function resolveLocalEmailMode() {
	const explicit = readSetting(
		mergedEnv,
		"SUITE_SUPABASE_LOCAL_EMAIL_MODE",
	).toLowerCase();
	return explicit === "gmail" ? "gmail" : "mailpit";
}

function runCli(args) {
	const result = runSupabaseSync(args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
	});
	return {
		ok: result.status === 0,
		status: result.status || 0,
		stdout: trimOutput(result.stdout),
		stderr: trimOutput(result.stderr),
	};
}

async function checkGatewayHealth() {
	const host = readSetting(mergedEnv, "AGENT_GATEWAY_HOST", "127.0.0.1");
	const configuredPort = readSetting(mergedEnv, "AGENT_GATEWAY_PORT", "3000");
	const port = Number.parseInt(configuredPort, 10);
	const probeHost =
		host === "0.0.0.0" || host === "::" || host === "*" ? "127.0.0.1" : host;
	const url = `http://${probeHost}:${Number.isFinite(port) ? port : 3000}/health`;

	try {
		const response = await fetch(url, {
			method: "GET",
			signal: AbortSignal.timeout(3000),
		});
		return {
			level: response.ok ? "ok" : "warning",
			ok: response.ok,
			message: response.ok
				? "Gateway health endpoint is available."
				: `Gateway health returned HTTP ${response.status}.`,
		};
	} catch (error) {
		return {
			level: "warning",
			ok: false,
			message:
				error instanceof Error ? error.message : "Gateway health check failed.",
		};
	}
}

function checkLocalSupabase() {
	const result = runCli(["status", "-o", "env"]);
	return {
		level: result.ok ? "ok" : "warning",
		ok: result.ok,
		message: result.ok
			? "Local Supabase stack is running."
			: "Local Supabase stack is not running.",
		output: excerptText(result.stdout || result.stderr),
	};
}

function checkCliAuth() {
	const result = runCli(["projects", "list", "--output", "json"]);
	return {
		level: result.ok ? "ok" : "error",
		ok: result.ok,
		message: result.ok
			? "Supabase CLI auth is available."
			: excerptText(result.stderr || result.stdout) ||
				"Supabase CLI is not logged in for hosted operations.",
		output: excerptText(result.stdout || result.stderr),
	};
}

function buildPasswordArgs() {
	return remoteDbPassword ? ["--password", remoteDbPassword] : [];
}

function verifyLinkedProject() {
	const migrationList = runCli([
		"migration",
		"list",
		"--linked",
		"--output",
		"json",
		...buildPasswordArgs(),
	]);
	if (migrationList.ok) {
		return {
			ok: true,
			message: "Linked hosted project is already accessible.",
			output: excerptText(migrationList.stdout || migrationList.stderr),
			migrationList,
		};
	}

	if (!remoteProjectRef) {
		return {
			ok: false,
			message:
				"Hosted project ref is missing. Set SUPABASE_REMOTE_PROJECT_REF in .env.local before using remote push.",
			output: excerptText(migrationList.stderr || migrationList.stdout),
			migrationList,
		};
	}

	const linkResult = runCli([
		"link",
		"--project-ref",
		remoteProjectRef,
		"--yes",
		...buildPasswordArgs(),
	]);
	if (!linkResult.ok) {
		return {
			ok: false,
			message:
				excerptText(linkResult.stderr || linkResult.stdout) ||
				"Unable to link the hosted Supabase project.",
			output: excerptText(linkResult.stderr || linkResult.stdout),
			migrationList,
			linkResult,
		};
	}

	const relisted = runCli([
		"migration",
		"list",
		"--linked",
		"--output",
		"json",
		...buildPasswordArgs(),
	]);
	return {
		ok: relisted.ok,
		message: relisted.ok
			? "Linked hosted project verified."
			: excerptText(relisted.stderr || relisted.stdout) ||
				"Hosted project linked, but migration listing still failed.",
		output: excerptText(
			relisted.stdout || relisted.stderr || linkResult.stdout,
		),
		migrationList: relisted,
		linkResult,
	};
}

function runDryRunCheck() {
	const result = runCli([
		"db",
		"push",
		"--linked",
		"--dry-run",
		"--yes",
		...buildPasswordArgs(),
	]);
	return {
		ok: result.ok,
		message: result.ok
			? summarizeDryRunOutput(result.stdout || result.stderr)
			: excerptText(result.stderr || result.stdout) ||
				"Hosted migration dry-run failed.",
		output: excerptText(result.stdout || result.stderr),
		result,
	};
}

function runHostedPush() {
	const result = runCli([
		"db",
		"push",
		"--linked",
		"--yes",
		...buildPasswordArgs(),
	]);
	return {
		ok: result.ok,
		message: result.ok
			? excerptText(result.stdout) || "Hosted migrations applied successfully."
			: excerptText(result.stderr || result.stdout) ||
				"Hosted migration push failed.",
		output: excerptText(result.stdout || result.stderr),
		result,
	};
}

function buildCheck(level, ok, message, output = "") {
	return { level, ok, message, output };
}

function showFailureNotification(title, message) {
	if (process.platform !== "win32") return;
	const scriptPath = path.join(
		repoRoot,
		"scripts",
		"show-windows-notification.ps1",
	);
	if (!fs.existsSync(scriptPath)) return;

	spawnSync(
		"PowerShell.exe",
		[
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			scriptPath,
			"-Title",
			title,
			"-Message",
			message,
			"-Level",
			"Error",
		],
		{
			cwd: repoRoot,
			encoding: "utf8",
			windowsHide: true,
		},
	);
}

async function runPreflightWorkflow() {
	const activeMode = resolveMode();
	const localSupabase = checkLocalSupabase();
	const gateway = await checkGatewayHealth();
	const cliAuth = checkCliAuth();
	const linkedProject = cliAuth.ok ? verifyLinkedProject() : null;
	const dryRunCheck = cliAuth.ok && linkedProject?.ok ? runDryRunCheck() : null;

	const checks = {
		mode: buildCheck("ok", true, `Active app target: ${activeMode}.`),
		localEmailMode: buildCheck(
			"ok",
			true,
			`Local auth email mode: ${resolveLocalEmailMode()}.`,
		),
		localSupabase,
		gateway,
		cliAuth,
		projectRef: buildCheck(
			remoteProjectRef ? "ok" : "warning",
			Boolean(remoteProjectRef),
			remoteProjectRef
				? `Hosted project ref configured: ${remoteProjectRef}.`
				: "Hosted project ref is not set in .env.local.",
		),
		link: linkedProject
			? buildCheck(
					linkedProject.ok ? "ok" : "error",
					linkedProject.ok,
					linkedProject.message,
					linkedProject.output,
				)
			: buildCheck(
					"error",
					false,
					"Hosted link check skipped because CLI auth is unavailable.",
				),
		dryRun: dryRunCheck
			? buildCheck(
					dryRunCheck.ok ? "ok" : "error",
					dryRunCheck.ok,
					dryRunCheck.message,
					dryRunCheck.output,
				)
			: buildCheck(
					"error",
					false,
					"Hosted dry-run skipped because the linked project is unavailable.",
				),
	};

	const ok = Boolean(cliAuth.ok && linkedProject?.ok && dryRunCheck?.ok);
	const pushReady = Boolean(
		ok && (activeMode !== "local" || (localSupabase.ok && gateway.ok)),
	);
	const localRuntimeReady = Boolean(localSupabase.ok && gateway.ok);
	const summary = ok
		? dryRunCheck?.message || "Hosted Supabase preflight is ready."
		: dryRunCheck?.message ||
			linkedProject?.message ||
			cliAuth.message ||
			"Hosted Supabase preflight failed.";
	const pushReadinessSummary = pushReady
		? "Hosted migration push is ready."
		: activeMode === "local" && !localRuntimeReady
			? "Hosted push is blocked until local Supabase and the gateway are healthy."
			: !cliAuth.ok
				? cliAuth.message || "Hosted push is blocked until CLI auth is ready."
				: !linkedProject?.ok
					? linkedProject?.message ||
						"Hosted push is blocked until the hosted project link check succeeds."
					: !dryRunCheck?.ok
						? dryRunCheck?.message ||
							"Hosted push is blocked until the hosted dry-run succeeds."
						: "Hosted push is blocked because the active target checks are incomplete.";

	const payload = {
		kind: "preflight",
		ok,
		pushReady,
		timestamp: new Date().toISOString(),
		summary,
		pushReadinessSummary,
		projectRef: remoteProjectRef || null,
		statusDir: statusPaths.root,
		logPath: statusPaths.logPath,
		checks,
	};

	writeSupabaseSyncStatus("preflight", payload, mergedEnv);
	if (!silentSuccess || !ok) {
		console.log(JSON.stringify(payload, null, 2));
	}
	if (!ok && notifyOnFailure) {
		showFailureNotification(
			"Suite Supabase preflight failed",
			summary.length > 240 ? `${summary.slice(0, 237)}...` : summary,
		);
	}
	return payload;
}

async function runPushWorkflow() {
	const preflight = await runPreflightWorkflow();
	if (!preflight.ok || !preflight.pushReady) {
		const payload = {
			kind: "push",
			ok: false,
			dryRun,
			timestamp: new Date().toISOString(),
			summary: preflight.ok
				? preflight.pushReadinessSummary ||
					"Hosted push aborted because preflight reported local runtime issues."
				: "Hosted push aborted because preflight failed.",
			projectRef: remoteProjectRef || null,
			statusDir: statusPaths.root,
			logPath: statusPaths.logPath,
			preflight,
		};
		writeSupabaseSyncStatus("push", payload, mergedEnv);
		console.log(JSON.stringify(payload, null, 2));
		process.exit(1);
	}

	if (dryRun) {
		const payload = {
			kind: "push",
			ok: true,
			dryRun: true,
			timestamp: new Date().toISOString(),
			summary: preflight.summary,
			projectRef: remoteProjectRef || null,
			statusDir: statusPaths.root,
			logPath: statusPaths.logPath,
			preflight,
		};
		writeSupabaseSyncStatus("push", payload, mergedEnv);
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	const pushResult = runHostedPush();
	const payload = {
		kind: "push",
		ok: pushResult.ok,
		dryRun: false,
		timestamp: new Date().toISOString(),
		summary: pushResult.message,
		projectRef: remoteProjectRef || null,
		statusDir: statusPaths.root,
		logPath: statusPaths.logPath,
		preflight,
		output: pushResult.output,
	};
	writeSupabaseSyncStatus("push", payload, mergedEnv);
	console.log(JSON.stringify(payload, null, 2));
	if (!pushResult.ok) {
		if (notifyOnFailure) {
			showFailureNotification(
				"Suite Supabase push failed",
				pushResult.message.length > 240
					? `${pushResult.message.slice(0, 237)}...`
					: pushResult.message,
			);
		}
		process.exit(1);
	}
}

appendSupabaseSyncLogLine(
	`command=${command}${dryRun ? " --dry-run" : ""}`,
	mergedEnv,
);

if (command === "preflight") {
	const payload = await runPreflightWorkflow();
	process.exit(payload.ok ? 0 : 1);
}

await runPushWorkflow();
