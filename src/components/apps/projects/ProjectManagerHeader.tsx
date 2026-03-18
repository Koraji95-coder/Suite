import { ChevronRight, Home, Plus, Search, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelInfoDialog } from "../../../data/PanelInfoDialog";
import { projectsInfo } from "../../../data/panelInfo";
import styles from "./ProjectManagerHeader.module.css";
import type { StatusFilter } from "./projectmanagertypes";

interface ProjectManagerHeaderProps {
	currentCrumb: string;
	statusFilter: StatusFilter;
	onStatusFilterChange: (status: StatusFilter) => void;
	projectSearch: string;
	onProjectSearchChange: (value: string) => void;
	activeProjects: number;
	archivedProjects: number;
	totalProjects: number;
	visibleProjectCount: number;
	onCreateProject: () => void;
	onGoWorkspace: () => void;
	onGoProjects: () => void;
}

export function ProjectManagerHeader({
	currentCrumb,
	statusFilter,
	onStatusFilterChange,
	projectSearch,
	onProjectSearchChange,
	activeProjects,
	archivedProjects,
	totalProjects,
	visibleProjectCount,
	onCreateProject,
	onGoWorkspace,
	onGoProjects,
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
						<div className={styles.crumbs}>
							<button
								type="button"
								onClick={onGoWorkspace}
								className={styles.crumbButton}
							>
								<Home className={styles.iconSm} />
								Workspace
							</button>
							<ChevronRight className={styles.chevron} />
							<button
								type="button"
								onClick={onGoProjects}
								className={styles.crumbButton}
							>
								Projects
							</button>
							<ChevronRight className={styles.chevron} />
							<span className={styles.crumbCurrent}>{currentCrumb}</span>
						</div>
						<div>
							<p className={styles.eyebrow}>Workspace operations</p>
							<h2 className={styles.title}>Project Manager</h2>
							<p className={styles.subtitle}>
								Track workstreams, deadlines, and deliverables in one place.
							</p>
							<p className={styles.summary}>
								{currentFilterLabel} with {visibleProjectCount} visible in the
								current queue.
							</p>
						</div>
					</div>

					<div className={styles.actions}>
						<button onClick={onCreateProject} className={styles.createButton}>
							<Plus className={styles.iconSm} />
							<span>New Project</span>
						</button>
						<PanelInfoDialog
							title={projectsInfo.title}
							sections={projectsInfo.sections}
							colorScheme={projectsInfo.colorScheme}
						/>
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
								<span className={styles.statLabel}>Visible</span>
								<strong className={styles.statValue}>{visibleProjectCount}</strong>
							</div>
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
