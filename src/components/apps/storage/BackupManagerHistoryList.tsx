import type { BackupHistoryEntry } from "./storageTypes";

interface BackupManagerHistoryListProps {
	history: BackupHistoryEntry[];
	formatSize: (bytes: number) => string;
}

export function BackupManagerHistoryList({
	history,
	formatSize,
}: BackupManagerHistoryListProps) {
	if (history.length === 0) return null;

	return (
		<div>
			<div className="mb-2.5 text-sm font-semibold [color:var(--text)]">
				Backup History
			</div>
			<div className="grid gap-1">
				{history.slice(0, 10).map((entry, index) => (
					<div
						key={`${entry.timestamp}-${index}`}
						className="flex gap-4 rounded-md px-3 py-1.5 text-xs [background:color-mix(in_srgb,var(--surface)_30%,transparent)] [color:var(--text-muted)]"
					>
						<span>{new Date(entry.timestamp).toLocaleString()}</span>
						<span>{entry.tableCount} tables</span>
						<span>{formatSize(entry.size)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
