import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import type { DrawingAnnotation } from "./qaqcModels";

interface QAQCDeleteDialogProps {
	pendingDeleteDrawing: DrawingAnnotation | null;
	onCancel: () => void;
	onConfirmDelete: () => void;
}

export function QAQCDeleteDialog({
	pendingDeleteDrawing,
	onCancel,
	onConfirmDelete,
}: QAQCDeleteDialogProps) {
	return (
		<Dialog
			open={Boolean(pendingDeleteDrawing)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className="max-w-sm border-[var(--border)] bg-[var(--surface)]">
				<DialogHeader>
					<DialogTitle>Delete drawing check?</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--text-muted)]">
					Delete "{pendingDeleteDrawing?.drawing_name ?? "this check"}"?
				</p>
				<DialogFooter className="mt-4 gap-2 sm:justify-end">
					<button
						onClick={onCancel}
						className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Cancel
					</button>
					<button
						onClick={onConfirmDelete}
						className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] [color:white]"
					>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
