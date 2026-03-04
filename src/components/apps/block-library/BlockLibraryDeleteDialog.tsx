import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import type { BlockFile } from "./blockLibraryModels";

interface BlockLibraryDeleteDialogProps {
	pendingDeleteBlock: BlockFile | null;
	onCancel: () => void;
	onConfirmDelete: () => void;
}

export function BlockLibraryDeleteDialog({
	pendingDeleteBlock,
	onCancel,
	onConfirmDelete,
}: BlockLibraryDeleteDialogProps) {
	return (
		<Dialog
			open={Boolean(pendingDeleteBlock)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className="max-w-sm border-(--border) bg-(--surface)">
				<DialogHeader>
					<DialogTitle>Delete block?</DialogTitle>
				</DialogHeader>
				<p className="text-sm [color:var(--text-muted)]">
					This will permanently remove "{pendingDeleteBlock?.name ?? "this block"}".
				</p>
				<DialogFooter className="mt-4 gap-2 sm:justify-end">
					<button
						onClick={onCancel}
						className="rounded-lg border px-4 py-2 text-sm transition
							[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
							hover:[background:var(--surface-2)]"
					>
						Cancel
					</button>
					<button
						onClick={onConfirmDelete}
						className="rounded-lg px-4 py-2 text-sm font-medium transition
							[background:var(--danger)] text-[white] hover:opacity-90"
					>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
