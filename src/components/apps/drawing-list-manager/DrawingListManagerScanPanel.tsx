import { FolderOpen, Search, Shuffle } from "lucide-react";
import styles from "./DrawingListManagerScanPanel.module.css";

interface DrawingListManagerScanPanelProps {
	scanQuery: string;
	setScanQuery: (value: string) => void;
	onFolderScan: (files: FileList | null) => void;
	onRenumber: () => void;
	skipped: string[];
}

export function DrawingListManagerScanPanel({
	scanQuery,
	setScanQuery,
	onFolderScan,
	onRenumber,
	skipped,
}: DrawingListManagerScanPanelProps) {
	return (
		<div className={styles.root}>
			{/* Header row */}
			<div className={styles.headerRow}>
				<div className={styles.headerLeft}>
					<FolderOpen size={18} className={styles.primaryIcon} />
					<div>
						<div className={styles.title}>Scan a drawing folder</div>
						<div className={styles.copy}>
							Drag in a folder of DWG/PDF files or select a directory to
							validate.
						</div>
					</div>
				</div>
				<label className={styles.selectFolderLabel}>
					<FolderOpen size={14} />
					Select Folder
					<input
						type="file"
						multiple
						// @ts-expect-error - webkitdirectory is needed for folder pickers.
						webkitdirectory="true"
						onChange={(e) => onFolderScan(e.target.files)}
						className={styles.hiddenInput}
					/>
				</label>
			</div>

			{/* Search + renumber */}
			<div className={styles.actionsRow}>
				<Search size={16} className={styles.searchIcon} />
				<input
					value={scanQuery}
					onChange={(e) => setScanQuery(e.target.value)}
					placeholder="Search drawings, titles, or numbers"
					className={styles.searchInput}
				/>
				<button
					type="button"
					onClick={onRenumber}
					className={styles.renumberButton}
				>
					<Shuffle size={14} />
					Auto Renumber
				</button>
			</div>

			{/* Skipped sequences */}
			{skipped.length > 0 && (
				<div className={styles.skipped}>
					Skipped sequences: {skipped.slice(0, 8).join(", ")}
					{skipped.length > 8 ? ` +${skipped.length - 8} more` : ""}
				</div>
			)}
		</div>
	);
}
