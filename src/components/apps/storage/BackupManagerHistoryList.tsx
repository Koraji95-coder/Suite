import styles from "./BackupManagerHistoryList.module.css";
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
			<div className={styles.title}>Backup History</div>
			<div className={styles.list}>
				{history.slice(0, 10).map((entry, index) => (
					<div key={`${entry.timestamp}-${index}`} className={styles.item}>
						<span>{new Date(entry.timestamp).toLocaleString()}</span>
						<span>{entry.tableCount} tables</span>
						<span>{formatSize(entry.size)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
