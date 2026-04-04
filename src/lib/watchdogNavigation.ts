import { buildProjectScopedAppHref } from "./projectWorkflowNavigation";

export function buildWatchdogHref(
	projectId?: string | null,
	issueSetId?: string | null,
): string {
	return buildProjectScopedAppHref(
		"/app/developer/control/watchdog",
		projectId,
		{
		issueSet: issueSetId,
		},
	);
}

// Legacy helper retained for compatibility while the dedicated Watchdog page
// becomes the canonical telemetry destination.
export function buildDashboardWatchdogHref(
	projectId?: string | null,
	issueSetId?: string | null,
): string {
	return buildWatchdogHref(projectId, issueSetId);
}
