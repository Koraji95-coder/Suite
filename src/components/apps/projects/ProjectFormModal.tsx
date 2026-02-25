import {
	PROJECT_CATEGORIES,
	type Priority,
	ProjectFormData,
	type ProjectStatus,
} from "./projectmanagertypes";
import type { CSSProperties } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { categoryColor } from "./projectmanagerutils";

interface ProjectFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: () => void;
	formData: ProjectFormData;
	setFormData: (data: ProjectFormData) => void;
	isEditing: boolean;
}

export function ProjectFormModal({
	isOpen,
	onClose,
	onSubmit,
	formData,
	setFormData,
	isEditing,
}: ProjectFormModalProps) {
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
					{isEditing ? "Edit Project" : "Create New Project"}
				</h3>
				<div className="space-y-4">
					<div>
						<label
							className="block text-sm font-medium mb-2"
							style={{ color: hexToRgba(palette.text, 0.6) }}
						>
							Project Name
						</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
							style={inputStyle}
							placeholder="Enter project name"
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
							className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 h-24"
							style={inputStyle}
							placeholder="Project description"
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label
								className="block text-sm font-medium mb-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								Deadline
							</label>
							<input
								type="date"
								value={formData.deadline ? formData.deadline.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, deadline: e.target.value })
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
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label
								className="block text-sm font-medium mb-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								Category
							</label>
							<select
								value={formData.category ?? ""}
								onChange={(e) =>
									setFormData({ ...formData, category: e.target.value })
								}
								className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
								style={inputStyle}
							>
								<option value="">No Category</option>
								{PROJECT_CATEGORIES.map((c) => (
									<option key={c.key} value={c.key}>
										{c.key}
									</option>
								))}
							</select>
						</div>
						<div>
							<label
								className="block text-sm font-medium mb-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								Status
							</label>
							<select
								value={formData.status}
								onChange={(e) =>
									setFormData({
										...formData,
										status: e.target.value as ProjectStatus,
									})
								}
								className="w-full rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2"
								style={inputStyle}
							>
								<option value="active">Active</option>
								<option value="on-hold">On Hold</option>
								<option value="archived">Archived</option>
							</select>
						</div>
					</div>
					{formData.category && (
						<div className="flex items-center space-x-2 mt-2">
							<div
								className="w-4 h-4 rounded-full"
								style={{
									backgroundColor: categoryColor(formData.category || null),
								}}
							/>
							<span
								className="text-xs"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							>
								Color auto-assigned from category
							</span>
						</div>
					)}
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
						{isEditing ? "Update Project" : "Create Project"}
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
