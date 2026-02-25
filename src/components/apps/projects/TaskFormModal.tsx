import type { CSSProperties } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
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
	const { palette } = useTheme();
	if (!isOpen) return null;

	const inputStyle: CSSProperties = {
		background: hexToRgba(palette.surface, 0.4),
		border: `1px solid ${hexToRgba(palette.primary, 0.22)}`,
		color: hexToRgba(palette.text, 0.9),
		"--tw-ring-color": hexToRgba(palette.primary, 0.45),
	};

	const modalStyle: CSSProperties = {
		border: `1px solid ${hexToRgba(palette.primary, 0.22)}`,
		background: `linear-gradient(145deg, ${hexToRgba(
			palette.surface,
			0.96,
		)} 0%, ${hexToRgba(palette.surfaceLight, 0.92)} 100%)`,
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4">
			<div
				className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg p-5 backdrop-blur-xl sm:p-6"
				style={modalStyle}
			>
				<h3
					className="text-2xl font-bold mb-4"
					style={{ color: hexToRgba(palette.text, 0.9) }}
				>
					{isEditing ? "Edit Task" : isSubtask ? "Add Subtask" : "Add Task"}
				</h3>
				<div className="space-y-4">
					<div>
						<label
							className="block text-sm font-medium mb-2"
							style={{ color: hexToRgba(palette.text, 0.6) }}
						>
							Task Name
						</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
							style={inputStyle}
							placeholder="Enter task name"
						/>
					</div>
					<div>
						<label
							className="block text-sm font-medium mb-2"
							style={{ color: hexToRgba(palette.text, 0.6) }}
						>
							Description
						</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 h-20"
							style={inputStyle}
							placeholder="Task description (optional)"
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label
								className="block text-sm font-medium mb-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								Due Date
							</label>
							<input
								type="date"
								value={formData.due_date ? formData.due_date.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, due_date: e.target.value })
								}
								className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
								style={inputStyle}
							/>
						</div>
						<div>
							<label
								className="block text-sm font-medium mb-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
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
								className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
								style={inputStyle}
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
						className="flex-1 px-6 py-2 rounded-lg transition-all font-semibold"
						style={{
							...glassCardInnerStyle(palette, palette.primary),
							color: hexToRgba(palette.text, 0.9),
						}}
					>
						{isEditing ? "Update Task" : "Create Task"}
					</button>
					<button
						onClick={onClose}
						className="rounded-lg px-6 py-2 transition-all"
						style={{
							...glassCardInnerStyle(palette, palette.secondary),
							color: hexToRgba(palette.text, 0.65),
						}}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
