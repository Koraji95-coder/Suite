import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { Checkbox } from "@/components/system/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
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
				<DialogHeader>
					<DialogTitle className={styles.title}>Upload Block</DialogTitle>
					<DialogDescription>
						Add a named CAD block with category, tags, and dynamic block
						metadata.
					</DialogDescription>
				</DialogHeader>

				<form className={styles.form} onSubmit={onSubmit}>
					<Field label="Block Name" labelFor="block-upload-name">
						<input
							id="block-upload-name"
							name="block_upload_name"
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

					<Field label="Category" labelFor="block-upload-category">
						<select
							id="block-upload-category"
							name="block_upload_category"
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

					<Field label="Tags (comma separated)" labelFor="block-upload-tags">
						<input
							id="block-upload-tags"
							name="block_upload_tags"
							type="text"
							value={uploadForm.tags}
							onChange={(e) =>
								setUploadForm((p) => ({ ...p, tags: e.target.value }))
							}
							className={styles.input}
							placeholder="e.g., transformer, 3phase, 480v"
						/>
					</Field>

					<label
						className={styles.checkboxLabel}
						htmlFor="block-upload-dynamic"
					>
						<Checkbox
							id="block-upload-dynamic"
							checked={uploadForm.is_dynamic}
							onCheckedChange={(checked) =>
								setUploadForm((p) => ({
									...p,
									is_dynamic: checked === true,
								}))
							}
							className={styles.checkbox}
						/>
						Dynamic block (with variations)
					</label>

					<div className={styles.actions}>
						<button
							type="submit"
							disabled={isUploading}
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
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	labelFor,
	children,
}: {
	label: string;
	labelFor: string;
	children: ReactNode;
}) {
	return (
		<div>
			<label className={styles.fieldLabel} htmlFor={labelFor}>
				{label}
			</label>
			{children}
		</div>
	);
}
