import { useEffect, useMemo, useState } from "react";
import type { TrustState } from "@/components/system/TrustStateBadge";
import type { Project } from "@/features/project-core";
import { useToast } from "@/components/notification-system/ToastProvider";
import { projectDocumentMetadataService } from "@/features/project-documents";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import type { ProjectTitleBlockProfileRow } from "@/services/projectTitleBlockProfileService";
import { openProjectSetupFromStoredProfile } from "./orchestration";
import type { TitleBlockSyncArtifacts } from "./types";
import { DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME, loadProjectSetupProfile } from "./wizard";
import { buildTitleBlockSyncFailureMessage } from "./workflowMessages";

export interface ProjectSetupStatusCard {
	id: string;
	title: string;
	state: TrustState;
	summary: string;
	detail: string;
}

interface ProjectSetupReadinessStateData {
	profile: ProjectTitleBlockProfileRow | null;
	revisions: DrawingRevisionRegisterRow[];
	artifacts: TitleBlockSyncArtifacts | null;
	scanWarnings: string[];
	loading: boolean;
	messages: string[];
}

interface ProjectSetupAcadeProjectFileSummary {
	path: string;
	state: string;
}

interface ProjectSetupAcadeSupportStatus {
	label: string;
	detail: string;
	tone: "existing" | "starter" | "pending";
}

const EMPTY_STATE: ProjectSetupReadinessStateData = {
	profile: null,
	revisions: [],
	artifacts: null,
	scanWarnings: [],
	loading: true,
	messages: [],
};

function hasConfiguredDefaults(profile: ProjectTitleBlockProfileRow | null) {
	if (!profile) {
		return false;
	}
	return Boolean(
		profile.acade_line1.trim() ||
			profile.acade_line2.trim() ||
			profile.acade_line4.trim() ||
			profile.signer_drawn_by.trim() ||
			profile.signer_checked_by.trim() ||
			profile.signer_engineer.trim(),
	);
}

function countConfiguredDefaults(profile: ProjectTitleBlockProfileRow | null) {
	if (!profile) {
		return 0;
	}
	return [
		profile.acade_line1,
		profile.acade_line2,
		profile.acade_line4,
		profile.signer_drawn_by,
		profile.signer_checked_by,
		profile.signer_engineer,
	].filter((value) => value.trim().length > 0).length;
}

function getTrackingCard(
	project: Project,
	telemetry: ProjectWatchdogTelemetry,
): ProjectSetupStatusCard {
	const projectRoot = project.watchdog_root_path?.trim() || "";
	const ruleRoots = telemetry.rule?.roots ?? [];
	const primaryRoot = ruleRoots[0] || projectRoot;
	if (!primaryRoot) {
		return {
			id: "tracking",
			title: "Tracking root",
			state: telemetry.loading ? "background" : "needs-attention",
			summary: "No tracking root is configured yet.",
			detail:
				"Choose the project folder so Watchdog, the drawing list, and title block tools all map the same work.",
		};
	}
	if (!telemetry.ruleConfigured) {
		return {
			id: "tracking",
			title: "Tracking root",
			state: telemetry.loading ? "background" : "needs-attention",
			summary: primaryRoot,
			detail:
				"The project root is saved, but shared mapping rules still need to be confirmed before workstation activity lands consistently.",
		};
	}
	return {
		id: "tracking",
		title: "Tracking root",
		state: "ready",
		summary: primaryRoot,
		detail:
			ruleRoots.length > 1
				? `${ruleRoots.length} shared roots are active for this project.`
				: "Project root and shared mapping rules are in place.",
	};
}

function getDefaultsCard(
	profile: ProjectTitleBlockProfileRow | null,
	loading: boolean,
): ProjectSetupStatusCard {
	const configuredDefaults = countConfiguredDefaults(profile);
	const blockName =
		profile?.block_name?.trim() || DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME;
	if (!profile && loading) {
		return {
			id: "defaults",
			title: "Title block defaults",
			state: "background",
			summary: "Loading saved defaults...",
			detail:
				"Checking the stored project profile for signer names and ACADE lines.",
		};
	}
	if (!hasConfiguredDefaults(profile)) {
		return {
			id: "defaults",
			title: "Title block defaults",
			state: "needs-attention",
			summary: blockName,
			detail:
				"Only the base block is configured. Add signer names or ACADE lines before issue prep starts.",
		};
	}
	return {
		id: "defaults",
		title: "Title block defaults",
		state: "ready",
		summary: `${configuredDefaults} project default${configuredDefaults === 1 ? "" : "s"} set`,
		detail: `${blockName} will seed drawing scans, issue prep, and title block review.`,
	};
}

function getRevisionCard(
	revisions: DrawingRevisionRegisterRow[],
	loading: boolean,
): ProjectSetupStatusCard {
	if (loading && revisions.length === 0) {
		return {
			id: "revisions",
			title: "Issue prep",
			state: "background",
			summary: "Loading revision register...",
			detail:
				"Checking whether the project already has revision or issue history to build from.",
		};
	}
	if (revisions.length === 0) {
		return {
			id: "revisions",
			title: "Issue prep",
			state: "needs-attention",
			summary: "No revision register entries yet.",
			detail:
				"Start the drawing list and issue-prep flow so the project has revision history before package assembly.",
		};
	}
	const openCount = revisions.filter(
		(entry) => entry.issue_status !== "resolved",
	).length;
	return {
		id: "revisions",
		title: "Issue prep",
		state: openCount > 0 ? "needs-attention" : "ready",
		summary: `${revisions.length} revision entr${revisions.length === 1 ? "y" : "ies"} tracked`,
		detail:
			openCount > 0
				? `${openCount} item${openCount === 1 ? "" : "s"} still need review before issue.`
				: "Revision history is in place for issue-set review and package assembly.",
	};
}

function getAcadeProjectFileSummary(
	profile: ProjectTitleBlockProfileRow | null,
	artifacts: TitleBlockSyncArtifacts | null,
): ProjectSetupAcadeProjectFileSummary {
	if (artifacts?.wdpPath) {
		return {
			path: artifacts.wdpPath,
			state:
				artifacts.wdpState === "existing"
					? "Existing .wdp detected. Suite will keep using it as the ACADE project definition."
					: "Starter .wdp derived from the current project setup.",
		};
	}
	if (profile?.acade_project_file_path?.trim()) {
		return {
			path: profile.acade_project_file_path.trim(),
			state:
				"Configured .wdp path. Suite will activate this project in ACADE and only write starter support files here if the project definition is missing.",
		};
	}
	return {
		path: "Starter .wdp path will be derived from the project root.",
		state:
			"No explicit .wdp path is set yet. Suite will derive one from the project root and create it if it is missing.",
	};
}

function getAcadeSupportStatus(
	profile: ProjectTitleBlockProfileRow | null,
	artifacts: TitleBlockSyncArtifacts | null,
): ProjectSetupAcadeSupportStatus {
	if (artifacts?.wdpState === "existing") {
		return {
			label: "Existing ACADE project definition",
			detail:
				"Suite detected an existing .wdp project definition and will preserve it while keeping the companion support files aligned.",
			tone: "existing",
		};
	}

	if (artifacts?.wdpPath || profile?.acade_project_file_path?.trim()) {
		return {
			label: "Suite starter scaffold active",
			detail:
				"Suite is using a starter .wdp scaffold and companion .wdt/.wdl files until you replace them with a confirmed ACADE project definition.",
			tone: "starter",
		};
	}

	return {
		label: "ACADE scaffold not written yet",
		detail:
			"Save the project once with a valid root and Suite will create the starter .wdp/.wdt/.wdl files automatically.",
		tone: "pending",
	};
}

function isLowSignalSetupWarning(message: string) {
	const normalized = String(message || "").trim().toLowerCase();
	return (
		normalized.includes("live dwg metadata is unavailable right now") ||
		normalized.includes("live drawing metadata is not connected right now") ||
		(normalized.includes("filename fallback") &&
			normalized.includes("drawing rows")) ||
		(normalized.includes("pairing drawing rows by filename") &&
			normalized.includes("dwg bridge"))
	);
}

export function useProjectSetupReadinessState(
	project: Project,
	telemetry: ProjectWatchdogTelemetry,
) {
	const { showToast } = useToast();
	const [state, setState] = useState<ProjectSetupReadinessStateData>(EMPTY_STATE);
	const [isOpeningAcadeProject, setIsOpeningAcadeProject] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const profileResult = await loadProjectSetupProfile({
				projectId: project.id,
				projectRootPath: project.watchdog_root_path,
			});
			const effectiveProjectRoot =
				profileResult.data.project_root_path?.trim() ||
				project.watchdog_root_path?.trim() ||
				"";
			const [revisionsResult, snapshotResult] = await Promise.all([
				projectRevisionRegisterService.fetchEntries(project.id),
				effectiveProjectRoot
					? projectDocumentMetadataService
							.loadSnapshot({
								projectId: project.id,
								projectRootPath: effectiveProjectRoot,
							})
							.then((data) => ({ data, error: null as Error | null }))
							.catch((error) => ({
								data: null,
								error:
									error instanceof Error
										? error
										: new Error("Unable to preview ACADE support artifacts."),
							}))
					: Promise.resolve({
							data: null,
							error: null as Error | null,
						}),
			]);

			if (cancelled) {
				return;
			}

			setState({
				profile: profileResult.data,
				revisions: revisionsResult.data,
				artifacts: snapshotResult.data?.artifacts ?? null,
				scanWarnings: snapshotResult.data?.warnings ?? [],
				loading: false,
				messages: [
					...(profileResult.message ? [profileResult.message] : []),
					...(revisionsResult.error ? [revisionsResult.error.message] : []),
					...(snapshotResult.error ? [snapshotResult.error.message] : []),
				],
			});
		};

		void load();

		return () => {
			cancelled = true;
		};
	}, [project.id, project.watchdog_root_path]);

	const cards = useMemo(
		() => [
			getTrackingCard(project, telemetry),
			getDefaultsCard(state.profile, state.loading),
			getRevisionCard(state.revisions, state.loading),
		],
		[project, state.loading, state.profile, state.revisions, telemetry],
	);

	const overallState = useMemo<TrustState>(() => {
		if (cards.some((card) => card.state === "needs-attention")) {
			return "needs-attention";
		}
		if (cards.some((card) => card.state === "background")) {
			return "background";
		}
		return "ready";
	}, [cards]);

	const acadeProjectFile = useMemo(
		() => getAcadeProjectFileSummary(state.profile, state.artifacts),
		[state.artifacts, state.profile],
	);
	const acadeSupportStatus = useMemo(
		() => getAcadeSupportStatus(state.profile, state.artifacts),
		[state.artifacts, state.profile],
	);
	const effectiveProjectRoot = useMemo(
		() =>
			state.profile?.project_root_path?.trim() ||
			project.watchdog_root_path?.trim() ||
			"",
		[state.profile?.project_root_path, project.watchdog_root_path],
	);
	const canOpenAcadeProject = Boolean(effectiveProjectRoot) && !state.loading;
	const openAcadeActionLabel = isOpeningAcadeProject
		? "Opening ACADE..."
		: state.artifacts?.wdpState === "existing"
			? "Open Existing Project in ACADE"
			: "Open in ACADE";
	const setupFlowSummary =
		state.artifacts?.wdpState === "existing"
			? "Suite detected an existing ACADE project definition. Launch it in ACADE, then verify the live drawings and title blocks before package work."
			: "Create the support files first, then launch ACADE to activate the project before you verify the live drawings.";
	const visibleNotices = useMemo(
		() =>
			[...state.messages, ...state.scanWarnings].filter(
				(message) => !isLowSignalSetupWarning(message),
			),
		[state.messages, state.scanWarnings],
	);

	const openAcadeProject = async () => {
		if (!effectiveProjectRoot) {
			showToast(
				"warning",
				"Set the project root first so Suite knows where to open the ACADE project.",
			);
			return;
		}
		if (!state.profile) {
			showToast("warning", "Project setup is still loading.");
			return;
		}

		setIsOpeningAcadeProject(true);
		try {
			const result = await openProjectSetupFromStoredProfile({
				projectId: project.id,
				projectName: project.name,
				projectRootPath: effectiveProjectRoot,
				profile: state.profile,
				revisionEntries: state.revisions,
			});

			if (!result.success || !result.data) {
				throw new Error(
					buildTitleBlockSyncFailureMessage(
						result,
						"Unable to open the ACADE project.",
					),
				);
			}

			setState((current) => ({
				...current,
				artifacts: result.data?.artifacts ?? current.artifacts,
			}));
			showToast(
				"success",
				result.message || "ACADE opened and project activated.",
			);
		} catch (error) {
			showToast(
				"error",
				error instanceof Error
					? error.message
					: "Unable to open the ACADE project.",
			);
		} finally {
			setIsOpeningAcadeProject(false);
		}
	};

	return {
		state,
		cards,
		overallState,
		acadeProjectFile,
		acadeSupportStatus,
		canOpenAcadeProject,
		isOpeningAcadeProject,
		openAcadeActionLabel,
		setupFlowSummary,
		visibleNotices,
		openAcadeProject,
	};
}
