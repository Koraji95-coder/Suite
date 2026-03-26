import { Download, FolderOpen, Search, Upload } from "lucide-react";
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
	const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
	const latestUploadedAt =
		files.length > 0
			? files.reduce((latest, file) =>
					file.uploaded_at > latest.uploaded_at ? file : latest,
				).uploaded_at
			: null;
	const formatSizeSummary = (bytes: number) => {
		if (bytes <= 0) return "0 KB";
		if (bytes >= 1024 * 1024) {
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		}
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<div className={styles.titleRow}>
						<div className={styles.iconShell}>
							<FolderOpen className={styles.headerIcon} />
						</div>
						<div>
							<p className={styles.eyebrow}>Project files</p>
							<h4 className={styles.title}>Files</h4>
						</div>
					</div>
					<p className={styles.description}>
						Keep package files, issued PDFs, and supporting deliverables
						available from one lane for {projectName}.
					</p>
					<div className={styles.signalRow}>
						<span className={styles.signalChip}>{files.length} total files</span>
						<span className={styles.signalChip}>
							{formatSizeSummary(totalBytes)} stored
						</span>
						<span className={styles.signalChip}>
							{latestUploadedAt
								? `Latest ${formatDateOnly(latestUploadedAt)}`
								: "No uploads yet"}
						</span>
					</div>
				</div>

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
						<p className={styles.emptyTitle}>
							{filter ? "No files match your search" : "No files uploaded yet"}
						</p>
						<p className={styles.emptyCopy}>
							{filter
								? `Clear "${filter}" or upload a new file to extend the project record.`
								: "Upload drawings, specs, or package files to start building the project archive."}
						</p>
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
