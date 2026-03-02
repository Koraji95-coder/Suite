import { Download, Loader2, Shield, Trash2, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { BackupFileInfo } from "@/supabase/backupManager";

interface BackupManagerFilesListProps {
	palette: ColorScheme;
	files: BackupFileInfo[];
	loadingFiles: boolean;
	formatSize: (bytes: number) => string;
	onDownloadFile: (filename: string) => void;
	onRequestRestore: (filename: string) => void;
	onRequestDelete: (filename: string) => void;
}

export function BackupManagerFilesList({
	palette,
	files,
	loadingFiles,
	formatSize,
	onDownloadFile,
	onRequestRestore,
	onRequestDelete,
}: BackupManagerFilesListProps) {
	return (
		<div style={{ marginBottom: 20 }}>
			<div
				style={{
					fontWeight: 600,
					fontSize: 14,
					color: palette.text,
					marginBottom: 10,
					display: "flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<Shield className="w-4 h-4" style={{ color: palette.primary }} /> Backup
				Files
			</div>

			{loadingFiles ? (
				<div
					style={{ textAlign: "center", padding: 24, color: palette.textMuted }}
				>
					<Loader2 className="w-5 h-5 animate-spin mx-auto" />
				</div>
			) : files.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: 24,
						color: palette.textMuted,
						fontSize: 13,
					}}
				>
					No backup files yet
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{files.map((file) => (
						<div
							key={file.name}
							className="flex flex-wrap items-center gap-2 sm:gap-3"
							style={{
								padding: "10px 14px",
								borderRadius: 8,
								background: hexToRgba(palette.surface, 0.5),
								border: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
							}}
						>
							<span
								className="min-w-0 flex-1 basis-full sm:basis-auto"
								style={{
									fontSize: 13,
									color: palette.text,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{file.name}
							</span>
							<div
								className="flex items-center gap-3"
								style={{ color: palette.textMuted }}
							>
								<span style={{ fontSize: 12 }}>{formatSize(file.size)}</span>
								<span className="hidden text-xs sm:inline">
									{new Date(file.modified).toLocaleDateString()}
								</span>
							</div>
							<div className="ml-auto flex items-center gap-1">
								<button
									onClick={() => onDownloadFile(file.name)}
									style={iconButtonStyle(palette.primary)}
								>
									<Download className="w-4 h-4" />
								</button>
								<button
									onClick={() => onRequestRestore(file.name)}
									style={iconButtonStyle(palette.secondary)}
								>
									<Upload className="w-4 h-4" />
								</button>
								<button
									onClick={() => onRequestDelete(file.name)}
									style={iconButtonStyle(palette.accent)}
								>
									<Trash2 className="w-4 h-4" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function iconButtonStyle(color: string): CSSProperties {
	return {
		background: "none",
		border: "none",
		cursor: "pointer",
		color,
		padding: 4,
	};
}
