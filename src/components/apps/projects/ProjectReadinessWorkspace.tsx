import {
	ClipboardCheck,
	FileCheck2,
	FolderTree,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Panel } from "@/components/primitives/Panel";
import {
	buildProjectDetailHref,
	buildProjectIssueSetAppHref,
} from "@/lib/projectWorkflowNavigation";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import { cn } from "@/lib/utils";
import styles from "./ProjectReadinessWorkspace.module.css";
import { ProjectReviewInboxList } from "./ProjectReviewInboxList";
import type { Project, ViewMode } from "./projectmanagertypes";
import {
	type ProjectReviewInboxData,
	useProjectReviewInboxData,
} from "./useProjectReviewInboxData";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

interface ProjectReadinessWorkspaceProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onOpenViewMode: (mode: ViewMode) => void;
}

interface ReadinessCard {
	id: string;
	title: string;
	state: TrustState;
	summary: string;
	detail: string;
}

function buildReadinessCards(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	inbox: ProjectReviewInboxData;
}): ReadinessCard[] {
	const { project, telemetry, inbox } = args;
	const projectRoot = project.watchdog_root_path?.trim() || "";
	const scan = inbox.scan;
	const { metrics } = inbox;

	return [
		{
			id: "drawing-scan",
			title: "Drawing scan",
			state: !projectRoot
				? "needs-attention"
				: inbox.loading
					? "background"
					: scan && scan.summary.drawingFiles > 0
						? "ready"
						: "needs-attention",
			summary: !projectRoot
				? "No project root configured"
				: inbox.loading
					? "Loading drawing scan..."
					: scan
						? `${scan.summary.drawingFiles} drawing${
								scan.summary.drawingFiles === 1 ? "" : "s"
							} found`
						: "Scan unavailable",
			detail: !projectRoot
				? "Set the project root before running drawing control workflows."
				: scan
					? `${scan.summary.totalFiles} file${
							scan.summary.totalFiles === 1 ? "" : "s"
						} were inspected for metadata and title block signals.`
					: "Drawing scan data is not available yet.",
		},
		{
			id: "review-inbox",
			title: "Review inbox",
			state:
				metrics.openCount > 0
					? metrics.highPriorityCount > 0
						? "needs-attention"
						: "background"
					: inbox.loading
						? "background"
						: "ready",
			summary:
				metrics.openCount > 0
					? `${metrics.openCount} item${
							metrics.openCount === 1 ? "" : "s"
						} need review`
					: "No open review items",
			detail:
				metrics.titleBlockAttentionCount > 0
					? `${metrics.titleBlockAttentionCount} drawing${
							metrics.titleBlockAttentionCount === 1 ? "" : "s"
						} still need title block review.`
					: metrics.standardsAttentionCount > 0
						? `${metrics.standardsAttentionCount} standards check${
								metrics.standardsAttentionCount === 1 ? "" : "s"
							} still need follow-up.`
						: metrics.revisionAttentionCount > 0
							? `${metrics.revisionAttentionCount} revision item${
									metrics.revisionAttentionCount === 1 ? "" : "s"
								} remain open.`
							: "Project setup, title block review, standards follow-up, and revision tracking are currently calm.",
		},
		{
			id: "delivery-path",
			title: "Package path",
			state:
				metrics.openCount > 0 || !projectRoot
					? "needs-attention"
					: inbox.loading
						? "background"
						: "ready",
			summary:
				metrics.openCount > 0 || !projectRoot
					? "Resolve blockers before issue"
					: "Ready for standards and transmittal prep",
			detail:
				telemetry.trackedDrawings.length > 0
					? `${telemetry.trackedDrawings.length} tracked drawing${
							telemetry.trackedDrawings.length === 1 ? "" : "s"
						} already have Watchdog history tied to this project.`
					: "After review items are clear, move into standards and package assembly from the linked tools below.",
		},
	];
}

function getOverallState(cards: ReadinessCard[]): TrustState {
	if (cards.some((card) => card.state === "needs-attention")) {
		return "needs-attention";
	}
	if (cards.some((card) => card.state === "background")) {
		return "background";
	}
	return "ready";
}

export function ProjectReadinessWorkspace({
	project,
	telemetry,
	preferredIssueSetId,
	onOpenViewMode,
}: ProjectReadinessWorkspaceProps) {
	const inbox = useProjectReviewInboxData(
		project,
		telemetry,
		preferredIssueSetId,
	);
	const cards = buildReadinessCards({
		project,
		telemetry,
		inbox,
	});
	const overallState = getOverallState(cards);
	const drawingsScanned = inbox.scan?.summary.drawingFiles ?? 0;
	const previewItems = inbox.items.slice(0, 5);
	const currentIssueSetId = inbox.currentIssueSet?.id ?? null;
	const setupHref = buildProjectDetailHref(project.id, "setup");
	const drawingListHref = buildProjectIssueSetAppHref(
		"/app/apps/drawing-list-manager",
		project.id,
		currentIssueSetId,
	);
	const watchdogHref = buildWatchdogHref(project.id, currentIssueSetId);
	const standardsHref = buildProjectIssueSetAppHref(
		"/app/apps/standards-checker",
		project.id,
		currentIssueSetId,
	);
	const transmittalHref = buildProjectIssueSetAppHref(
		"/app/apps/transmittal-builder",
		project.id,
		currentIssueSetId,
	);

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Issue readiness</p>
					<h4 className={styles.title}>Project readiness</h4>
					<p className={styles.description}>
						See whether the project is actually ready for review and package
						work, then act on the blockers from one shared inbox.
					</p>
				</div>
				<TrustStateBadge state={overallState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryMain}>
					<div className={styles.summaryHeader}>
						<div className={styles.summaryIconShell}>
							<ClipboardCheck className={styles.summaryIcon} />
						</div>
						<div>
							<h5 className={styles.summaryTitle}>Next action</h5>
					<p className={styles.summaryText}>{inbox.nextAction}</p>
						</div>
					</div>
					<div className={styles.metricRow}>
						<div className={styles.summaryFact}>
							<span className={styles.metricLabel}>Drawings scanned</span>
							<strong className={styles.metricValue}>{drawingsScanned}</strong>
						</div>
						<div className={styles.summaryFact}>
							<span className={styles.metricLabel}>Inbox items</span>
							<strong className={styles.metricValue}>
								{inbox.metrics.openCount}
							</strong>
						</div>
					</div>
				</div>
				<div className={styles.summaryActions}>
					<Link to={drawingListHref} className={styles.primaryLink}>
						<FileCheck2 className={styles.linkIcon} />
						<span>Open title block review</span>
					</Link>
					<div className={styles.actionRow}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("review")}
						>
							<ClipboardCheck className={styles.linkIcon} />
							<span>Open review inbox</span>
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("issue-sets")}
						>
							<ClipboardCheck className={styles.linkIcon} />
							<span>Issue Set Manager</span>
						</button>
					</div>
					<div className={styles.utilityLinks}>
						<Link to={standardsHref} className={styles.utilityLink}>
							<ShieldCheck className={styles.linkIcon} />
							<span>Standards Checker</span>
						</Link>
						<Link to={transmittalHref} className={styles.utilityLink}>
							<Workflow className={styles.linkIcon} />
							<span>Transmittal Builder</span>
						</Link>
					</div>
				</div>
			</Panel>

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

			<Panel variant="support" padding="lg" className={styles.inboxPanel}>
				<div className={styles.inboxHeader}>
					<div>
						<h5 className={styles.inboxTitle}>Shared review inbox</h5>
						<p className={styles.inboxCopy}>
							Setup blockers, title block review follow-up, standards drift, and
							revision-review work land here first.
						</p>
					</div>
				</div>

				<ProjectReviewInboxList
					items={previewItems}
					onOpenViewMode={onOpenViewMode}
					emptyText="No project review items are open right now."
				/>

				{inbox.items.length > previewItems.length ? (
					<div className={styles.previewFooter}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("review")}
						>
							Open full inbox
						</button>
					</div>
				) : null}
			</Panel>

			{inbox.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{inbox.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}

			<Panel variant="support" padding="lg" className={styles.supportPanel}>
				<div className={styles.supportPanelHeader}>
					<div>
						<p className={styles.supportPanelEyebrow}>Support details</p>
						<h5 className={styles.supportPanelTitle}>Setup and support</h5>
						<p className={styles.supportPanelCopy}>
						Keep the project root, title block defaults, shared mapping
						rules, and file records aligned so review and package work do not
						drift.
					</p>
				</div>
			</div>
			<div className={styles.supportPanelGrid}>
				<div className={styles.supportCard}>
					<div className={styles.supportCardCopy}>
						<p className={styles.supportCardEyebrow}>Setup checklist</p>
						<h6 className={styles.supportCardTitle}>Project setup</h6>
						<p className={styles.supportCardDescription}>
							Use the dedicated Setup lane to confirm the tracked root, title
							block defaults, and revision groundwork before title block review
							and package issue work.
						</p>
					</div>
					<div className={styles.supportCardActions}>
						<Link to={setupHref} className={styles.utilityLink}>
							<FolderTree className={styles.linkIcon} />
							<span>Open Setup</span>
						</Link>
					</div>
				</div>
				<div className={styles.supportCard}>
					<div className={styles.supportCardCopy}>
						<p className={styles.supportCardEyebrow}>Files and journals</p>
						<h6 className={styles.supportCardTitle}>Files & telemetry</h6>
						<p className={styles.supportCardDescription}>
							Open the detailed file archive, mapping rules, drawing journals,
							and recent CAD sessions from one support lane instead of keeping
							telemetry embedded in readiness.
						</p>
					</div>
					<div className={styles.supportCardActions}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("files")}
						>
							Open files & telemetry
						</button>
						<Link to={watchdogHref} className={styles.utilityLink}>
							<Workflow className={styles.linkIcon} />
							<span>Open Watchdog</span>
						</Link>
					</div>
				</div>
			</div>
		</Panel>
	</section>
	);
}
