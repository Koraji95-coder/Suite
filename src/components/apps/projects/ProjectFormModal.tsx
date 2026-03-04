import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
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
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader className={styles.header}>
					<DialogTitle className={styles.title}>
						{isEditing ? "Edit Project" : "Create New Project"}
					</DialogTitle>
				</DialogHeader>
				<div className={styles.fields}>
					<div>
						<label className={styles.label}>Project Name</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className={styles.input}
							placeholder="Enter project name"
						/>
					</div>
					<div>
						<label className={styles.label}>Description</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className={styles.textarea}
							placeholder="Project description"
						/>
					</div>
					<div className={styles.gridTwo}>
						<div>
							<label className={styles.label}>Deadline</label>
							<input
								type="date"
								value={formData.deadline ? formData.deadline.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, deadline: e.target.value })
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
					<div className={styles.gridTwo}>
						<div>
							<label className={styles.label}>Category</label>
							<select
								value={formData.category ?? ""}
								onChange={(e) =>
									setFormData({ ...formData, category: e.target.value })
								}
								className={styles.select}
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
							<label className={styles.label}>Status</label>
							<select
								value={formData.status}
								onChange={(e) =>
									setFormData({
										...formData,
										status: e.target.value as ProjectStatus,
									})
								}
								className={styles.select}
							>
								<option value="active">Active</option>
								<option value="on-hold">On Hold</option>
								<option value="archived">Archived</option>
							</select>
						</div>
					</div>
					{formData.category && (
						<div className={styles.categoryPreview}>
							<div
								className={styles.colorSwatch}
								style={{
									backgroundColor: categoryColor(formData.category || null),
								}}
							/>
							<span className={styles.previewHint}>
								Color auto-assigned from category
							</span>
						</div>
					)}
				</div>
				<div className={styles.footer}>
					<button onClick={onSubmit} className={styles.buttonPrimary}>
						{isEditing ? "Update Project" : "Create Project"}
					</button>
					<button onClick={onClose} className={styles.buttonSecondary}>
						Cancel
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
