import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import { type Priority, TaskFormData } from "@/features/project-core";

interface TaskFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: () => void;
	formData: TaskFormData;
	setFormData: (data: TaskFormData) => void;
	isEditing: boolean;
	isSubtask?: boolean;
}

export function TaskFormModal({
	isOpen,
	onClose,
	onSubmit,
	formData,
	setFormData,
	isEditing,
	isSubtask = false,
}: TaskFormModalProps) {
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader className={styles.header}>
					<p className={styles.eyebrow}>
						{isSubtask ? "Subtask lane" : "Task lane"}
					</p>
					<DialogTitle className={styles.title}>
						{isEditing ? "Edit Task" : isSubtask ? "Add Subtask" : "Add Task"}
					</DialogTitle>
					<DialogDescription className={styles.subcopy}>
						Use tasks to define execution work, ownership, and due dates inside
						the project workspace.
					</DialogDescription>
				</DialogHeader>
				<div className={styles.fields}>
					<div>
						<label className={styles.label} htmlFor="task-form-name">
							Task Name
						</label>
						<input
							id="task-form-name"
							name="task_form_name"
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className={styles.input}
							placeholder="Enter task name"
						/>
					</div>
					<div>
						<label className={styles.label} htmlFor="task-form-description">
							Description
						</label>
						<textarea
							id="task-form-description"
							name="task_form_description"
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className={`${styles.textarea} ${styles.textareaShort}`}
							placeholder="Task description (optional)"
						/>
					</div>
					<div className={styles.gridTwo}>
						<div>
							<label className={styles.label} htmlFor="task-form-due-date">
								Due Date
							</label>
							<input
								id="task-form-due-date"
								name="task_form_due_date"
								type="date"
								value={formData.due_date ? formData.due_date.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, due_date: e.target.value })
								}
								className={styles.input}
							/>
						</div>
						<div>
							<label className={styles.label} htmlFor="task-form-priority">
								Priority
							</label>
							<select
								id="task-form-priority"
								name="task_form_priority"
								value={formData.priority}
								onChange={(e) =>
									setFormData({
										...formData,
										priority: e.target.value as Priority,
									})
								}
								className={styles.select}
							>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</select>
						</div>
					</div>
				</div>
				<div className={styles.footer}>
					<button
						type="button"
						onClick={onSubmit}
						className={styles.buttonPrimary}
					>
						{isEditing ? "Update Task" : "Create Task"}
					</button>
					<button
						type="button"
						onClick={onClose}
						className={styles.buttonSecondary}
					>
						Cancel
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
