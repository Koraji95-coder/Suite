import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import {
	PROJECT_CATEGORIES,
	type Priority,
	ProjectFormData,
	type ProjectStatus,
} from "./projectmanagertypes";
import { normalizeProjectCategory } from "./projectmanagerutils";

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
	const safeCategory = PROJECT_CATEGORIES.some(
		(category) => category.key === formData.category,
	)
		? formData.category
		: "Other";
	const categoryTone = normalizeProjectCategory(formData.category || null);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader className={styles.header}>
					<p className={styles.eyebrow}>Project lane</p>
					<DialogTitle className={styles.title}>
						{isEditing ? "Edit Project" : "Create New Project"}
					</DialogTitle>
					<p className={styles.subcopy}>
						Define the workspace metadata, timeline, and operating category used
						by the project command center.
					</p>
				</DialogHeader>
				<div className={styles.fields}>
					<div>
						<label className={styles.label} htmlFor="project-form-name">
							Project Name
						</label>
						<input
							id="project-form-name"
							name="project_form_name"
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
						<label className={styles.label} htmlFor="project-form-description">
							Description
						</label>
						<textarea
							id="project-form-description"
							name="project_form_description"
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className={styles.textarea}
							placeholder="Project description"
						/>
					</div>
					<div>
						<label className={styles.label} htmlFor="project-form-watchdog-root">
							Project root folder
						</label>
						<input
							id="project-form-watchdog-root"
							name="project_form_watchdog_root"
							type="text"
							value={formData.watchdogRootPath}
							onChange={(e) =>
								setFormData({
									...formData,
									watchdogRootPath: e.target.value,
								})
							}
							className={styles.input}
							placeholder="G:\\Company\\Projects\\Alpha"
						/>
					</div>
					<div className={styles.gridTwo}>
						<div>
							<label className={styles.label} htmlFor="project-form-deadline">
								Deadline
							</label>
							<input
								id="project-form-deadline"
								name="project_form_deadline"
								type="date"
								value={formData.deadline ? formData.deadline.split("T")[0] : ""}
								onChange={(e) =>
									setFormData({ ...formData, deadline: e.target.value })
								}
								className={styles.input}
							/>
						</div>
						<div>
							<label className={styles.label} htmlFor="project-form-priority">
								Priority
							</label>
							<select
								id="project-form-priority"
								name="project_form_priority"
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
							<label className={styles.label} htmlFor="project-form-category">
								Category
							</label>
							<select
								id="project-form-category"
								name="project_form_category"
								value={safeCategory}
								onChange={(e) =>
									setFormData({
										...formData,
										category: e.target.value || "Other",
									})
								}
								className={styles.select}
							>
								{PROJECT_CATEGORIES.map((c) => (
									<option key={c.key} value={c.key}>
										{c.key}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={styles.label} htmlFor="project-form-status">
								Status
							</label>
							<select
								id="project-form-status"
								name="project_form_status"
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
								className={[
									styles.colorSwatch,
									categoryTone === "coding"
										? styles.colorSwatchCoding
										: categoryTone === "substation"
											? styles.colorSwatchSubstation
											: categoryTone === "standards"
												? styles.colorSwatchStandards
									: categoryTone === "school"
										? styles.colorSwatchSchool
										: categoryTone === "other"
											? styles.colorSwatchOther
											: styles.colorSwatchGeneric,
								].join(" ")}
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
