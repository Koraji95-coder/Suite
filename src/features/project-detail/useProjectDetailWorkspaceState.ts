import type { Project, ViewMode } from "@/features/project-core";
import { useProjectWatchdogTelemetry } from "@/features/project-watchdog";
import { useProjectDetailGridDesigns } from "./useProjectDetailGridDesigns";

interface UseProjectDetailWorkspaceStateArgs {
	project: Project;
	viewMode: ViewMode;
}

export function useProjectDetailWorkspaceState({
	project,
	viewMode,
}: UseProjectDetailWorkspaceStateArgs) {
	const loadsTrackedDrawings =
		viewMode === "files" ||
		viewMode === "issue-sets" ||
		viewMode === "readiness" ||
		viewMode === "review";
	const loadsDeepTelemetry = viewMode === "files";

	const { createLinkedDesign, gridDesigns, openGridDesign } =
		useProjectDetailGridDesigns(project, viewMode === "ground-grids");
	const telemetry = useProjectWatchdogTelemetry(project.id, undefined, {
		includeOverview: loadsDeepTelemetry,
		includeRecentEvents: loadsDeepTelemetry,
		includeTrackedDrawings: loadsTrackedDrawings,
	});

	return {
		createLinkedDesign,
		gridDesigns,
		openGridDesign,
		telemetry,
	};
}
