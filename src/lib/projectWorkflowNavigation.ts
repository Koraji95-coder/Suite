type ProjectWorkspaceView =
	| "setup"
	| "readiness"
	| "review"
	| "issue-sets"
	| "revisions"
	| "files"
	| "tasks"
	| "calendar"
	| "ground-grids";

export type ProjectNotebookSection =
	| "overview"
	| "calendar"
	| "files"
	| "release"
	| "review";

const PROJECT_NOTEBOOK_DEFAULT_VIEW: Record<
	ProjectNotebookSection,
	ProjectWorkspaceView
> = {
	overview: "setup",
	calendar: "calendar",
	files: "files",
	release: "issue-sets",
	review: "review",
};

const PROJECT_VIEW_ROUTE_META: Record<
	ProjectWorkspaceView,
	{
		section: ProjectNotebookSection;
		panel?: string;
	}
> = {
	setup: { section: "overview" },
	tasks: { section: "overview", panel: "tasks" },
	"ground-grids": { section: "overview", panel: "ground-grids" },
	calendar: { section: "calendar" },
	files: { section: "files" },
	readiness: { section: "review", panel: "readiness" },
	review: { section: "review" },
	"issue-sets": { section: "release" },
	revisions: { section: "release", panel: "revisions" },
};

export function isProjectNotebookSection(
	value: string | null | undefined,
): value is ProjectNotebookSection {
	return (
		value === "overview" ||
		value === "calendar" ||
		value === "files" ||
		value === "release" ||
		value === "review"
	);
}

export function resolveProjectNotebookSection(
	view: ProjectWorkspaceView | null | undefined,
): ProjectNotebookSection {
	if (!view) {
		return "overview";
	}
	return PROJECT_VIEW_ROUTE_META[view].section;
}

export function resolveProjectViewModeFromNotebookLocation(
	section: string | null | undefined,
	panel: string | null | undefined,
): ProjectWorkspaceView {
	if (!isProjectNotebookSection(section)) {
		return PROJECT_NOTEBOOK_DEFAULT_VIEW.overview;
	}
	if (section === "overview") {
		return panel === "tasks"
			? "tasks"
			: panel === "ground-grids"
				? "ground-grids"
				: PROJECT_NOTEBOOK_DEFAULT_VIEW.overview;
	}
	if (section === "review") {
		return panel === "readiness"
			? "readiness"
			: PROJECT_NOTEBOOK_DEFAULT_VIEW.review;
	}
	if (section === "release") {
		return panel === "revisions"
			? "revisions"
			: PROJECT_NOTEBOOK_DEFAULT_VIEW.release;
	}
	return PROJECT_NOTEBOOK_DEFAULT_VIEW[section];
}

export function buildProjectIssueSetAppHref(
	path: string,
	projectId?: string | null,
	issueSetId?: string | null,
	extraParams?: Record<string, string | null | undefined>,
): string {
	return buildProjectScopedAppHref(path, projectId, {
		issueSet: issueSetId,
		...(extraParams ?? {}),
	});
}

export function buildProjectScopedAppHref(
	path: string,
	projectId?: string | null,
	extraParams?: Record<string, string | null | undefined>,
): string {
	const params = new URLSearchParams();
	if (projectId) {
		params.set("project", projectId);
	}
	for (const [key, value] of Object.entries(extraParams ?? {})) {
		if (value) {
			params.set(key, value);
		}
	}
	const serialized = params.toString();
	return serialized ? `${path}?${serialized}` : path;
}

export function buildProjectDetailHref(
	projectId?: string | null,
	view?: ProjectWorkspaceView | null,
	extraParams?: Record<string, string | null | undefined>,
): string {
	const normalizedProjectId = projectId?.trim();
	const resolvedView = view ?? PROJECT_NOTEBOOK_DEFAULT_VIEW.overview;
	const routeMeta = PROJECT_VIEW_ROUTE_META[resolvedView];
	const basePath = normalizedProjectId
		? `/app/projects/${encodeURIComponent(normalizedProjectId)}/${routeMeta.section}`
		: "/app/projects";
	const params = new URLSearchParams();
	if (!normalizedProjectId) {
		params.set("section", routeMeta.section);
	}
	if (routeMeta.panel) {
		params.set("panel", routeMeta.panel);
	}
	for (const [key, value] of Object.entries(extraParams ?? {})) {
		if (value) {
			params.set(key, value);
		}
	}
	const serialized = params.toString();
	return serialized ? `${basePath}?${serialized}` : basePath;
}
