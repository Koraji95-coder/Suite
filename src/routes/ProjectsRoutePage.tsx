import { useParams, useSearchParams } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { ProjectManager } from "@/features/project-manager";
import type { ViewMode } from "@/features/project-core";

const VALID_VIEW_MODES = new Set<ViewMode>([
	"setup",
	"readiness",
	"review",
	"issue-sets",
	"tasks",
	"calendar",
	"files",
	"ground-grids",
	"revisions",
]);

export default function ProjectsRoutePage() {
	const { projectId } = useParams<{ projectId: string }>();
	const [searchParams] = useSearchParams();
	const requestedView = searchParams.get("view");
	const initialIssueSetId = searchParams.get("issueSet") || undefined;
	const initialViewMode =
		requestedView && VALID_VIEW_MODES.has(requestedView as ViewMode)
			? (requestedView as ViewMode)
			: undefined;
	useRegisterPageHeader({
		title: "Projects",
		subtitle: "Project setup, review, telemetry, and delivery workflows.",
	});

	return (
		<PageFrame maxWidth="full">
			<ProjectManager
				initialProjectId={projectId}
				initialIssueSetId={initialIssueSetId}
				initialViewMode={initialViewMode}
			/>
		</PageFrame>
	);
}
