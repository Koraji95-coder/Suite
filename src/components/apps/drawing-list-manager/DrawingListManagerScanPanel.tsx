import { FolderOpen, Search, Shuffle } from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface DrawingListManagerScanPanelProps {
	palette: ColorScheme;
	scanQuery: string;
	setScanQuery: (value: string) => void;
	onFolderScan: (files: FileList | null) => void;
	onRenumber: () => void;
	skipped: string[];
}

export function DrawingListManagerScanPanel({
	palette,
	scanQuery,
	setScanQuery,
	onFolderScan,
	onRenumber,
	skipped,
}: DrawingListManagerScanPanelProps) {
	return (
		<div
			style={{
				padding: 18,
				borderRadius: 16,
				border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				background: `linear-gradient(135deg, ${hexToRgba(palette.surface, 0.8)} 0%, ${hexToRgba(palette.surfaceLight, 0.3)} 100%)`,
				display: "grid",
				gap: 14,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 10,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<FolderOpen size={18} color={palette.primary} />
					<div>
						<div style={{ fontWeight: 600 }}>Scan a drawing folder</div>
						<div style={{ fontSize: 12, color: palette.textMuted }}>
							Drag in a folder of DWG/PDF files or select a directory to
							validate.
						</div>
					</div>
				</div>
				<label
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 12px",
						borderRadius: 8,
						background: hexToRgba(palette.primary, 0.1),
						color: palette.primary,
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						cursor: "pointer",
						fontSize: 12,
						fontWeight: 600,
					}}
				>
					<FolderOpen size={14} />
					Select Folder
					<input
						type="file"
						multiple
						// @ts-expect-error - webkitdirectory is needed for folder pickers.
						webkitdirectory="true"
						onChange={(event) => onFolderScan(event.target.files)}
						style={{ display: "none" }}
					/>
				</label>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<Search size={16} color={palette.textMuted} />
				<input
					value={scanQuery}
					onChange={(event) => setScanQuery(event.target.value)}
					placeholder="Search drawings, titles, or numbers"
					style={{
						flex: 1,
						padding: "8px 10px",
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						background: hexToRgba(palette.surfaceLight, 0.35),
						color: palette.text,
						fontSize: 13,
					}}
				/>
				<button
					type="button"
					onClick={onRenumber}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "8px 12px",
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						background: hexToRgba(palette.primary, 0.12),
						color: palette.primary,
						fontSize: 12,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					<Shuffle size={14} />
					Auto Renumber
				</button>
			</div>
			{skipped.length > 0 && (
				<div style={{ fontSize: 12, color: palette.textMuted }}>
					Skipped sequences: {skipped.slice(0, 8).join(", ")}
					{skipped.length > 8 ? ` +${skipped.length - 8} more` : ""}
				</div>
			)}
		</div>
	);
}
