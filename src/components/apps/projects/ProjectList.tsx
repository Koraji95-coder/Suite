import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./ProjectCard";
import styles from "./ProjectList.module.css";
import {
	PROJECT_CATEGORIES,
	Project,
	type StatusFilter,
	TaskCount,
} from "./projectmanagertypes";
import { categoryBadgeStyle } from "./projectmanagerutils";

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
}: ProjectListProps) {
	const [internalSearch, setInternalSearch] = useState("");

	const searchQuery =
		externalSearch !== undefined ? externalSearch : internalSearch;
	const handleSearchChange = (value: string) => {
		if (onSearchChange) onSearchChange(value);
		else setInternalSearch(value);
	};

	const filteredProjects = projects.filter((p) => {
		if (filter !== "all") {
			if (filter === "archived") {
				if (p.status !== "completed") return false;
			} else {
				if (p.status === "completed") return false;
				if (filter !== p.status) return false;
			}
		}
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				p.description?.toLowerCase().includes(q)
			);
		}
		return true;
	});

	const categorizedProjects = PROJECT_CATEGORIES.map((cat) => ({
		cat,
		items: filteredProjects.filter((p) => p.category === cat.key),
	})).filter((group) => group.items.length > 0);

	const uncategorizedProjects = filteredProjects.filter((p) => !p.category);

	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Projects</h3>

			{onFilterChange && (
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

			<div className={styles.scrollArea}>
				{categorizedProjects.map((group) => (
					<div key={group.cat.key} className={styles.group}>
						<div className={styles.groupHeader}>
							<span
								className={styles.groupBadge}
								style={categoryBadgeStyle(group.cat.key)}
							>
								{group.cat.key}
							</span>
							<span className={styles.groupCount}>
								({group.items.length}{" "}
								{group.items.length === 1 ? "project" : "projects"})
							</span>
						</div>
						<div className={styles.cards}>
							{group.items.map((project) => (
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

				{uncategorizedProjects.length > 0 && (
					<div className={styles.group}>
						<div className={styles.groupHeader}>
							<span
								className={cn(styles.groupBadge, styles.uncategorizedBadge)}
							>
								Uncategorized
							</span>
							<span className={styles.groupCount}>
								({uncategorizedProjects.length}{" "}
								{uncategorizedProjects.length === 1 ? "project" : "projects"})
							</span>
						</div>
						<div className={styles.cards}>
							{uncategorizedProjects.map((project) => (
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
				)}

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
