import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./ProjectManagerDeleteDialogs.module.css";

interface ProjectManagerDeleteDialogsProps {
	projectIdPendingDelete: string | null;
	taskIdPendingDelete: string | null;
	pendingProjectName: string;
	pendingTaskName: string;
	onCancelProjectDelete: () => void;
	onConfirmProjectDelete: () => void;
	onCancelTaskDelete: () => void;
	onConfirmTaskDelete: () => void;
}

export function ProjectManagerDeleteDialogs({
	projectIdPendingDelete,
	taskIdPendingDelete,
	pendingProjectName,
	pendingTaskName,
	onCancelProjectDelete,
	onConfirmProjectDelete,
	onCancelTaskDelete,
	onConfirmTaskDelete,
}: ProjectManagerDeleteDialogsProps) {
	return (
		<>
			<Dialog
				open={Boolean(projectIdPendingDelete)}
				onOpenChange={(open) => !open && onCancelProjectDelete()}
			>
				<DialogContent className={styles.dialogShell}>
					<DialogHeader>
						<DialogTitle>Delete project?</DialogTitle>
					</DialogHeader>
					<p className={styles.copy}>
						Delete "{pendingProjectName}"? This will permanently remove its
						tasks, files, and related records.
					</p>
					<DialogFooter className={styles.footer}>
						<button
							onClick={onCancelProjectDelete}
							className={`${styles.button} ${styles.buttonSecondary}`}
							type="button"
						>
							Cancel
						</button>
						<button
							onClick={onConfirmProjectDelete}
							className={`${styles.button} ${styles.buttonDanger}`}
							type="button"
						>
							Delete
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(taskIdPendingDelete)}
				onOpenChange={(open) => !open && onCancelTaskDelete()}
			>
				<DialogContent className={styles.dialogShell}>
					<DialogHeader>
						<DialogTitle>Delete task?</DialogTitle>
					</DialogHeader>
					<p className={styles.copy}>
						Delete "{pendingTaskName}"? This will also delete all subtasks.
					</p>
					<DialogFooter className={styles.footer}>
						<button
							onClick={onCancelTaskDelete}
							className={`${styles.button} ${styles.buttonSecondary}`}
							type="button"
						>
							Cancel
						</button>
						<button
							onClick={onConfirmTaskDelete}
							className={`${styles.button} ${styles.buttonDanger}`}
							type="button"
						>
							Delete
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
