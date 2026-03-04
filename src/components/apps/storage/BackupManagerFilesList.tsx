import { Download, Loader2, Shield, Trash2, Upload } from "lucide-react";
import type { BackupFileInfo } from "@/supabase/backupManager";
import styles from "./BackupManagerFilesList.module.css";

interface BackupManagerFilesListProps {
	files: BackupFileInfo[];
	loadingFiles: boolean;
	formatSize: (bytes: number) => string;
	onDownloadFile: (filename: string) => void;
	onRequestRestore: (filename: string) => void;
	onRequestDelete: (filename: string) => void;
}

export function BackupManagerFilesList({
	files,
	loadingFiles,
	formatSize,
	onDownloadFile,
	onRequestRestore,
	onRequestDelete,
}: BackupManagerFilesListProps) {
	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<Shield className={styles.headerIcon} /> Backup Files
			</div>

			{loadingFiles ? (
				<div className={styles.loadingState}>
					<Loader2 className={styles.spinner} />
				</div>
			) : files.length === 0 ? (
				<div className={styles.emptyState}>No backup files yet</div>
			) : (
				<div className={styles.list}>
					{files.map((file) => (
						<div key={file.name} className={styles.item}>
							<span className={styles.fileName}>{file.name}</span>
							<div className={styles.meta}>
								<span className={styles.metaText}>{formatSize(file.size)}</span>
								<span className={styles.metaDate}>
									{new Date(file.modified).toLocaleDateString()}
								</span>
							</div>
							<div className={styles.actions}>
								<button
									onClick={() => onDownloadFile(file.name)}
									className={styles.downloadButton}
									aria-label={`Download ${file.name}`}
								>
									<Download className={styles.actionIcon} />
								</button>
								<button
									onClick={() => onRequestRestore(file.name)}
									className={styles.restoreButton}
									aria-label={`Restore ${file.name}`}
								>
									<Upload className={styles.actionIcon} />
								</button>
								<button
									onClick={() => onRequestDelete(file.name)}
									className={styles.deleteButton}
									aria-label={`Delete ${file.name}`}
								>
									<Trash2 className={styles.actionIcon} />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
