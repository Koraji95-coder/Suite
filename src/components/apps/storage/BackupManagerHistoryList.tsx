import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { BackupHistoryEntry } from "./storageTypes";

interface BackupManagerHistoryListProps {
	palette: ColorScheme;
	history: BackupHistoryEntry[];
	formatSize: (bytes: number) => string;
}

export function BackupManagerHistoryList({
	palette,
	history,
	formatSize,
}: BackupManagerHistoryListProps) {
	if (history.length === 0) return null;

	return (
		<div>
			<div
				style={{
					fontWeight: 600,
					fontSize: 14,
					color: palette.text,
					marginBottom: 10,
				}}
			>
				Backup History
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{history.slice(0, 10).map((entry, index) => (
					<div
						key={`${entry.timestamp}-${index}`}
						style={{
							display: "flex",
							gap: 16,
							padding: "6px 12px",
							borderRadius: 6,
							fontSize: 12,
							background: hexToRgba(palette.surface, 0.3),
							color: palette.textMuted,
						}}
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
