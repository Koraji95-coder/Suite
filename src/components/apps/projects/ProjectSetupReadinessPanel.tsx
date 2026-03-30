import {
	ClipboardList,
	FileCheck2,
	FolderTree,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { cn } from "@/lib/utils";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	type ProjectTitleBlockProfileRow,
	projectTitleBlockProfileService,
} from "@/services/projectTitleBlockProfileService";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import {
	type TitleBlockSyncArtifacts,
	titleBlockSyncService,
} from "@/services/titleBlockSyncService";
import styles from "./ProjectSetupReadinessPanel.module.css";
import type { Project } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

interface ProjectSetupReadinessPanelProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	compact?: boolean;
	embedded?: boolean;
}

interface SetupReadinessState {
	profile: ProjectTitleBlockProfileRow | null;
	revisions: DrawingRevisionRegisterRow[];
	artifacts: TitleBlockSyncArtifacts | null;
	scanWarnings: string[];
	loading: boolean;
	messages: string[];
}

interface SetupStatusCard {
	id: string;
	title: string;
	state: TrustState;
	summary: string;
	detail: string;
}

const EMPTY_STATE: SetupReadinessState = {
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
): SetupStatusCard {
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
): SetupStatusCard {
	const configuredDefaults = countConfiguredDefaults(profile);
	const blockName =
		profile?.block_name?.trim() || DEFAULT_PROJECT_TITLE_BLOCK_NAME;
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
): SetupStatusCard {
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
) {
	if (artifacts?.wdpPath) {
		return {
			path: artifacts.wdpPath,
			state:
				artifacts.wdpState === "existing"
					? "Existing .wdp detected. Suite will keep using it as the project file."
					: "Starter .wdp derived from the current project setup.",
		};
	}
	if (profile?.acade_project_file_path?.trim()) {
		return {
			path: profile.acade_project_file_path.trim(),
			state:
				"Configured .wdp path. Suite will write starter support files here only if the project file is missing.",
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
) {
	if (artifacts?.wdpState === "existing") {
		return {
			label: "Existing ACADE project file",
			detail:
				"Suite detected an existing .wdp and will preserve it while keeping the companion support files aligned.",
			tone: "existing" as const,
		};
	}

	if (artifacts?.wdpPath || profile?.acade_project_file_path?.trim()) {
		return {
			label: "Suite starter scaffold active",
			detail:
				"Suite is using a starter .wdp scaffold and companion .wdt/.wdl files until you replace them with a confirmed ACADE project file.",
			tone: "starter" as const,
		};
	}

	return {
		label: "ACADE scaffold not written yet",
		detail:
			"Save the project once with a valid root and Suite will create the starter .wdp/.wdt/.wdl files automatically.",
		tone: "pending" as const,
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

export function ProjectSetupReadinessPanel({
	project,
	telemetry,
	compact = false,
	embedded = false,
}: ProjectSetupReadinessPanelProps) {
	const { showToast } = useToast();
	const [state, setState] = useState<SetupReadinessState>(EMPTY_STATE);
	const [isOpeningAcadeProject, setIsOpeningAcadeProject] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const profileResult = await projectTitleBlockProfileService.fetchProfile(
				project.id,
				{
					projectRootPath: project.watchdog_root_path,
				},
			);
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
					...(profileResult.error ? [profileResult.error.message] : []),
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

	const cards = useMemo(() => {
		return [
			getTrackingCard(project, telemetry),
			getDefaultsCard(state.profile, state.loading),
			getRevisionCard(state.revisions, state.loading),
		];
	}, [project, state.loading, state.profile, state.revisions, telemetry]);

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
	const visibleNotices = useMemo(
		() =>
			[...state.messages, ...state.scanWarnings].filter(
				(message) => !isLowSignalSetupWarning(message),
			),
		[state.messages, state.scanWarnings],
	);

	const handleOpenAcadeProject = async () => {
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
			const result = await titleBlockSyncService.openProject({
				projectId: project.id,
				projectRootPath: effectiveProjectRoot,
				profile: {
					blockName:
						state.profile.block_name || DEFAULT_PROJECT_TITLE_BLOCK_NAME,
					projectRootPath: effectiveProjectRoot,
					acadeProjectFilePath: state.profile.acade_project_file_path,
					acadeLine1: state.profile.acade_line1,
					acadeLine2: state.profile.acade_line2,
					acadeLine4: state.profile.acade_line4,
					signerDrawnBy: state.profile.signer_drawn_by,
					signerCheckedBy: state.profile.signer_checked_by,
					signerEngineer: state.profile.signer_engineer,
				},
				revisionEntries: state.revisions,
				rows: [],
				selectedRelativePaths: [],
				triggerAcadeUpdate: false,
			});

			if (!result.success || !result.data) {
				throw new Error(result.message || "Unable to open the ACADE project.");
			}

			setState((current) => ({
				...current,
				artifacts: result.data?.artifacts ?? current.artifacts,
			}));
			showToast("success", result.message || "ACADE project open requested.");
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

	return (
		<section className={cn(styles.root, compact && styles.compactRoot)}>
			{embedded ? (
				<div className={styles.embeddedHeader}>
					<div className={styles.embeddedHeaderCopy}>
						<p className={styles.embeddedEyebrow}>Setup checklist</p>
						<h4 className={styles.embeddedTitle}>Project setup</h4>
					</div>
					<TrustStateBadge state={overallState} size="sm" />
				</div>
			) : (
				<div className={cn(styles.header, compact && styles.compactHeader)}>
					<div className={cn(styles.headerCopy, compact && styles.compactHeaderCopy)}>
						<p className={styles.eyebrow}>Setup details</p>
						<h4 className={styles.title}>
							{compact ? "Setup checklist" : "Project setup"}
						</h4>
						<p className={cn(styles.description, compact && styles.compactDescription)}>
							{compact
								? "Tracking roots, title block defaults, and revision history for this project workflow."
								: "Tracking roots, title block defaults, and revision history that feed review and package work."}
						</p>
					</div>
					<TrustStateBadge state={overallState} />
				</div>
			)}

			<div className={styles.cardGrid}>
				{cards.map((card) => (
					<article
						key={card.id}
						className={cn(
							styles.statusRow,
							card.state === "ready" && styles.statusRowReady,
							card.state === "needs-attention" && styles.statusRowNeedsAttention,
							card.state === "background" && styles.statusRowBackground,
						)}
					>
						<div className={styles.cardIconShell}>
							{card.id === "tracking" ? (
								<FolderTree className={styles.cardIcon} aria-hidden="true" />
							) : card.id === "defaults" ? (
								<ClipboardList className={styles.cardIcon} aria-hidden="true" />
							) : (
								<FileCheck2 className={styles.cardIcon} aria-hidden="true" />
							)}
						</div>
						<div className={styles.statusCopy}>
							<p className={styles.cardEyebrow}>{card.title}</p>
							<h5 className={styles.cardTitle}>{card.summary}</h5>
							<p className={styles.cardDetail}>{card.detail}</p>
						</div>
						<div className={styles.statusAside}>
							<TrustStateBadge state={card.state} size="sm" />
						</div>
					</article>
				))}
			</div>

			<div className={styles.supportPanel}>
				<div className={styles.supportHeader}>
					<div className={styles.supportHeaderCopy}>
						<p className={styles.supportEyebrow}>ACADE setup</p>
						<h5 className={styles.supportTitle}>ACADE project setup</h5>
						<p className={styles.supportDescription}>
							Suite uses the project root and project defaults to derive the
							ACADE support files. Drawing titles stay drawing-specific and
							come from the title block scan or workbook rows.
						</p>
					</div>
				</div>

				<div className={styles.supportGrid}>
					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Defaults and mapping</p>
							<p className={styles.supportCardCopy}>
								Project defaults that feed the support files.
							</p>
						</div>
						<dl className={styles.definitionList}>
							<div>
								<dt>Block name</dt>
								<dd>
									{state.profile?.block_name || DEFAULT_PROJECT_TITLE_BLOCK_NAME}
								</dd>
							</div>
							<div>
								<dt>Client / Utility</dt>
								<dd>{state.profile?.acade_line1 || "Not set"}</dd>
							</div>
							<div>
								<dt>Facility / Site</dt>
								<dd>{state.profile?.acade_line2 || "Not set"}</dd>
							</div>
							<div>
								<dt>Project number</dt>
								<dd>{state.profile?.acade_line4 || "Not set"}</dd>
							</div>
							<div>
								<dt>Drawing title</dt>
								<dd>Comes from each drawing row and TITLE3 / DWGDESC.</dd>
							</div>
						</dl>
					</div>

					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Support files</p>
							<p className={styles.supportCardCopy}>
								Current project file and companion files.
							</p>
						</div>
						<div
							className={cn(
								styles.artifactStatus,
								acadeSupportStatus.tone === "existing" &&
									styles.artifactStatusExisting,
								acadeSupportStatus.tone === "starter" &&
									styles.artifactStatusStarter,
								acadeSupportStatus.tone === "pending" &&
									styles.artifactStatusPending,
							)}
						>
							<strong>{acadeSupportStatus.label}</strong>
							<p>{acadeSupportStatus.detail}</p>
						</div>
						<dl className={styles.definitionList}>
							<div>
								<dt>.wdp</dt>
								<dd>{acadeProjectFile.path}</dd>
							</div>
							<div>
								<dt>.wdt</dt>
								<dd>{state.artifacts?.wdtPath || "Will derive from the .wdp stem."}</dd>
							</div>
							<div>
								<dt>.wdl</dt>
								<dd>{state.artifacts?.wdlPath || "Will derive from the .wdp stem."}</dd>
							</div>
						</dl>
						<p className={styles.supportDetail}>{acadeProjectFile.state}</p>
						<div className={styles.supportActions}>
							<button
								type="button"
								className={styles.supportActionButton}
								onClick={() => void handleOpenAcadeProject()}
								disabled={!canOpenAcadeProject || isOpeningAcadeProject}
							>
								{isOpeningAcadeProject
									? "Opening ACADE..."
									: "Open in ACADE"}
							</button>
						</div>
						<ul className={styles.artifactGuide}>
							<li>
								<strong>.wdp</strong> keeps the AutoCAD Electrical project
								scaffold and drawing list.
							</li>
							<li>
								<strong>.wdt</strong> maps title block attribute tags.
							</li>
							<li>
								<strong>.wdl</strong> stores the line labels ACADE uses for
								project defaults.
							</li>
						</ul>
					</div>

					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Setup flow</p>
							<p className={styles.supportCardCopy}>
								Recommended order before issue sets and transmittals.
							</p>
						</div>
						<p className={styles.supportDetail}>
							Create the support files first, then verify the live drawings
							before you build the package.
						</p>
						<ul className={styles.artifactGuide}>
							<li>Set the DWG root, PDF package root, and signer defaults first.</li>
							<li>
								Review the derived <strong>.wdp</strong>, <strong>.wdt</strong>,
								and <strong>.wdl</strong> before you rely on ACADE report
								checks.
							</li>
							<li>Run title block scan to capture the live drawing truth.</li>
							<li>
								Import an ACADE report only as verification, then clear the
								review lane before issue sets and transmittals.
							</li>
						</ul>
					</div>
				</div>
			</div>

			{visibleNotices.length > 0 ? (
				<div className={styles.noticeList}>
					{visibleNotices.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}
