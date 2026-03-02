import type { BackupHistoryEntry } from "./storageTypes";

const HISTORY_KEY = "backup_history";

export function loadHistory(): BackupHistoryEntry[] {
	try {
		return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
	} catch {
		return [];
	}
}

export function saveHistory(history: BackupHistoryEntry[]) {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
