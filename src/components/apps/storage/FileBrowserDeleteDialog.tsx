import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./StorageDialogs.module.css";
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
			<DialogContent className={styles.dialogContentSm}>
				<DialogHeader>
					<DialogTitle>Delete file?</DialogTitle>
				</DialogHeader>
				<p className={styles.message}>
					Delete "{pendingDelete?.name}"? This cannot be undone.
				</p>
				<DialogFooter className={styles.footer}>
					<button onClick={onCancel} className={styles.cancelButton}>
						Cancel
					</button>
					<button onClick={onConfirm} className={styles.dangerButton}>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
