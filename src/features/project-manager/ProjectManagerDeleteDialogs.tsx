import { AlertTriangle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
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
					<DialogHeader className={styles.header}>
						<div className={styles.iconShell}>
							<AlertTriangle className={styles.icon} />
						</div>
						<p className={styles.eyebrow}>Destructive action</p>
						<DialogTitle>Delete project?</DialogTitle>
						<DialogDescription className="sr-only">
							Permanently delete the selected project and its related records.
						</DialogDescription>
					</DialogHeader>
					<p className={styles.copy}>
						Delete "{pendingProjectName}"? This will permanently remove its
						tasks, files, and related records.
					</p>
					<div className={styles.targetCard}>{pendingProjectName}</div>
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
					<DialogHeader className={styles.header}>
						<div className={styles.iconShell}>
							<AlertTriangle className={styles.icon} />
						</div>
						<p className={styles.eyebrow}>Destructive action</p>
						<DialogTitle>Delete task?</DialogTitle>
						<DialogDescription className="sr-only">
							Permanently delete the selected task and all of its subtasks.
						</DialogDescription>
					</DialogHeader>
					<p className={styles.copy}>
						Delete "{pendingTaskName}"? This will also delete all subtasks.
					</p>
					<div className={styles.targetCard}>{pendingTaskName}</div>
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
