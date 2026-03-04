import { AlertTriangle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./StorageDialogs.module.css";

interface BackupManagerRestoreDialogProps {
	confirmRestore: string | null;
	onCancel: () => void;
	onConfirm: (filename: string) => void;
}

export function BackupManagerRestoreDialog({
	confirmRestore,
	onCancel,
	onConfirm,
}: BackupManagerRestoreDialogProps) {
	return (
		<Dialog
			open={Boolean(confirmRestore)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className={styles.dialogContentMd}>
				<DialogHeader>
					<DialogTitle className={styles.titleWithIcon}>
						<AlertTriangle className={styles.warningIcon} />
						Confirm Restore
					</DialogTitle>
				</DialogHeader>
				<p className={styles.message}>
					This will upsert data from{" "}
					<strong className={styles.strongText}>
						{confirmRestore ?? "this backup"}
					</strong>{" "}
					into your database. Existing rows with matching IDs will be
					overwritten.
				</p>
				<DialogFooter className={styles.footer}>
					<button onClick={onCancel} className={styles.cancelButton}>
						Cancel
					</button>
					<button
						onClick={() => {
							if (confirmRestore) onConfirm(confirmRestore);
						}}
						className={styles.primaryButton}
					>
						Restore
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
