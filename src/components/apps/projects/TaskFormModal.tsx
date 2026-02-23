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

	return (
		<div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
			<div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg p-6 max-w-2xl w-full">
				<h3 className="text-2xl font-bold text-white/80 mb-4">
					{isEditing ? "Edit Task" : isSubtask ? "Add Subtask" : "Add Task"}
				</h3>
				<div className="space-y-4">
					<div>
						<label className="block text-white/60 text-sm font-medium mb-2">
							Task Name
						</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
							placeholder="Enter task name"
						/>
					</div>
					<div>
						<label className="block text-white/60 text-sm font-medium mb-2">
							Description
						</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500 h-20"
							placeholder="Task description (optional)"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Due Date
							</label>
							<input
								type="date"
								value={formData.due_date ? formData.due_date.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, due_date: e.target.value })
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
							/>
						</div>
						<div>
							<label className="block text-white/60 text-sm font-medium mb-2">
								Priority
							</label>
							<select
								value={formData.priority}
								onChange={(e) =>
									setFormData({
										...formData,
										priority: e.target.value as Priority,
									})
								}
								className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-2 text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
							>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
								<option value="urgent">Urgent</option>
							</select>
						</div>
					</div>
				</div>
				<div className="flex gap-3 mt-6">
					<button
						onClick={onSubmit}
						className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
					>
						{isEditing ? "Update Task" : "Create Task"}
					</button>
					<button
						onClick={onClose}
						className="bg-black/50 border border-orange-500/30 text-white/60 hover:bg-orange-500/10 px-6 py-2 rounded-lg transition-all"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
