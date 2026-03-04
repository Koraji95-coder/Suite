import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

interface BackupManagerActionBarProps {
	status: "idle" | "running" | "done" | "error";
	lastBackup: string | null;
	loadingFiles: boolean;
	fileRef: RefObject<HTMLInputElement | null>;
	onBackup: () => void;
	onFileRestore: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefreshFiles: () => void;
}

const btnClass =
	"inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] transition";

export function BackupManagerActionBar({
	status,
	lastBackup,
	loadingFiles,
	fileRef,
	onBackup,
	onFileRestore,
	onRefreshFiles,
}: BackupManagerActionBarProps) {
	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<button
				onClick={onBackup}
				disabled={status === "running"}
				className={`${btnClass} border-[color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)] [color:var(--text)] disabled:opacity-60`}
			>
				{status === "running" ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Download className="h-4 w-4" />
				)}
				{status === "running" ? "Backing up..." : "New Backup"}
			</button>

			<button
				onClick={() => fileRef.current?.click()}
				className={`${btnClass} border-[color-mix(in_srgb,var(--secondary)_30%,transparent)] [background:color-mix(in_srgb,var(--secondary)_15%,transparent)] [color:var(--text)]`}
			>
				<Upload className="h-4 w-4" /> Restore from File
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
				className={`${btnClass} border-[color-mix(in_srgb,var(--primary)_15%,transparent)] [background:color-mix(in_srgb,var(--primary)_10%,transparent)] [color:var(--text)]`}
			>
				<RefreshCw
					className={`h-4 w-4 ${loadingFiles ? "animate-spin" : ""}`}
				/>
			</button>

			<div className="hidden sm:block sm:flex-1" />
			{lastBackup && (
				<span className="w-full text-left text-xs sm:w-auto sm:text-right [color:var(--text-muted)]">
					Last: {new Date(lastBackup).toLocaleString()}
				</span>
			)}
		</div>
	);
}
