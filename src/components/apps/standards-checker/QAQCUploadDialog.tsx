import type { FormEvent } from "react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";

interface QAQCUploadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	checkingDrawing: boolean;
	enabledRuleCount: number;
	uploadForm: { name: string };
	setUploadForm: (value: { name: string }) => void;
	onSubmit: (event: FormEvent) => void;
	onCancel: () => void;
}

export function QAQCUploadDialog({
	open,
	onOpenChange,
	checkingDrawing,
	enabledRuleCount,
	uploadForm,
	setUploadForm,
	onSubmit,
	onCancel,
}: QAQCUploadDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md border-[color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)]">
				<h3 className="text-2xl font-bold [color:var(--text)] mb-4">
					Check Drawing
				</h3>
				{checkingDrawing ? (
					<div className="text-center py-8">
						<p className="[color:var(--text-muted)]">Running QA/QC checks...</p>
						<p className="[color:var(--text-muted)] text-sm mt-2">
							Applying {enabledRuleCount} rules
						</p>
					</div>
				) : (
					<form onSubmit={onSubmit} className="space-y-4">
						<div>
							<label className="block [color:var(--text-muted)] text-sm font-medium mb-2">
								Drawing Name *
							</label>
							<input
								type="text"
								value={uploadForm.name}
								onChange={(event) =>
									setUploadForm({ name: event.target.value })
								}
								required
								className="w-full rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface-2)] px-4 py-2 [color:var(--text)] focus:outline-none focus:ring-2 focus:[--tw-ring-color:var(--success)]"
								placeholder="e.g., E-001-POWER-PLAN"
							/>
						</div>

						<div className="[background:color-mix(in_srgb,var(--success)_10%,var(--surface))] border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] rounded-lg p-3">
							<p className="[color:var(--text-muted)] text-sm">
								{enabledRuleCount} QA/QC rules will be applied to this drawing.
							</p>
						</div>

						<div className="flex gap-3 mt-6">
							<button
								type="submit"
								className="flex-1 [background:var(--success)] hover:opacity-90 [color:var(--text)] font-semibold px-6 py-2 rounded-lg transition-all"
							>
								Run Check
							</button>
							<button
								type="button"
								onClick={onCancel}
								className="rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] px-6 py-2 [color:var(--text-muted)] transition-all hover:[background:color-mix(in_srgb,var(--success)_10%,var(--surface))]"
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
