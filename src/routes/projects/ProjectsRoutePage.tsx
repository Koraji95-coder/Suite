import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import type { ViewMode } from "@/features/project-core";
import { ProjectManager } from "@/features/project-manager";
import {
	buildProjectDetailHref,
	isProjectNotebookSection,
	resolveProjectViewModeFromNotebookLocation,
} from "@/lib/projectWorkflowNavigation";

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
	const navigate = useNavigate();
	const { projectId, section } = useParams<{
		projectId: string;
		section: string;
	}>();
	const [searchParams] = useSearchParams();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		projectId ?? null,
	);
	const requestedSection = section ?? searchParams.get("section");
	const requestedPanel = searchParams.get("panel");
	const requestedView = resolveProjectViewModeFromNotebookLocation(
		requestedSection,
		requestedPanel,
	);
	const initialIssueSetId = searchParams.get("issueSet") || undefined;
	const initialViewMode = VALID_VIEW_MODES.has(requestedView)
		? requestedView
		: undefined;

	useEffect(() => {
		setSelectedProjectId(projectId ?? null);
	}, [projectId]);

	useEffect(() => {
		if (!projectId) {
			return;
		}
		if (isProjectNotebookSection(section)) {
			return;
		}
		navigate(
			buildProjectDetailHref(projectId, requestedView, {
				issueSet: initialIssueSetId,
			}),
			{ replace: true },
		);
	}, [
		initialIssueSetId,
		navigate,
		projectId,
		requestedView,
		section,
	]);

	const syncProjectLocation = useCallback(
		(nextProjectId: string | null, nextViewMode: ViewMode, nextIssueSetId?: string | null) => {
			if (!nextProjectId) {
				return;
			}
			const currentProjectId = projectId ?? selectedProjectId;
			const currentSection = section ?? searchParams.get("section");
			const currentPanel = searchParams.get("panel");
			const currentViewMode = resolveProjectViewModeFromNotebookLocation(
				currentSection,
				currentPanel,
			);
			const currentIssueSetId = searchParams.get("issueSet");
			const currentHref = buildProjectDetailHref(currentProjectId, currentViewMode, {
				issueSet: currentIssueSetId,
			});
			const nextHref = buildProjectDetailHref(nextProjectId, nextViewMode, {
				issueSet: nextIssueSetId ?? currentIssueSetId,
			});
			if (nextHref === currentHref) {
				return;
			}
			navigate(nextHref, { replace: true });
		},
		[navigate, projectId, searchParams, section, selectedProjectId],
	);

	useRegisterPageHeader({
		title: "Projects",
		subtitle:
			"Project notebook for notes, meetings, files, stage status, review, and release context.",
	});

	return (
		<PageFrame maxWidth="full">
			<ProjectManager
				initialProjectId={projectId}
				initialIssueSetId={initialIssueSetId}
				initialViewMode={initialViewMode}
				onSelectedProjectIdChange={(nextProjectId) => {
					setSelectedProjectId(nextProjectId);
					if (!nextProjectId || nextProjectId === projectId) {
						return;
					}
					syncProjectLocation(
						nextProjectId,
						initialViewMode ?? "setup",
						initialIssueSetId,
					);
				}}
				onViewModeChange={(nextViewMode) => {
					const nextProjectId = projectId ?? selectedProjectId;
					syncProjectLocation(
						nextProjectId,
						nextViewMode,
						searchParams.get("issueSet"),
					);
				}}
				onActiveIssueSetIdChange={(nextIssueSetId) => {
					const nextProjectId = projectId ?? selectedProjectId;
					const nextViewMode =
						initialViewMode ??
						resolveProjectViewModeFromNotebookLocation(
							section ?? searchParams.get("section"),
							searchParams.get("panel"),
						);
					syncProjectLocation(nextProjectId, nextViewMode, nextIssueSetId);
				}}
			/>
		</PageFrame>
	);
}
