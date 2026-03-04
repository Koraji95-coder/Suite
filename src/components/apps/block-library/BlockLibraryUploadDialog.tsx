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
		"w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md border-(--border) bg-(--bg-heavy)">
				<h3 className="text-lg font-semibold [color:var(--text)]">Upload Block</h3>

				<div className="mt-4 space-y-4" role="form" onSubmit={onSubmit}>
					<Field label="Block Name">
						<input
							type="text"
							value={uploadForm.name}
							onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))}
							required
							className={inputClass}
							placeholder="e.g., Transformer-3Phase"
						/>
					</Field>

					<Field label="Category">
						<select
							value={uploadForm.category}
							onChange={(e) => setUploadForm((p) => ({ ...p, category: e.target.value }))}
							className={inputClass}
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
							onChange={(e) => setUploadForm((p) => ({ ...p, tags: e.target.value }))}
							className={inputClass}
							placeholder="e.g., transformer, 3phase, 480v"
						/>
					</Field>

					<label className="flex items-center gap-2 text-sm [color:var(--text-muted)]">
						<input
							type="checkbox"
							checked={uploadForm.is_dynamic}
							onChange={(e) => setUploadForm((p) => ({ ...p, is_dynamic: e.target.checked }))}
							className="rounded"
						/>
						Dynamic block (with variations)
					</label>

					<div className="flex gap-2 pt-2">
						<button
							type="button"
							disabled={isUploading}
							onClick={onSubmit as unknown as () => void}
							className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition
								[background:var(--primary)] [color:var(--primary-contrast)]
								hover:opacity-90 disabled:opacity-40"
						>
							{isUploading ? "Uploading…" : "Upload Block"}
						</button>
						<button
							type="button"
							disabled={isUploading}
							onClick={onCancel}
							className="rounded-lg border px-4 py-2.5 text-sm transition
								[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
								hover:[background:var(--surface-2)]"
						>
							Cancel
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<label className="mb-1.5 block text-xs font-medium [color:var(--text-muted)]">
				{label}
			</label>
			{children}
		</div>
	);
}
