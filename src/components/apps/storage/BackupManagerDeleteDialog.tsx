import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./StorageDialogs.module.css";

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
			<DialogContent className={styles.dialogContentSm}>
				<DialogHeader>
					<DialogTitle>Delete backup file?</DialogTitle>
				</DialogHeader>
				<p className={styles.message}>
					Delete "{pendingDelete ?? "this backup"}"?
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
