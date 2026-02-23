import yaml from "js-yaml";
import { logger } from "./logger";
import { supabase } from "./supabase";

const BACKUP_STORAGE_KEY = "suite_yaml_backup";
const BACKUP_TIMESTAMP_KEY = "suite_yaml_backup_timestamp";

// All tables to back up
const BACKUP_TABLES = [
	"projects",
	"tasks",
	"files",
	"activity_log",
	"calendar_events",
	"formulas",
	"saved_calculations",
	"saved_circuits",
	"whiteboards",
	"ai_conversations",
	"ai_memory",
	"block_library",
	"automation_workflows",
	"drawing_annotations",
	"user_preferences",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupData {
	metadata: {
		exported_at: string;
		supabase_url: string;
		version: string;
		table_count: number;
		total_rows: number;
	};
	tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Fetch all data from all tables and return as a structured object.
 */
export async function fetchAllData(): Promise<BackupData> {
	const tables: Record<string, Record<string, unknown>[]> = {};
	let totalRows = 0;

	for (const tableName of BACKUP_TABLES) {
		try {
			const { data, error } = await supabase
				.from(tableName)
				.select("*")
				.order("created_at", { ascending: true });

			if (error) {
				console.warn(`Backup: skipping table "${tableName}":`, error.message);
				tables[tableName] = [];
			} else {
				tables[tableName] = (data ?? []) as Record<string, unknown>[];
				totalRows += tables[tableName].length;
			}
		} catch {
			tables[tableName] = [];
		}
	}

	return {
		metadata: {
			exported_at: new Date().toISOString(),
			supabase_url: import.meta.env.VITE_SUPABASE_URL ?? "",
			version: "1.0",
			table_count: BACKUP_TABLES.length,
			total_rows: totalRows,
		},
		tables,
	};
}

/**
 * Convert backup data to YAML string.
 */
export function toYaml(data: BackupData): string {
	return yaml.dump(data, {
		indent: 2,
		lineWidth: 120,
		noRefs: true,
		sortKeys: false,
	});
}

/**
 * Parse a YAML string back into BackupData.
 */
export function fromYaml(yamlStr: string): BackupData {
	return yaml.load(yamlStr) as BackupData;
}

/**
 * Save backup YAML to localStorage (auto-sync).
 */
export function saveToLocalStorage(yamlStr: string): void {
	try {
		localStorage.setItem(BACKUP_STORAGE_KEY, yamlStr);
		localStorage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
	} catch (e) {
		console.warn("Backup: localStorage save failed (quota?):", e);
	}
}

/**
 * Get the last backup timestamp from localStorage.
 */
export function getLastBackupTimestamp(): string | null {
	return localStorage.getItem(BACKUP_TIMESTAMP_KEY);
}

/**
 * Get the backup YAML from localStorage.
 */
export function getFromLocalStorage(): string | null {
	return localStorage.getItem(BACKUP_STORAGE_KEY);
}

/**
 * Save backup YAML to disk via the Vite dev server plugin.
 * Falls back silently if the dev server endpoint isn't available (e.g. in production).
 */
export async function saveToDisk(
	yamlStr: string,
	filename?: string,
): Promise<{ ok: boolean; filename?: string }> {
	const name =
		filename ??
		`suite_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.yaml`;
	try {
		const res = await fetch("/api/backup/save", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: name, content: yamlStr }),
		});
		if (res.ok) {
			const json = await res.json();
			return { ok: true, filename: json.filename };
		}
		return { ok: false };
	} catch {
		// Dev server not available (production build) — skip disk save
		return { ok: false };
	}
}

/**
 * List backup files on disk via the Vite dev server plugin.
 */
export interface BackupFileInfo {
	name: string;
	size: number;
	modified: string;
}

export async function listBackupFiles(): Promise<BackupFileInfo[]> {
	try {
		const res = await fetch("/api/backup/list");
		if (res.ok) return await res.json();
		return [];
	} catch {
		return [];
	}
}

/**
 * Read a backup file from disk via the Vite dev server plugin.
 */
export async function readBackupFile(filename: string): Promise<string | null> {
	try {
		const res = await fetch(
			`/api/backup/read?file=${encodeURIComponent(filename)}`,
		);
		if (res.ok) return await res.text();
		return null;
	} catch {
		return null;
	}
}

/**
 * Delete a backup file from disk via the Vite dev server plugin.
 */
export async function deleteBackupFile(filename: string): Promise<boolean> {
	try {
		const res = await fetch(
			`/api/backup/delete?file=${encodeURIComponent(filename)}`,
			{ method: "DELETE" },
		);
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Full backup: fetch all data → convert to YAML → save to localStorage + disk.
 * Returns the YAML string.
 */
export async function runFullBackup(): Promise<string> {
	const data = await fetchAllData();
	const yamlStr = toYaml(data);
	saveToLocalStorage(yamlStr);
	// Also save to disk (fire-and-forget, don't block on it)
	saveToDisk(yamlStr).catch(() => {
		// Intentionally ignore errors from disk backup
	});
	return yamlStr;
}

/**
 * Download the YAML backup as a browser file download.
 */
export function downloadYaml(yamlStr: string, filename?: string): void {
	const name =
		filename ??
		`suite_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.yaml`;
	const blob = new Blob([yamlStr], { type: "text/yaml;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Restore data from a YAML backup into Supabase.
 * Upserts rows so existing data is updated, new data is inserted.
 */
export async function restoreFromYaml(
	yamlStr: string,
): Promise<{ restored: number; errors: string[] }> {
	const data = fromYaml(yamlStr);
	let restored = 0;
	const errors: string[] = [];

	// Restore in dependency order (projects before tasks, etc.)
	const orderedTables: BackupTable[] = [
		"formulas",
		"saved_calculations",
		"saved_circuits",
		"user_preferences",
		"projects",
		"tasks",
		"files",
		"activity_log",
		"calendar_events",
		"whiteboards",
		"ai_conversations",
		"ai_memory",
		"block_library",
		"automation_workflows",
		"drawing_annotations",
	];

	for (const tableName of orderedTables) {
		const rows = data.tables[tableName];
		if (!rows || rows.length === 0) continue;

		try {
			const { error } = await supabase
				.from(tableName)
				.upsert(rows, { onConflict: "id" });

			if (error) {
				errors.push(`${tableName}: ${error.message}`);
			} else {
				restored += rows.length;
			}
		} catch (e) {
			errors.push(
				`${tableName}: ${e instanceof Error ? e.message : "Unknown error"}`,
			);
		}
	}

	return { restored, errors };
}

/**
 * Debounced auto-backup. Call this after any data mutation.
 * Waits 2 seconds after the last call before actually running the backup,
 * so rapid successive edits don't spam the database.
 */
let backupTimer: ReturnType<typeof setTimeout> | null = null;
const BACKUP_DEBOUNCE_MS = 2000;

export function triggerAutoBackup(): void {
	if (backupTimer) clearTimeout(backupTimer);
	backupTimer = setTimeout(async () => {
		try {
			await runFullBackup();
			logger.info("Auto-backup completed", "BackupManager");
		} catch (e) {
			logger.warn("Auto-backup failed", "BackupManager", e);
		}
	}, BACKUP_DEBOUNCE_MS);
}
