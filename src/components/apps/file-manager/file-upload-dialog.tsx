"use client";

import { Upload, UploadIcon, XIcon } from "lucide-react";
import * as React from "react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Label } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "./file-upload-dialog.module.css";

export function FileUploadDialog() {
	const [open, setOpen] = React.useState(false);
	const [files, setFiles] = React.useState<File[]>([]);
	const [dragActive, setDragActive] = React.useState(false);

	const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		if (e.dataTransfer.files && e.dataTransfer.files[0]) {
			handleFiles(e.dataTransfer.files);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		e.preventDefault();
		if (e.target.files) {
			handleFiles(e.target.files);
		}
	};

	const handleFiles = (fileList: FileList) => {
		setFiles((prevFiles) => [...prevFiles, ...Array.from(fileList)]);
	};

	const removeFile = (index: number) => {
		setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
	};

	const handleUpload = () => {
		setOpen(false);
		setFiles([]);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button onClick={() => setOpen(true)} iconLeft={<UploadIcon />}>
				Upload
			</Button>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader>
					<DialogTitle>Upload Files</DialogTitle>
					<DialogDescription>
						Drag and drop files here or click to select files
					</DialogDescription>
				</DialogHeader>
				<div
					className={cn(styles.dropZone, dragActive && styles.dropZoneActive)}
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
				>
					<div className={styles.dropContent}>
						<Upload className={styles.uploadIcon} aria-hidden="true" />
						<div className={styles.uploadRow}>
							<Label htmlFor="file-upload" className={styles.uploadLabel}>
								<span>Upload a file</span>
								<input
									id="file-upload"
									name="file-upload"
									type="file"
									className={styles.fileInput}
									onChange={handleChange}
									multiple
								/>
							</Label>
							<p className={styles.uploadRowText}>or drag and drop</p>
						</div>
						<p className={styles.uploadHint}>PNG, JPG, GIF up to 10MB</p>
					</div>
				</div>
				{files.length > 0 && (
					<div className={styles.selectedBlock}>
						<h4 className={styles.selectedTitle}>Selected Files</h4>
						<ul className={styles.fileList}>
							{files.map((file, index) => (
								<li key={index} className={styles.fileListItem}>
									<div className={styles.fileMetaWrap}>
										<div className={styles.fileNameRow}>
											<span className={styles.fileName}>{file.name}</span>
											<span className={styles.fileSize}>
												{(file.size / 1024).toFixed(2)} kb
											</span>
										</div>
									</div>
									<div className={styles.fileAction}>
										<Button
											variant="ghost"
											size="sm"
											iconOnly
											iconLeft={<XIcon />}
											aria-label={`Remove ${file.name}`}
											onClick={() => removeFile(index)}
										/>
									</div>
								</li>
							))}
						</ul>
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={handleUpload} disabled={files.length === 0}>
						Start Upload
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
