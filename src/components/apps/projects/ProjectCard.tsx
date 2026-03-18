import { AlertCircle, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ProjectCard.module.css";
import { type Project, type TaskCount } from "./projectmanagertypes";
import {
	formatDateOnly,
	getPriorityTone,
	normalizeProjectCategory,
} from "./projectmanagerutils";

interface ProjectCardProps {
	project: Project;
	isSelected: boolean;
	taskInfo?: TaskCount;
	onSelect: (project: Project) => void;
	onEdit: (project: Project) => void;
	onDelete: (projectId: string) => void;
	onToggleArchive?: (project: Project) => void;
}

export function ProjectCard({
	project,
	isSelected,
	taskInfo,
	onSelect,
	onEdit,
	onDelete,
}: ProjectCardProps) {
	const isArchived = project.status === "completed";
	const taskCount = taskInfo?.total ?? 0;
	const completedCount = taskInfo?.completed ?? 0;
	const completionPct =
		taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
	const nextDue = taskInfo?.nextDue ?? null;
	const hasOverdue = taskInfo?.hasOverdue ?? false;

	const showUpcomingTask =
		!isArchived &&
		nextDue &&
		project.deadline &&
		nextDue.date.split("T")[0] < project.deadline.split("T")[0];

	const categoryTone = normalizeProjectCategory(project.category);
	const priorityTone = getPriorityTone(project.priority);

	const categoryToneClass =
		categoryTone === "coding"
			? styles.categoryCoding
			: categoryTone === "substation"
				? styles.categorySubstation
				: categoryTone === "standards"
					? styles.categoryStandards
					: categoryTone === "school"
						? styles.categorySchool
						: styles.categoryGeneric;

	const priorityToneClass =
		priorityTone === "urgent"
			? styles.priorityUrgent
			: priorityTone === "high"
				? styles.priorityHigh
				: priorityTone === "medium"
					? styles.priorityMedium
					: styles.priorityLow;

	return (
		<div
			onClick={() => onSelect(project)}
			className={cn(styles.root, isSelected && styles.selected)}
		>
				<div className={styles.header}>
					<div className={styles.identity}>
						<div className={cn(styles.categoryDot, categoryToneClass)} />
						<h4 className={styles.title}>{project.name}</h4>
					</div>
				<div className={styles.actions}>
					<button
						onClick={(event) => {
							event.stopPropagation();
							onEdit(project);
						}}
						className={styles.iconButton}
						type="button"
					>
						<Edit className={styles.editIcon} />
					</button>
					<button
						onClick={(event) => {
							event.stopPropagation();
							onDelete(project.id);
						}}
						className={styles.iconButton}
						type="button"
					>
						<Trash2 className={styles.deleteIcon} />
					</button>
				</div>
			</div>

			<div className={styles.statusRow}>
				{isArchived ? (
					<span className={styles.statusText}>Archived</span>
				) : (
					<>
						<span className={styles.statusText}>{project.status}</span>
						<span className={cn(styles.priorityChip, priorityToneClass)}>
							{project.priority}
						</span>
					</>
				)}
			</div>

			{project.deadline && (
				<div className={styles.dueText}>
					{isArchived
						? `Archived ${formatDateOnly(project.deadline)}`
						: `Due ${formatDateOnly(project.deadline)}`}
				</div>
			)}

			{taskCount > 0 && (
				<div className={styles.progressRow}>
					<div className={styles.progressTrack}>
						<div
							className={styles.progressFill}
							style={{ width: `${completionPct}%` }}
						/>
					</div>
					<span className={styles.progressMeta}>
						{completedCount}/{taskCount} • {completionPct}%
					</span>
				</div>
			)}

			{!isArchived && hasOverdue && (
				<div className={cn(styles.alert, styles.alertDanger)}>
					<AlertCircle className={styles.alertIcon} />
					<span className={styles.alertText}>Overdue tasks</span>
				</div>
			)}

			{showUpcomingTask && nextDue && (
				<div className={cn(styles.alert, styles.alertWarning)}>
					<AlertCircle className={styles.alertIcon} />
					<span className={styles.alertText}>
						Task "{nextDue.name}" due {formatDateOnly(nextDue.date)}
					</span>
				</div>
			)}
		</div>
	);
}
