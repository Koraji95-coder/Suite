import { Archive, Calendar, FileDown } from "lucide-react";
import styles from "./ProjectDetailHeader.module.css";
import type { Project, Task } from "./projectmanagertypes";
import { categoryColor, formatDateOnly } from "./projectmanagerutils";

interface ProjectDetailHeaderProps {
	project: Project;
	tasks: Task[];
	onToggleArchive: (project: Project) => void;
	onExportMarkdown: () => void;
}

export function ProjectDetailHeader({
	project,
	tasks,
	onToggleArchive,
	onExportMarkdown,
}: ProjectDetailHeaderProps) {
	const completionPercentage =
		tasks.length > 0
			? Math.round(
					(tasks.filter((task) => task.completed).length / tasks.length) * 100,
				)
			: 0;

	const completedTaskCount = tasks.filter((task) => task.completed).length;
	const overdueTaskCount = tasks.filter((task) => {
		if (task.completed || !task.due_date) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [year, month, day] = task.due_date
			.split("T")[0]
			.split("-")
			.map(Number);
		return new Date(year, month - 1, day) < today;
	}).length;

	const metrics = [
		{ label: "Tasks", value: String(tasks.length) },
		{ label: "Completed", value: String(completedTaskCount) },
		{ label: "Overdue", value: String(overdueTaskCount) },
		{ label: "Progress", value: `${completionPercentage}%` },
	];

	return (
		<section className={styles.root}>
			<div className={styles.top}>
				<div className={styles.main}>
					<h3 className={styles.title}>{project.name}</h3>
					<p className={styles.description}>{project.description}</p>

					<div className={styles.metaRow}>
						<span className={styles.statusBadge}>
							{(project.status === "completed" ? "archived" : project.status)
								.replace("-", " ")
								.replace(/\b\w/g, (letter) => letter.toUpperCase())}
						</span>

						{project.deadline && (
							<div className={styles.deadline}>
								<Calendar className={styles.deadlineIcon} />
								<span>
									{project.status === "completed"
										? `Archived ${formatDateOnly(project.deadline)}`
										: `Due ${formatDateOnly(project.deadline)}`}
								</span>
							</div>
						)}

						{project.category && (
							<span
								className={styles.categoryBadge}
								style={{
									borderColor: categoryColor(project.category),
									color: categoryColor(project.category),
									background: `${categoryColor(project.category)}15`,
								}}
							>
								{project.category}
							</span>
						)}
					</div>

					<div className={styles.metrics}>
						{metrics.map((metric) => (
							<div key={metric.label} className={styles.metricCard}>
								<p className={styles.metricLabel}>{metric.label}</p>
								<p className={styles.metricValue}>{metric.value}</p>
							</div>
						))}
					</div>
				</div>

				<div className={styles.actions}>
					<button
						onClick={() => onToggleArchive(project)}
						className={styles.actionButton}
						title={
							project.status === "completed"
								? "Unarchive project"
								: "Archive project"
						}
						type="button"
					>
						<Archive className={styles.actionIcon} />
						<span>
							{project.status === "completed" ? "Unarchive" : "Archive"}
						</span>
					</button>
					<button
						onClick={onExportMarkdown}
						className={styles.actionButton}
						title="Copy project as Markdown"
						type="button"
					>
						<FileDown className={styles.actionIcon} />
						<span>Export</span>
					</button>
				</div>
			</div>

			<div className={styles.progress}>
				<div className={styles.progressMeta}>
					<span className={styles.progressLabel}>Progress</span>
					<span className={styles.progressValue}>{completionPercentage}%</span>
				</div>
				<div className={styles.progressTrack}>
					<div
						className={styles.progressFill}
						style={{ width: `${completionPercentage}%` }}
					/>
				</div>
			</div>
		</section>
	);
}
