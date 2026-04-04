import yaml from "js-yaml";
import { getLocalStorageApi } from "../lib/browserStorage";
import { logger } from "../lib/logger";
import { supabase } from "./client";

const BACKUP_STORAGE_KEY = "suite_yaml_backup";
const BACKUP_TIMESTAMP_KEY = "suite_yaml_backup_timestamp";
const BACKUP_API_KEY = import.meta.env.VITE_API_KEY ?? "";

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

const BACKUP_ORDER_COLUMNS: Partial<Record<BackupTable, readonly string[]>> = {
	files: ["uploaded_at", "id"],
	activity_log: ["timestamp", "id"],
	calendar_events: ["due_date", "start_at", "id"],
};

const DEFAULT_BACKUP_ORDER_COLUMNS = [
	"created_at",
	"updated_at",
	"id",
] as const;

function getBackupOrderColumns(tableName: BackupTable): readonly string[] {
	return BACKUP_ORDER_COLUMNS[tableName] ?? DEFAULT_BACKUP_ORDER_COLUMNS;
}

function isMissingOrderColumnError(error: unknown): boolean {
	const message =
		error && typeof error === "object" && "message" in error
			? String(error.message ?? "").toLowerCase()
			: "";
	return (
		message.includes("does not exist") ||
		message.includes("could not find") ||
		message.includes("unknown column")
	);
}

async function fetchTableRows(tableName: BackupTable): Promise<{
	data: Record<string, unknown>[] | null;
	error: { message: string } | null;
}> {
	let lastError: { message: string } | null = null;

	for (const orderColumn of getBackupOrderColumns(tableName)) {
		const { data, error } = await supabase
			.from(tableName)
			.select("*")
			.order(orderColumn, { ascending: true });

		if (!error) {
			return {
				data: (data ?? []) as Record<string, unknown>[],
				error: null,
			};
		}

		lastError = { message: error.message };
		if (!isMissingOrderColumnError(error)) {
			break;
		}
	}

	const { data, error } = await supabase.from(tableName).select("*");
	if (!error) {
		return {
			data: (data ?? []) as Record<string, unknown>[],
			error: null,
		};
	}

	return {
		data: null,
		error: { message: error.message || lastError?.message || "Unknown error" },
	};
}

async function upsertBackupRows(
	tableName: BackupTable,
	rows: Record<string, unknown>[],
) {
	// Restore data comes from a heterogeneous YAML payload, so this boundary stays
	// intentionally dynamic instead of pretending each loop iteration is statically typed.
	return await supabase
		.from(tableName as never)
		.upsert(rows as never, { onConflict: "id" });
}

function withBackupHeaders(base?: HeadersInit): HeadersInit {
	const headers = new Headers(base);
	if (BACKUP_API_KEY) headers.set("X-API-Key", BACKUP_API_KEY);
	return headers;
}

/**
 * Fetch all data from all tables and return as a structured object.
 */
export async function fetchAllData(): Promise<BackupData> {
	const tables: Record<string, Record<string, unknown>[]> = {};
	let totalRows = 0;

	for (const tableName of BACKUP_TABLES) {
		try {
			const { data, error } = await fetchTableRows(tableName);

			if (error) {
				logger.warn(
					`Backup: skipping table "${tableName}"`,
					"backupManager",
					error.message,
				);
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
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		storage.setItem(BACKUP_STORAGE_KEY, yamlStr);
		storage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
	} catch (e) {
		logger.warn(
			"Backup: localStorage save failed (quota?)",
			"backupManager",
			e,
		);
	}
}

/**
 * Get the last backup timestamp from localStorage.
 */
export function getLastBackupTimestamp(): string | null {
	const storage = getLocalStorageApi();
	if (!storage) return null;
	try {
		return storage.getItem(BACKUP_TIMESTAMP_KEY);
	} catch {
		return null;
	}
}

/**
 * Get the backup YAML from localStorage.
 */
export function getFromLocalStorage(): string | null {
	const storage = getLocalStorageApi();
	if (!storage) return null;
	try {
		return storage.getItem(BACKUP_STORAGE_KEY);
	} catch {
		return null;
	}
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
			headers: withBackupHeaders({ "Content-Type": "application/json" }),
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
		const res = await fetch("/api/backup/list", {
			headers: withBackupHeaders(),
		});
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
			{
				headers: withBackupHeaders(),
			},
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
			{
				method: "DELETE",
				headers: withBackupHeaders(),
			},
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
		"block_library",
		"automation_workflows",
		"drawing_annotations",
	];

	for (const tableName of orderedTables) {
		const rows = data.tables[tableName];
		if (!rows || rows.length === 0) continue;

		try {
			const { error } = await upsertBackupRows(tableName, rows);

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
