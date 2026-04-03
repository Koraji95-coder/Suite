import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
	deriveProjectListGroups,
	selectVisibleProjects,
} from "@/features/project-core";
import { ProjectCard } from "./ProjectCard";
import styles from "./ProjectList.module.css";
import {
	type Project,
	type StatusFilter,
	type TaskCount,
} from "@/features/project-core";
import { normalizeProjectCategory } from "@/features/project-core";

interface ProjectListProps {
	projects: Project[];
	selectedProject: Project | null;
	projectTaskCounts: Map<string, TaskCount>;
	onSelectProject: (project: Project) => void;
	onEditProject: (project: Project) => void;
	onDeleteProject: (projectId: string) => void;
	filter?: StatusFilter;
	onFilterChange?: (filter: StatusFilter) => void;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	showControls?: boolean;
}

export function ProjectList({
	projects,
	selectedProject,
	projectTaskCounts,
	onSelectProject,
	onEditProject,
	onDeleteProject,
	filter = "active",
	onFilterChange,
	searchQuery: externalSearch,
	onSearchChange,
	showControls = true,
}: ProjectListProps) {
	const [internalSearch, setInternalSearch] = useState("");

	const searchQuery =
		externalSearch !== undefined ? externalSearch : internalSearch;
	const handleSearchChange = (value: string) => {
		if (onSearchChange) onSearchChange(value);
		else setInternalSearch(value);
	};

	const filteredProjects = useMemo(
		() =>
			selectVisibleProjects({
				projects,
				statusFilter: filter,
				projectSearch: searchQuery,
			}),
		[filter, projects, searchQuery],
	);

	const categorizedProjects = useMemo(
		() => deriveProjectListGroups(filteredProjects),
		[filteredProjects],
	);

	const getGroupBadgeToneClass = (category: string | null | undefined) => {
		switch (normalizeProjectCategory(category)) {
			case "coding":
				return styles.groupBadgeCoding;
			case "substation":
				return styles.groupBadgeSubstation;
			case "standards":
				return styles.groupBadgeStandards;
			case "school":
				return styles.groupBadgeSchool;
			default:
				return styles.uncategorizedBadge;
		}
	};

	return (
		<div className={styles.root}>
			{showControls ? <h3 className={styles.title}>Projects</h3> : null}

			{showControls && onFilterChange && (
				<div className={styles.filterRow}>
					{(["active", "all", "on-hold", "archived"] as StatusFilter[]).map(
						(s) => (
							<button
								key={s}
								type="button"
								onClick={() => onFilterChange(s)}
								className={cn(
									styles.filterButton,
									filter === s && styles.filterButtonActive,
								)}
							>
								{s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")}
							</button>
						),
					)}
				</div>
			)}

			{showControls ? (
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => handleSearchChange(e.target.value)}
						placeholder="Search projects..."
						className={styles.searchInput}
						name="projectlist_input_100"
					/>
				</div>
			) : null}

			<div className={styles.scrollArea}>
				{categorizedProjects.map((group) => (
					<div key={group.category.key} className={styles.group}>
						<div className={styles.groupHeader}>
							<span
								className={cn(
									styles.groupBadge,
									getGroupBadgeToneClass(group.category.key),
								)}
							>
								{group.category.key}
							</span>
							<span className={styles.groupCount}>
								({group.projects.length}{" "}
								{group.projects.length === 1 ? "project" : "projects"})
							</span>
						</div>
						<div className={styles.cards}>
							{group.projects.map((project) => (
								<ProjectCard
									key={project.id}
									project={project}
									isSelected={selectedProject?.id === project.id}
									taskInfo={projectTaskCounts.get(project.id)}
									onSelect={onSelectProject}
									onEdit={onEditProject}
									onDelete={onDeleteProject}
								/>
							))}
						</div>
					</div>
				))}

				{filteredProjects.length === 0 && (
					<div className={styles.emptyState}>
						<Search className={styles.emptyIcon} />
						<p className={styles.emptyTitle}>
							{searchQuery
								? "No projects match your search"
								: "No projects match your filters"}
						</p>
						<p className={styles.emptySub}>
							{searchQuery
								? `No results for "${searchQuery}"`
								: "Try changing the status filter or create a new project"}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
