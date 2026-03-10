import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { cn } from "@/lib/utils";
import styles from "./BackupManagerActionBar.module.css";

interface BackupManagerActionBarProps {
	status: "idle" | "running" | "done" | "error";
	lastBackup: string | null;
	loadingFiles: boolean;
	fileRef: RefObject<HTMLInputElement | null>;
	onBackup: () => void;
	onFileRestore: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefreshFiles: () => void;
}

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
		<div className={styles.root}>
			<button
				onClick={onBackup}
				disabled={status === "running"}
				className={cn(styles.buttonBase, styles.backupButton)}
			>
				{status === "running" ? (
					<Loader2 className={cn(styles.icon, styles.spinning)} />
				) : (
					<Download className={styles.icon} />
				)}
				{status === "running" ? "Backing up..." : "New Backup"}
			</button>

			<button
				onClick={() => fileRef.current?.click()}
				className={cn(styles.buttonBase, styles.restoreButton)}
			>
				<Upload className={styles.icon} /> Restore from File
			</button>

			<input
				ref={fileRef}
				type="file"
				accept=".yaml,.yml"
				onChange={onFileRestore}
				className={styles.hiddenInput}
			name="backupmanageractionbar_input_47"
			/>

			<button
				onClick={onRefreshFiles}
				disabled={loadingFiles}
				className={cn(styles.buttonBase, styles.refreshButton)}
			>
				<RefreshCw
					className={cn(styles.icon, loadingFiles && styles.spinning)}
				/>
			</button>

			<div className={styles.spacer} />
			{lastBackup && (
				<span className={styles.lastBackup}>
					Last: {new Date(lastBackup).toLocaleString()}
				</span>
			)}
		</div>
	);
}
