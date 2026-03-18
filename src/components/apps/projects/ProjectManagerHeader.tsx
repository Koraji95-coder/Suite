import { Plus, Search, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ProjectManagerHeader.module.css";
import type { StatusFilter } from "./projectmanagertypes";

interface ProjectManagerHeaderProps {
	statusFilter: StatusFilter;
	onStatusFilterChange: (status: StatusFilter) => void;
	projectSearch: string;
	onProjectSearchChange: (value: string) => void;
	activeProjects: number;
	archivedProjects: number;
	totalProjects: number;
	visibleProjectCount: number;
	onCreateProject: () => void;
}

export function ProjectManagerHeader({
	statusFilter,
	onStatusFilterChange,
	projectSearch,
	onProjectSearchChange,
	activeProjects,
	archivedProjects,
	totalProjects,
	visibleProjectCount,
	onCreateProject,
}: ProjectManagerHeaderProps) {
	const statusOptions: StatusFilter[] = [
		"active",
		"all",
		"on-hold",
		"archived",
	];
	const currentFilterLabel =
		statusFilter === "all"
			? "All tracked projects"
			: statusFilter === "archived"
				? "Archived projects"
				: statusFilter === "on-hold"
					? "On-hold projects"
					: "Active projects";

	return (
		<section className={styles.root}>
			<div className={styles.stack}>
				<div className={styles.topRow}>
					<div className={styles.intro}>
						<div>
							<p className={styles.eyebrow}>Workspace operations</p>
							<h2 className={styles.title}>Project Manager</h2>
							<p className={styles.subtitle}>
								Track workstreams, deadlines, and deliverables in one place.
							</p>
							<p className={styles.summary}>
								{currentFilterLabel} with {activeProjects} active and{" "}
								{archivedProjects} archived projects tracked.
							</p>
						</div>
					</div>

					<div className={styles.actions}>
						<button onClick={onCreateProject} className={styles.createButton}>
							<Plus className={styles.iconSm} />
							New Project
						</button>
						{visibleProjectCount > 0 ? (
							<span className={styles.queueBadge}>
								{visibleProjectCount} in queue
							</span>
						) : null}
					</div>
				</div>

				<div className={styles.bottomRow}>
					<div className={styles.statusSection}>
						<div className={styles.sectionLabel}>
							<Target className={styles.iconSm} />
							<span>Queue focus</span>
						</div>
						<div className={styles.statusChips}>
							{statusOptions.map((status) => (
								<button
									key={status}
									type="button"
									onClick={() => onStatusFilterChange(status)}
									className={cn(
										styles.statusChip,
										statusFilter === status && styles.statusChipActive,
									)}
								>
									{status.charAt(0).toUpperCase() +
										status.slice(1).replace("-", " ")}
								</button>
							))}
						</div>
					</div>

					<div className={styles.meta}>
						<div className={styles.searchWrap}>
							<Search className={styles.searchIcon} />
							<input
								type="text"
								value={projectSearch}
								onChange={(event) => onProjectSearchChange(event.target.value)}
								placeholder="Search projects..."
								className={styles.searchInput}
							name="projectmanagerheader_input_113"
							/>
						</div>
						<div className={styles.statsGrid}>
							<div className={styles.statCard}>
								<span className={styles.statLabel}>Active</span>
								<strong className={styles.statValue}>{activeProjects}</strong>
							</div>
							<div className={styles.statCard}>
								<span className={styles.statLabel}>Archived</span>
								<strong className={styles.statValue}>{archivedProjects}</strong>
							</div>
							<div
								className={cn(styles.statCard, styles.statCardHighlight)}
							>
								<span className={styles.statLabel}>Total</span>
								<strong className={styles.statValue}>{totalProjects}</strong>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
