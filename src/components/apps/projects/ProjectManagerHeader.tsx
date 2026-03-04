import { ChevronRight, Filter, Home, Plus, Search } from "lucide-react";
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
							<h2 className={styles.title}>Project Manager</h2>
							<p className={styles.subtitle}>
								Track workstreams, deadlines, and deliverables in one place.
							</p>
						</div>
					</div>

					<div className={styles.actions}>
						<button onClick={onCreateProject} className={styles.createButton}>
							<Plus className={styles.iconSm} />
							<span>New Project</span>
						</button>
						<button type="button" className={styles.filtersButton}>
							<Filter className={styles.iconSm} />
							Filters
						</button>
						<PanelInfoDialog
							title={projectsInfo.title}
							sections={projectsInfo.sections}
							colorScheme={projectsInfo.colorScheme}
						/>
					</div>
				</div>

				<div className={styles.bottomRow}>
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

					<div className={styles.meta}>
						<div className={styles.searchWrap}>
							<Search className={styles.searchIcon} />
							<input
								type="text"
								value={projectSearch}
								onChange={(event) => onProjectSearchChange(event.target.value)}
								placeholder="Search projects..."
								className={styles.searchInput}
							/>
						</div>
						<div className={styles.stats}>
							<span className={styles.statBadge}>{activeProjects} active</span>
							<span className={styles.statBadge}>
								{archivedProjects} archived
							</span>
							<span className={cn(styles.statBadge, styles.statBadgeHighlight)}>
								{totalProjects} total
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
