import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import type { StorageFile } from "./storageTypes";

interface FileBrowserDeleteDialogProps {
	pendingDelete: StorageFile | null;
	onCancel: () => void;
	onConfirm: () => void;
}

export function FileBrowserDeleteDialog({
	pendingDelete,
	onCancel,
	onConfirm,
}: FileBrowserDeleteDialogProps) {
	return (
		<Dialog
			open={Boolean(pendingDelete)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className="max-w-sm border-[var(--border)] bg-[var(--surface)]">
				<DialogHeader>
					<DialogTitle>Delete file?</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--text-muted)]">
					Delete "{pendingDelete?.name}"? This cannot be undone.
				</p>
				<DialogFooter className="mt-4 gap-2 sm:justify-end">
					<button
						onClick={onCancel}
						className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] [color:white]"
					>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
