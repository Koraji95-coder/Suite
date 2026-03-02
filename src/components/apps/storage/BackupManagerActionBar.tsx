import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import type { ChangeEvent, CSSProperties, RefObject } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface BackupManagerActionBarProps {
	palette: ColorScheme;
	status: "idle" | "running" | "done" | "error";
	lastBackup: string | null;
	loadingFiles: boolean;
	fileRef: RefObject<HTMLInputElement | null>;
	onBackup: () => void;
	onFileRestore: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefreshFiles: () => void;
}

export function BackupManagerActionBar({
	palette,
	status,
	lastBackup,
	loadingFiles,
	fileRef,
	onBackup,
	onFileRestore,
	onRefreshFiles,
}: BackupManagerActionBarProps) {
	const btnBase: CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: 6,
		padding: "8px 14px",
		borderRadius: 8,
		fontSize: 13,
		cursor: "pointer",
		transition: "all 0.15s",
	};

	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<button
				onClick={onBackup}
				disabled={status === "running"}
				style={{
					...btnBase,
					background: hexToRgba(palette.primary, 0.15),
					border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
					color: palette.text,
					opacity: status === "running" ? 0.6 : 1,
				}}
			>
				{status === "running" ? (
					<Loader2 className="w-4 h-4 animate-spin" />
				) : (
					<Download className="w-4 h-4" />
				)}
				{status === "running" ? "Backing up..." : "New Backup"}
			</button>

			<button
				onClick={() => fileRef.current?.click()}
				style={{
					...btnBase,
					background: hexToRgba(palette.secondary, 0.15),
					border: `1px solid ${hexToRgba(palette.secondary, 0.3)}`,
					color: palette.text,
				}}
			>
				<Upload className="w-4 h-4" /> Restore from File
			</button>

			<input
				ref={fileRef}
				type="file"
				accept=".yaml,.yml"
				onChange={onFileRestore}
				className="hidden"
			/>

			<button
				onClick={onRefreshFiles}
				disabled={loadingFiles}
				style={{
					...btnBase,
					background: hexToRgba(palette.primary, 0.1),
					border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
					color: palette.text,
				}}
			>
				<RefreshCw
					className={`w-4 h-4 ${loadingFiles ? "animate-spin" : ""}`}
				/>
			</button>

			<div className="hidden sm:block sm:flex-1" />
			{lastBackup ? (
				<span
					className="w-full text-left text-xs sm:w-auto sm:text-right"
					style={{ color: palette.textMuted }}
				>
					Last: {new Date(lastBackup).toLocaleString()}
				</span>
			) : null}
		</div>
	);
}
