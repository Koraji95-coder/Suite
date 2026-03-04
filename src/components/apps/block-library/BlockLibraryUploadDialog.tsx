import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import styles from "./BlockLibraryUploadDialog.module.css";
import {
	type BlockUploadForm,
	UPLOAD_CATEGORY_OPTIONS,
} from "./blockLibraryModels";

interface BlockLibraryUploadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	uploadForm: BlockUploadForm;
	setUploadForm: Dispatch<SetStateAction<BlockUploadForm>>;
	onSubmit: (event: FormEvent) => void;
	isUploading: boolean;
	onCancel: () => void;
}

export function BlockLibraryUploadDialog({
	open,
	onOpenChange,
	uploadForm,
	setUploadForm,
	onSubmit,
	isUploading,
	onCancel,
}: BlockLibraryUploadDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={styles.dialogContent}>
				<h3 className={styles.title}>Upload Block</h3>

				<div className={styles.form} role="form" onSubmit={onSubmit}>
					<Field label="Block Name">
						<input
							type="text"
							value={uploadForm.name}
							onChange={(e) =>
								setUploadForm((p) => ({ ...p, name: e.target.value }))
							}
							required
							className={styles.input}
							placeholder="e.g., Transformer-3Phase"
						/>
					</Field>

					<Field label="Category">
						<select
							value={uploadForm.category}
							onChange={(e) =>
								setUploadForm((p) => ({ ...p, category: e.target.value }))
							}
							className={styles.input}
						>
							{UPLOAD_CATEGORY_OPTIONS.map((opt) => (
								<option key={opt} value={opt}>
									{opt.charAt(0).toUpperCase() + opt.slice(1)}
								</option>
							))}
						</select>
					</Field>

					<Field label="Tags (comma separated)">
						<input
							type="text"
							value={uploadForm.tags}
							onChange={(e) =>
								setUploadForm((p) => ({ ...p, tags: e.target.value }))
							}
							className={styles.input}
							placeholder="e.g., transformer, 3phase, 480v"
						/>
					</Field>

					<label className={styles.checkboxLabel}>
						<input
							type="checkbox"
							checked={uploadForm.is_dynamic}
							onChange={(e) =>
								setUploadForm((p) => ({ ...p, is_dynamic: e.target.checked }))
							}
							className={styles.checkbox}
						/>
						Dynamic block (with variations)
					</label>

					<div className={styles.actions}>
						<button
							type="button"
							disabled={isUploading}
							onClick={onSubmit as unknown as () => void}
							className={styles.submitButton}
						>
							{isUploading ? "Uploading…" : "Upload Block"}
						</button>
						<button
							type="button"
							disabled={isUploading}
							onClick={onCancel}
							className={styles.cancelButton}
						>
							Cancel
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<label className={styles.fieldLabel}>{label}</label>
			{children}
		</div>
	);
}
