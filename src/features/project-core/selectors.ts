import { PROJECT_CATEGORIES, type Project, type ProjectCategory, type StatusFilter, type Task } from "./models";

export interface SelectVisibleProjectsArgs {
	projects: Project[];
	statusFilter: StatusFilter;
	projectSearch: string;
}

export interface ProjectManagerSummary {
	totalProjects: number;
	archivedProjects: number;
	activeProjects: number;
	currentCrumb: string;
	pendingProjectName: string;
	pendingTaskName: string;
}

export interface DeriveProjectManagerSummaryArgs {
	projects: Project[];
	selectedProject: Project | null;
	tasks: Task[];
	projectIdPendingDelete: string | null;
	taskIdPendingDelete: string | null;
}

export interface ProjectListGroup {
	category: ProjectCategory;
	projects: Project[];
}

export function selectVisibleProjects({
	projects,
	statusFilter,
	projectSearch,
}: SelectVisibleProjectsArgs): Project[] {
	return projects.filter((project) => {
		if (statusFilter !== "all") {
			if (statusFilter === "archived") {
				if (project.status !== "completed") return false;
			} else {
				if (project.status === "completed") return false;
				if (project.status !== statusFilter) return false;
			}
		}

		if (projectSearch.trim()) {
			const query = projectSearch.trim().toLowerCase();
			return (
				project.name.toLowerCase().includes(query) ||
				project.description?.toLowerCase().includes(query)
			);
		}

		return true;
	});
}

export function deriveProjectManagerSummary({
	projects,
	selectedProject,
	tasks,
	projectIdPendingDelete,
	taskIdPendingDelete,
}: DeriveProjectManagerSummaryArgs): ProjectManagerSummary {
	const totalProjects = projects.length;
	const archivedProjects = projects.filter(
		(project) => project.status === "completed",
	).length;
	const activeProjects = totalProjects - archivedProjects;
	const currentCrumb = selectedProject?.name ?? "Overview";
	const pendingProjectName =
		projects.find((project) => project.id === projectIdPendingDelete)?.name ??
		"this project";
	const pendingTaskName =
		tasks.find((task) => task.id === taskIdPendingDelete)?.name ?? "this task";

	return {
		totalProjects,
		archivedProjects,
		activeProjects,
		currentCrumb,
		pendingProjectName,
		pendingTaskName,
	};
}

export function deriveProjectListGroups(
	projects: Project[],
): ProjectListGroup[] {
	return PROJECT_CATEGORIES.map((category) => ({
		category,
		projects: projects.filter((project) => {
			if (category.key === "Other") {
				return (
					!project.category ||
					project.category.trim().length === 0 ||
					project.category.toLowerCase() === "uncategorized"
				);
			}
			return project.category === category.key;
		}),
	})).filter((group) => group.projects.length > 0);
}
