import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";

interface BackupManagerDeleteDialogProps {
	pendingDelete: string | null;
	onCancel: () => void;
	onConfirm: () => void;
}

export function BackupManagerDeleteDialog({
	pendingDelete,
	onCancel,
	onConfirm,
}: BackupManagerDeleteDialogProps) {
	return (
		<Dialog
			open={Boolean(pendingDelete)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className="max-w-sm border-(--border) bg-(--surface)">
				<DialogHeader>
					<DialogTitle>Delete backup file?</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-(--text-muted)">
					Delete "{pendingDelete ?? "this backup"}"?
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
						className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] text-[white]"
					>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
