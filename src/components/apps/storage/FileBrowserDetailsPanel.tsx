import { Download, Trash2, X } from "lucide-react";
import styles from "./FileBrowserDetailsPanel.module.css";
import { formatSize, getFileIcon } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserDetailsPanelProps {
	selected: StorageFile;
	onClose: () => void;
	onDownload: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

export function FileBrowserDetailsPanel({
	selected,
	onClose,
	onDownload,
	onRequestDelete,
}: FileBrowserDetailsPanelProps) {
	const details: [string, string][] = [
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
	];

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<span className={styles.title}>Details</span>
				<button onClick={onClose} className={styles.closeButton}>
					<X className={styles.closeIcon} />
				</button>
			</div>

			<div className={styles.preview}>{getFileIcon(selected.type)}</div>

			{details.map(([label, value]) => (
				<div key={label} className={styles.detailRow}>
					<div className={styles.detailLabel}>{label}</div>
					<div className={styles.detailValue}>{value}</div>
				</div>
			))}

			<div className={styles.actions}>
				<button
					onClick={() => onDownload(selected)}
					className={styles.downloadButton}
				>
					<Download className={styles.actionIcon} /> Download
				</button>
				<button
					onClick={() => onRequestDelete(selected)}
					className={styles.deleteButton}
				>
					<Trash2 className={styles.actionIcon} />
				</button>
			</div>
		</div>
	);
}
