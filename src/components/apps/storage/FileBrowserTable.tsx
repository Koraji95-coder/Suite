import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import styles from "./FileBrowserTable.module.css";
import { formatSize, getFileIcon, type SortKey } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserTableProps {
	dragging: boolean;
	onDragStateChange: (dragging: boolean) => void;
	onDrop: (event: DragEvent) => void;
	sortKey: SortKey;
	sortAsc: boolean;
	onSort: (key: SortKey) => void;
	error: string | null;
	loading: boolean;
	filesLength: number;
	filteredFiles: StorageFile[];
	search: string;
	selectedName: string | null;
	onFileClick: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

export function FileBrowserTable({
	dragging,
	onDragStateChange,
	onDrop,
	sortKey,
	sortAsc,
	onSort,
	error,
	loading,
	filesLength,
	filteredFiles,
	search,
	selectedName,
	onFileClick,
	onRequestDelete,
}: FileBrowserTableProps) {
	const sortIcon = (column: SortKey) => {
		if (sortKey !== column)
			return <ArrowUpDown className={styles.sortIconMuted} />;
		return sortAsc ? (
			<ArrowUp className={styles.sortIcon} />
		) : (
			<ArrowDown className={styles.sortIcon} />
		);
	};

	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				onDragStateChange(true);
			}}
			onDragLeave={() => onDragStateChange(false)}
			onDrop={onDrop}
			className={cn(
				styles.dropZone,
				dragging ? styles.dropZoneDragging : styles.dropZoneIdle,
			)}
		>
			<div className={styles.inner}>
				{/* Header */}
				<div className={cn(styles.gridRow, styles.headerRow)}>
					<button
						onClick={() => onSort("name")}
						className={styles.headerSortButton}
					>
						Name {sortIcon("name")}
					</button>
					<button
						onClick={() => onSort("size")}
						className={styles.headerSortButton}
					>
						Size {sortIcon("size")}
					</button>
					<button
						onClick={() => onSort("created_at")}
						className={styles.headerSortButton}
					>
						Date {sortIcon("created_at")}
					</button>
					<span />
				</div>

				{error && <div className={styles.errorState}>{error}</div>}

				{loading && !filesLength && (
					<div className={styles.emptyState}>Loading...</div>
				)}

				{!loading && filteredFiles.length === 0 && (
					<div className={styles.emptyState}>
						{search
							? "No files match your search"
							: "Drop files here or click Upload"}
					</div>
				)}

				{filteredFiles.map((file) => (
					<div
						key={file.id || file.name}
						onClick={() => onFileClick(file)}
						className={cn(
							styles.gridRow,
							styles.fileRow,
							selectedName === file.name && styles.fileRowSelected,
						)}
					>
						<div className={styles.nameCell}>
							<span className={styles.fileIconWrap}>
								{getFileIcon(file.type)}
							</span>
							<span className={styles.fileName}>{file.name}</span>
						</div>
						<span className={styles.metaCell}>
							{file.size ? formatSize(file.size) : "--"}
						</span>
						<span className={styles.metaCell}>
							{file.created_at
								? new Date(file.created_at).toLocaleDateString()
								: "--"}
						</span>
						<button
							onClick={(event) => {
								event.stopPropagation();
								onRequestDelete(file);
							}}
							className={styles.deleteButton}
							aria-label={`Delete ${file.name}`}
						>
							<Trash2 className={styles.deleteIcon} />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
