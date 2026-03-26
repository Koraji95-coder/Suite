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
	const basePath = normalizedProjectId
		? `/app/projects/${encodeURIComponent(normalizedProjectId)}`
		: "/app/projects";
	const params = new URLSearchParams();
	if (view) {
		params.set("view", view);
	}
	for (const [key, value] of Object.entries(extraParams ?? {})) {
		if (value) {
			params.set(key, value);
		}
	}
	const serialized = params.toString();
	return serialized ? `${basePath}?${serialized}` : basePath;
}
