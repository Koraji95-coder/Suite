import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
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
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const primaryButtonClass =
		"inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90";
	const secondaryButtonClass =
		"rounded-lg border px-6 py-2 text-sm font-medium transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[92vh] max-w-md overflow-y-auto border-[var(--border)] bg-[var(--bg-heavy)]">
				<h3 className="mb-4 text-2xl font-bold [color:var(--text)]">
					Upload Block
				</h3>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
							Block Name *
						</label>
						<input
							type="text"
							value={uploadForm.name}
							onChange={(event) =>
								setUploadForm((prev) => ({ ...prev, name: event.target.value }))
							}
							required
							className={inputClass}
							placeholder="e.g., Transformer-3Phase"
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
							Category *
						</label>
						<select
							value={uploadForm.category}
							onChange={(event) =>
								setUploadForm((prev) => ({
									...prev,
									category: event.target.value,
								}))
							}
							className={inputClass}
						>
							{UPLOAD_CATEGORY_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option.charAt(0).toUpperCase() + option.slice(1)}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
							Tags (comma separated)
						</label>
						<input
							type="text"
							value={uploadForm.tags}
							onChange={(event) =>
								setUploadForm((prev) => ({ ...prev, tags: event.target.value }))
							}
							className={inputClass}
							placeholder="e.g., transformer, 3phase, 480v"
						/>
					</div>

					<div className="flex items-center space-x-2">
						<input
							type="checkbox"
							id="is_dynamic"
							checked={uploadForm.is_dynamic}
							onChange={(event) =>
								setUploadForm((prev) => ({
									...prev,
									is_dynamic: event.target.checked,
								}))
							}
							className="h-4 w-4 rounded border [border-color:var(--border)] [background:var(--surface)]"
						/>
						<label
							htmlFor="is_dynamic"
							className="text-sm [color:var(--text-muted)]"
						>
							Dynamic Block (with variations)
						</label>
					</div>

					<div className="flex gap-3 mt-6">
						<button
							type="submit"
							disabled={isUploading}
							className={`flex-1 ${primaryButtonClass}`}
						>
							{isUploading ? "Uploading..." : "Upload Block"}
						</button>
						<button
							type="button"
							disabled={isUploading}
							onClick={onCancel}
							className={secondaryButtonClass}
						>
							Cancel
						</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
