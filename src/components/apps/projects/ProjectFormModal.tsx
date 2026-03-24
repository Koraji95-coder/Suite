import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/apps/ui/Popover";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/utils";
import { Calendar } from "../calendar/Calendar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import {
	PROJECT_CATEGORIES,
	type Priority,
	ProjectFormData,
	type ProjectStatus,
} from "./projectmanagertypes";

interface ProjectFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: () => void;
	formData: ProjectFormData;
	setFormData: (data: ProjectFormData) => void;
	isEditing: boolean;
	onBrowseRootPath: () => Promise<void>;
	isBrowsingRootPath: boolean;
}

function parseDeadlineDate(value: string) {
	const source = String(value || "").trim();
	if (!source) return null;
	const normalized = source.includes("T") ? source : `${source}T12:00:00`;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function ProjectFormModal({
	isOpen,
	onClose,
	onSubmit,
	formData,
	setFormData,
	isEditing,
	onBrowseRootPath,
	isBrowsingRootPath,
}: ProjectFormModalProps) {
	const [deadlineOpen, setDeadlineOpen] = useState(false);
	const safeCategory = PROJECT_CATEGORIES.some(
		(category) => category.key === formData.category,
	)
		? formData.category
		: "Other";
	const deadlineDate = parseDeadlineDate(formData.deadline);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader className={styles.header}>
					<p className={styles.eyebrow}>Project lane</p>
					<DialogTitle className={styles.title}>
						{isEditing ? "Edit Project" : "Create New Project"}
					</DialogTitle>
					<DialogDescription className={styles.subcopy}>
						Define the workspace metadata, timeline, and operating category used
						by the project command center.
					</DialogDescription>
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
						<label
							className={styles.label}
							htmlFor="project-form-watchdog-root"
						>
							Project root folder
						</label>
						<div className={styles.rootPathRow}>
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
							<button
								type="button"
								onClick={() => void onBrowseRootPath()}
								className={styles.browseButton}
								disabled={isBrowsingRootPath}
							>
								{isBrowsingRootPath ? "Browsing..." : "Browse"}
							</button>
						</div>
					</div>
					<div className={styles.gridTwo}>
						<div>
							<label className={styles.label} htmlFor="project-form-deadline">
								Deadline
							</label>
							<Popover open={deadlineOpen} onOpenChange={setDeadlineOpen}>
								<PopoverTrigger asChild>
									<Button
										id="project-form-deadline"
										type="button"
										variant="outline"
										className={cn(
											styles.dateTrigger,
											!deadlineDate && styles.mutedText,
										)}
									>
										<span
											className={cn(
												styles.dateLabel,
												!deadlineDate && styles.mutedText,
											)}
										>
											{deadlineDate
												? format(deadlineDate, "PPP")
												: "Select deadline"}
										</span>
										<CalendarIcon
											className={styles.calendarIcon}
											aria-hidden="true"
										/>
									</Button>
								</PopoverTrigger>
								<PopoverContent className={styles.popoverContent} align="start">
									<Calendar
										mode="single"
										selected={deadlineDate ?? undefined}
										defaultMonth={deadlineDate ?? new Date()}
										onSelect={(date) => {
											setFormData({
												...formData,
												deadline: date ? format(date, "yyyy-MM-dd") : "",
											});
											setDeadlineOpen(false);
										}}
									/>
								</PopoverContent>
							</Popover>
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
				</div>
				<div className={styles.footer}>
					<button
						type="button"
						onClick={onSubmit}
						className={styles.buttonPrimary}
					>
						{isEditing ? "Update Project" : "Create Project"}
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
