import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
import styles from "./StandardsDrawingDialogs.module.css";
import type { DrawingAnnotation } from "@/features/standards-checker/standardsDrawingModels";

interface StandardsDrawingDeleteDialogProps {
	pendingDeleteDrawing: DrawingAnnotation | null;
	onCancel: () => void;
	onConfirmDelete: () => void;
}

export function StandardsDrawingDeleteDialog({
	pendingDeleteDrawing,
	onCancel,
	onConfirmDelete,
}: StandardsDrawingDeleteDialogProps) {
	return (
		<Dialog
			open={Boolean(pendingDeleteDrawing)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className={styles.dialogShell}>
				<DialogHeader>
					<DialogTitle>Delete drawing check?</DialogTitle>
				</DialogHeader>
				<p className={styles.deleteCopy}>
					Delete "{pendingDeleteDrawing?.drawing_name ?? "this check"}"?
				</p>
				<DialogFooter className={styles.tightFooter}>
					<button
						onClick={onCancel}
						className={styles.secondaryButton}
						type="button"
					>
						Cancel
					</button>
					<button
						onClick={onConfirmDelete}
						className={styles.dangerButton}
						type="button"
					>
						Delete
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
