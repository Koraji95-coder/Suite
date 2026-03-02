import { Download, Trash2, X } from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import { formatSize, getFileIcon } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserDetailsPanelProps {
	palette: ColorScheme;
	selected: StorageFile;
	onClose: () => void;
	onDownload: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

export function FileBrowserDetailsPanel({
	palette,
	selected,
	onClose,
	onDownload,
	onRequestDelete,
}: FileBrowserDetailsPanelProps) {
	return (
		<div
			className="w-full lg:w-[260px] lg:shrink-0"
			style={{
				padding: 16,
				borderRadius: 10,
				background: hexToRgba(palette.surface, 0.6),
				border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<span style={{ fontWeight: 600, fontSize: 14, color: palette.text }}>
					Details
				</span>
				<button
					onClick={onClose}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						color: palette.textMuted,
					}}
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "center",
					marginBottom: 16,
					color: palette.primary,
				}}
			>
				{getFileIcon(selected.type)}
			</div>

			{[
				["Name", selected.name],
				["Type", selected.type || "Unknown"],
				["Size", selected.size ? formatSize(selected.size) : "--"],
				[
					"Created",
					selected.created_at
						? new Date(selected.created_at).toLocaleString()
						: "--",
				],
				[
					"Updated",
					selected.updated_at
						? new Date(selected.updated_at).toLocaleString()
						: "--",
				],
			].map(([label, value]) => (
				<div key={label} style={{ marginBottom: 10 }}>
					<div
						style={{ fontSize: 11, color: palette.textMuted, marginBottom: 2 }}
					>
						{label}
					</div>
					<div
						style={{
							fontSize: 13,
							color: palette.text,
							wordBreak: "break-all",
						}}
					>
						{value}
					</div>
				</div>
			))}

			<div style={{ display: "flex", gap: 8, marginTop: 16 }}>
				<button
					onClick={() => onDownload(selected)}
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 4,
						padding: "8px 0",
						borderRadius: 6,
						fontSize: 13,
						cursor: "pointer",
						background: hexToRgba(palette.primary, 0.15),
						border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
						color: palette.text,
					}}
				>
					<Download className="w-3.5 h-3.5" /> Download
				</button>
				<button
					onClick={() => onRequestDelete(selected)}
					style={{
						padding: "8px 12px",
						borderRadius: 6,
						cursor: "pointer",
						background: hexToRgba(palette.accent, 0.15),
						border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
						color: palette.accent,
					}}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
}
