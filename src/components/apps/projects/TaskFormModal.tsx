import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import { type Priority, TaskFormData } from "./projectmanagertypes";

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
					<DialogTitle className={styles.title}>
						{isEditing ? "Edit Task" : isSubtask ? "Add Subtask" : "Add Task"}
					</DialogTitle>
				</DialogHeader>
				<div className={styles.fields}>
					<div>
						<label className={styles.label}>Task Name</label>
						<input
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
						<label className={styles.label}>Description</label>
						<textarea
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
							<label className={styles.label}>Due Date</label>
							<input
								type="date"
								value={formData.due_date ? formData.due_date.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, due_date: e.target.value })
								}
								className={styles.input}
							/>
						</div>
						<div>
							<label className={styles.label}>Priority</label>
							<select
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
					<button onClick={onSubmit} className={styles.buttonPrimary}>
						{isEditing ? "Update Task" : "Create Task"}
					</button>
					<button onClick={onClose} className={styles.buttonSecondary}>
						Cancel
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
