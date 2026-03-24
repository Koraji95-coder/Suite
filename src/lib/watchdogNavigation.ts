export type CommandCenterTab = "commands" | "architecture";

export function buildWatchdogHref(projectId?: string | null): string {
	const params = new URLSearchParams();
	if (projectId) {
		params.set("project", projectId);
	}
	const serialized = params.toString();
	return serialized ? `/app/watchdog?${serialized}` : "/app/watchdog";
}

// Legacy helper retained for compatibility while the dedicated Watchdog page
// becomes the canonical telemetry destination.
export function buildDashboardWatchdogHref(projectId?: string | null): string {
	return buildWatchdogHref(projectId);
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
