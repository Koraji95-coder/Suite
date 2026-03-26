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

export function ProjectSetupReadinessPanel({
	project,
	telemetry,
	compact = false,
	embedded = false,
}: ProjectSetupReadinessPanelProps) {
	const [state, setState] = useState<SetupReadinessState>(EMPTY_STATE);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const [profileResult, revisionsResult] = await Promise.all([
				projectTitleBlockProfileService.fetchProfile(project.id, {
					projectRootPath: project.watchdog_root_path,
				}),
				projectRevisionRegisterService.fetchEntries(project.id),
			]);

			if (cancelled) {
				return;
			}

			setState({
				profile: profileResult.data,
				revisions: revisionsResult.data,
				loading: false,
				messages: [
					...(profileResult.error ? [profileResult.error.message] : []),
					...(revisionsResult.error ? [revisionsResult.error.message] : []),
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
								? "Tracking roots, title block defaults, and revision history for this delivery flow."
								: "Tracking roots, title block defaults, and revision history that feed the project review and package flow."}
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

			{state.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{state.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}
