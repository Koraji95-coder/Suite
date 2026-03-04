import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./BlockLibraryDeleteDialog.module.css";
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
			<DialogContent className={styles.dialogContent}>
				<DialogHeader>
					<DialogTitle>Delete block?</DialogTitle>
				</DialogHeader>
				<p className={styles.message}>
					This will permanently remove "
					{pendingDeleteBlock?.name ?? "this block"}".
				</p>
				<DialogFooter className={styles.footer}>
					<button onClick={onCancel} className={styles.cancelButton}>
						Cancel
					</button>
					<button onClick={onConfirmDelete} className={styles.deleteButton}>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
