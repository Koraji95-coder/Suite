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
	if (!isOpen) return null;
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const labelClass = "mb-2 block text-sm font-medium [color:var(--text-muted)]";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.68)] p-3 backdrop-blur-md sm:p-4">
			<div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border p-5 backdrop-blur-xl [border-color:var(--border)] [background:var(--bg-heavy)] sm:p-6">
				<h3 className="mb-4 text-2xl font-bold [color:var(--text)]">
					{isEditing ? "Edit Task" : isSubtask ? "Add Subtask" : "Add Task"}
				</h3>
				<div className="space-y-4">
					<div>
						<label className={labelClass}>Task Name</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className={inputClass}
							placeholder="Enter task name"
						/>
					</div>
					<div>
						<label className={labelClass}>Description</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className={`${inputClass} h-20`}
							placeholder="Task description (optional)"
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label className={labelClass}>Due Date</label>
							<input
								type="date"
								value={formData.due_date ? formData.due_date.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, due_date: e.target.value })
								}
								className={inputClass}
							/>
						</div>
						<div>
							<label className={labelClass}>Priority</label>
							<select
								value={formData.priority}
								onChange={(e) =>
									setFormData({
										...formData,
										priority: e.target.value as Priority,
									})
								}
								className={inputClass}
							>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</select>
						</div>
					</div>
				</div>
				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<button
						onClick={onSubmit}
						className="flex-1 rounded-lg px-6 py-2 font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						{isEditing ? "Update Task" : "Create Task"}
					</button>
					<button
						onClick={onClose}
						className="rounded-lg border px-6 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
