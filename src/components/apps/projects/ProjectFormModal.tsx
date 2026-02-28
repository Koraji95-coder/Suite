import {
	PROJECT_CATEGORIES,
	type Priority,
	ProjectFormData,
	type ProjectStatus,
} from "./projectmanagertypes";
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
	if (!isOpen) return null;
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const labelClass = "mb-2 block text-sm font-medium [color:var(--text-muted)]";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.68)] p-3 backdrop-blur-md sm:p-4">
			<div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border p-5 backdrop-blur-xl [border-color:var(--border)] [background:var(--bg-heavy)] sm:p-6">
				<h3 className="mb-4 text-2xl font-bold [color:var(--text)]">
					{isEditing ? "Edit Project" : "Create New Project"}
				</h3>
				<div className="space-y-4">
					<div>
						<label className={labelClass}>Project Name</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className={inputClass}
							placeholder="Enter project name"
						/>
					</div>
					<div>
						<label className={labelClass}>Description</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className={`${inputClass} h-24`}
							placeholder="Project description"
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label className={labelClass}>Deadline</label>
							<input
								type="date"
								value={formData.deadline ? formData.deadline.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, deadline: e.target.value })
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
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label className={labelClass}>Category</label>
							<select
								value={formData.category ?? ""}
								onChange={(e) =>
									setFormData({ ...formData, category: e.target.value })
								}
								className={inputClass}
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
							<label className={labelClass}>Status</label>
							<select
								value={formData.status}
								onChange={(e) =>
									setFormData({
										...formData,
										status: e.target.value as ProjectStatus,
									})
								}
								className={inputClass}
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
							<span className="text-xs [color:var(--text-muted)]">
								Color auto-assigned from category
							</span>
						</div>
					)}
				</div>
				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<button
						onClick={onSubmit}
						className="flex-1 rounded-lg px-6 py-2 font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						{isEditing ? "Update Project" : "Create Project"}
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
