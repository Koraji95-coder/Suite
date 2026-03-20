#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function trimValue(value) {
	return String(value || "").trim();
}

export function getSupabaseSyncStatusDir(envMap = process.env) {
	const explicit = trimValue(envMap.SUITE_SUPABASE_SYNC_STATUS_DIR);
	if (explicit) {
		return path.resolve(explicit);
	}

	const localAppData =
		trimValue(envMap.LOCALAPPDATA) ||
		trimValue(envMap.TEMP) ||
		path.join(os.homedir(), ".suite");
	return path.join(localAppData, "Suite", "supabase-sync");
}

export function getSupabaseSyncStatusPaths(envMap = process.env) {
	const root = getSupabaseSyncStatusDir(envMap);
	return {
		root,
		preflightPath: path.join(root, "last-preflight.json"),
		pushPath: path.join(root, "last-push.json"),
		logPath: path.join(root, "supabase-sync.log"),
	};
}

export function ensureSupabaseSyncStatusDir(envMap = process.env) {
	const { root } = getSupabaseSyncStatusPaths(envMap);
	fs.mkdirSync(root, { recursive: true });
	return root;
}

export function appendSupabaseSyncLogLine(line, envMap = process.env) {
	const { logPath } = getSupabaseSyncStatusPaths(envMap);
	ensureSupabaseSyncStatusDir(envMap);
	const timestamp = new Date().toISOString();
	fs.appendFileSync(logPath, `[${timestamp}] ${line}\n`, "utf8");
	return logPath;
}

export function writeSupabaseSyncStatus(kind, payload, envMap = process.env) {
	const { preflightPath, pushPath } = getSupabaseSyncStatusPaths(envMap);
	ensureSupabaseSyncStatusDir(envMap);
	const filePath = kind === "push" ? pushPath : preflightPath;
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	appendSupabaseSyncLogLine(
		`${kind}: ${payload?.ok ? "ok" : "error"}${payload?.summary ? ` - ${payload.summary}` : ""}`,
		envMap,
	);
	return filePath;
}

export function readSupabaseSyncStatus(kind, envMap = process.env) {
	const { preflightPath, pushPath } = getSupabaseSyncStatusPaths(envMap);
	const filePath = kind === "push" ? pushPath : preflightPath;
	if (!fs.existsSync(filePath)) return null;
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}
