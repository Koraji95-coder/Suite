import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";

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
				<DialogContent className="max-w-sm border-[var(--border)] bg-[var(--surface)]">
					<DialogHeader>
						<DialogTitle>Delete project?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-[var(--text-muted)]">
						Delete "{pendingProjectName}"? This will permanently remove its
						tasks, files, and related records.
					</p>
					<DialogFooter className="mt-4 gap-2 sm:justify-end">
						<button
							onClick={onCancelProjectDelete}
							className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							Cancel
						</button>
						<button
							onClick={onConfirmProjectDelete}
							className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] [color:white]"
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
				<DialogContent className="max-w-sm border-[var(--border)] bg-[var(--surface)]">
					<DialogHeader>
						<DialogTitle>Delete task?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-[var(--text-muted)]">
						Delete "{pendingTaskName}"? This will also delete all subtasks.
					</p>
					<DialogFooter className="mt-4 gap-2 sm:justify-end">
						<button
							onClick={onCancelTaskDelete}
							className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							Cancel
						</button>
						<button
							onClick={onConfirmTaskDelete}
							className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] [color:white]"
						>
							Delete
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
