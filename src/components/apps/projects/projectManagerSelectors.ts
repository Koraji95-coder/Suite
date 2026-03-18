import type { Project, StatusFilter, Task } from "./projectmanagertypes";

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
