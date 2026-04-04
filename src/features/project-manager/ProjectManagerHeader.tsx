import { Plus, Search, Target } from "lucide-react";
import { PageContextBand } from "@/components/system/PageContextBand";
import type { StatusFilter } from "@/features/project-core";
import { cn } from "@/lib/utils";
import styles from "./ProjectManagerHeader.module.css";

interface ProjectManagerHeaderProps {
	statusFilter: StatusFilter;
	onStatusFilterChange: (status: StatusFilter) => void;
	projectSearch: string;
	onProjectSearchChange: (value: string) => void;
	activeProjects: number;
	archivedProjects: number;
	totalProjects: number;
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
	onCreateProject,
}: ProjectManagerHeaderProps) {
	const statusOptions: StatusFilter[] = [
		"active",
		"all",
		"on-hold",
		"archived",
	];
	return (
		<PageContextBand
			eyebrow="Projects"
			summary={
				<div>
					<p className={styles.subtitle}>
						Keep notes, meetings, files, stage status, review, and release
						context tied to each project.
					</p>
					<p className={styles.summary}>
						{activeProjects} active - {archivedProjects} archived
					</p>
				</div>
			}
			actions={
				<div className={styles.actions}>
					<button onClick={onCreateProject} className={styles.createButton}>
						<Plus className={styles.iconSm} />
						New Project
					</button>
				</div>
			}
		>
			<div className={styles.bottomRow}>
				<div className={styles.statusSection}>
					<div className={styles.sectionLabel}>
						<Target className={styles.iconSm} />
						<span>Filter</span>
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
						<label htmlFor="project-manager-search" className={styles.srOnly}>
							Search projects
						</label>
						<Search className={styles.searchIcon} />
						<input
							id="project-manager-search"
							type="text"
							value={projectSearch}
							onChange={(event) => onProjectSearchChange(event.target.value)}
							placeholder="Search projects, notes, or release context"
							className={styles.searchInput}
							name="projectSearch"
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
						<div className={styles.statCard}>
							<span className={styles.statLabel}>Total</span>
							<strong className={styles.statValue}>{totalProjects}</strong>
						</div>
					</div>
				</div>
			</div>
		</PageContextBand>
	);
}
