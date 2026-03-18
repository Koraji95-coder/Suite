export type CommandCenterTab = "commands" | "architecture";

export function buildDashboardWatchdogHref(projectId?: string | null): string {
	const params = new URLSearchParams();
	params.set("focus", "watchdog");
	if (projectId) {
		params.set("project", projectId);
	}
	return `/app/dashboard?${params.toString()}`;
}

export function parseCommandCenterTab(value: string | null): CommandCenterTab | null {
	switch (value) {
		case "commands":
		case "architecture":
			return value;
		default:
			return null;
	}
}
