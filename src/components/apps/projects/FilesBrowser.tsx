import { Download, Search, Upload } from "lucide-react";
import styles from "./FilesBrowser.module.css";
import { ProjectFile } from "./projectmanagertypes";
import { formatDateOnly, getFileIcon } from "./projectmanagerutils";

interface FilesBrowserProps {
	files: ProjectFile[];
	filter: string;
	onFilterChange: (filter: string) => void;
	onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onDownload: (file: ProjectFile) => void;
	projectName: string;
}

export function FilesBrowser({
	files,
	filter,
	onFilterChange,
	onUpload,
	onDownload,
	projectName,
}: FilesBrowserProps) {
	const filteredFiles = files.filter(
		(f) =>
			f.name.toLowerCase().includes(filter.toLowerCase()) ||
			f.mime_type.toLowerCase().includes(filter.toLowerCase()),
	);

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<h4 className={styles.title}>File Storage</h4>
				<div className={styles.controls}>
					<div className={styles.searchWrap}>
						<Search className={styles.searchIcon} />
						<input
							type="text"
							value={filter}
							onChange={(e) => onFilterChange(e.target.value)}
							placeholder="Search files..."
							className={styles.searchInput}
						name="filesbrowser_input_36"
						/>
					</div>
					<label className={styles.uploadButton}>
						<Upload className={styles.uploadIcon} />
						<span>Upload</span>
						<input
							type="file"
							onChange={onUpload}
							className={styles.hiddenInput}
						name="filesbrowser_input_47"
						/>
					</label>
				</div>
			</div>

			<div className={styles.list}>
				{filteredFiles.length === 0 ? (
					<div className={styles.emptyState}>
						{filter ? "No files match your search" : "No files uploaded yet"}
					</div>
				) : (
					filteredFiles.map((file) => (
						<div key={file.id} className={styles.fileRow}>
							<span className={styles.fileIcon}>
								{getFileIcon(file.mime_type)}
							</span>
							<div className={styles.fileMeta}>
								<p className={styles.fileName}>{file.name}</p>
								<div className={styles.metaRow}>
									<span>{(file.size / 1024).toFixed(2)} KB</span>
									<span>{file.mime_type}</span>
									<span>{formatDateOnly(file.uploaded_at)}</span>
									<span className={styles.projectTag}>{projectName}</span>
								</div>
							</div>
							<button
								type="button"
								className={styles.downloadButton}
								aria-label={`Download ${file.name}`}
								onClick={() => onDownload(file)}
							>
								<Download className={styles.downloadIcon} />
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
