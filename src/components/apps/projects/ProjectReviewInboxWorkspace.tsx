import { ClipboardList, FileCheck2, ShieldCheck, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { buildProjectIssueSetAppHref } from "@/lib/projectWorkflowNavigation";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import { ProjectReviewInboxList } from "./ProjectReviewInboxList";
import styles from "./ProjectReviewInboxWorkspace.module.css";
import type { Project, ViewMode } from "./projectmanagertypes";
import {
	type ProjectReviewInboxItem,
	type ProjectReviewInboxItemType,
	type ProjectReviewInboxQuickAction,
	useProjectReviewInboxData,
} from "./useProjectReviewInboxData";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

type ReviewInboxFilter = "all" | "high-priority" | ProjectReviewInboxItemType;

const FILTER_OPTIONS: Array<{
	id: ReviewInboxFilter;
	label: string;
}> = [
	{ id: "all", label: "All" },
	{ id: "high-priority", label: "High priority" },
	{ id: "setup", label: "Setup" },
	{ id: "title-block", label: "Title block review" },
	{ id: "standards", label: "Standards" },
	{ id: "revision", label: "Revisions" },
	{ id: "issue-set", label: "Issue sets" },
];

interface ProjectReviewInboxWorkspaceProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onOpenViewMode: (mode: ViewMode) => void;
}

interface ReviewLaneSummary {
	id: string;
	label: string;
	count: number;
	state: TrustState;
	detail: string;
}

export function ProjectReviewInboxWorkspace({
	project,
	telemetry,
	preferredIssueSetId,
	onOpenViewMode,
}: ProjectReviewInboxWorkspaceProps) {
	const { showToast } = useToast();
	const [filter, setFilter] = useState<ReviewInboxFilter>("all");
	const [pendingActionId, setPendingActionId] = useState<string | null>(null);
	const reviewInbox = useProjectReviewInboxData(
		project,
		telemetry,
		preferredIssueSetId,
	);

	const filteredItems = useMemo(() => {
		if (filter === "all") {
			return reviewInbox.items;
		}
		if (filter === "high-priority") {
			return reviewInbox.items.filter((item) => item.priority === "high");
		}
		return reviewInbox.items.filter((item) => item.type === filter);
	}, [filter, reviewInbox.items]);

	const linkedReceiptCount = useMemo(() => {
		const receiptNumbers = new Set(
			reviewInbox.transmittalReceipts
				.map((receipt) => receipt.transmittalNumber?.trim().toUpperCase() || "")
				.filter(Boolean),
		);
		return reviewInbox.issueSets.filter((issueSet) => {
			const number = issueSet.transmittalNumber?.trim().toUpperCase() || "";
			return Boolean(number && receiptNumbers.has(number));
		}).length;
	}, [reviewInbox.issueSets, reviewInbox.transmittalReceipts]);

	const scannedDrawingCount = reviewInbox.scan?.summary.drawingFiles ?? 0;
	const currentPackageLabel =
		reviewInbox.currentIssueSet?.issueTag ?? "this package";
	const packageFollowUpCount =
		reviewInbox.metrics.titleBlockAttentionCount +
		reviewInbox.metrics.standardsAttentionCount +
		reviewInbox.metrics.issueSetAttentionCount;
	const summaryNote =
		reviewInbox.issueSets.length === 0
			? "No issue sets are saved yet. Clear the inbox, then capture the first package snapshot."
			: `${reviewInbox.issueSets.length} issue set${
					reviewInbox.issueSets.length === 1 ? "" : "s"
				} saved, with ${linkedReceiptCount} linked receipt${
					linkedReceiptCount === 1 ? "" : "s"
				}. ${scannedDrawingCount} scanned drawing${
					scannedDrawingCount === 1 ? "" : "s"
				} and ${telemetry.trackedDrawings.length} tracked drawing${
					telemetry.trackedDrawings.length === 1 ? "" : "s"
				} are feeding this review scope.${
					reviewInbox.metrics.acceptedTitleBlockCount > 0
						? ` ${reviewInbox.metrics.acceptedTitleBlockCount} title block row${
								reviewInbox.metrics.acceptedTitleBlockCount === 1 ? "" : "s"
						  } already have package acceptance recorded for ${currentPackageLabel}.`
						: ""
				}${
					reviewInbox.metrics.waivedStandardsCount > 0
						? ` ${reviewInbox.metrics.waivedStandardsCount} standards item${
								reviewInbox.metrics.waivedStandardsCount === 1 ? "" : "s"
						  } already have package waivers recorded.`
						: ""
				}`;
	const currentIssueSetId = reviewInbox.currentIssueSet?.id ?? null;
	const drawingListHref = buildProjectIssueSetAppHref(
		"/app/apps/drawing-list-manager",
		project.id,
		currentIssueSetId,
	);
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
	const reviewLanes = useMemo<ReviewLaneSummary[]>(
		() => [
			{
				id: "setup",
				label: "Setup blockers",
				count: reviewInbox.metrics.setupAttentionCount,
				state:
					reviewInbox.metrics.setupAttentionCount > 0
						? "needs-attention"
						: "ready",
				detail:
					reviewInbox.metrics.setupAttentionCount > 0
						? "Root path or shared setup still needs attention."
						: "Project setup is ready for this package.",
			},
			{
				id: "title-block",
				label: "Title block review",
				count: reviewInbox.metrics.titleBlockAttentionCount,
				state:
					reviewInbox.metrics.titleBlockAttentionCount > 0
						? "needs-attention"
						: "ready",
				detail:
					reviewInbox.metrics.titleBlockAttentionCount > 0
						? "Title block rows still need package review before issue."
						: reviewInbox.metrics.acceptedTitleBlockCount > 0
							? `${reviewInbox.metrics.acceptedTitleBlockCount} row${
									reviewInbox.metrics.acceptedTitleBlockCount === 1 ? "" : "s"
							  } already accepted for ${currentPackageLabel}.`
							: "Title block rows are clear for this package window.",
			},
			{
				id: "standards",
				label: "Standards",
				count: reviewInbox.metrics.standardsAttentionCount,
				state:
					reviewInbox.metrics.standardsAttentionCount > 0
						? "needs-attention"
						: "ready",
				detail:
					reviewInbox.metrics.standardsAttentionCount > 0
						? "Standards follow-up still needs a decision."
						: "Standards follow-up is clear right now.",
			},
			{
				id: "revisions",
				label: "Revisions",
				count: reviewInbox.metrics.revisionAttentionCount,
				state:
					reviewInbox.metrics.revisionAttentionCount > 0
						? "needs-attention"
						: "ready",
				detail:
					reviewInbox.metrics.revisionAttentionCount > 0
						? "Revision register work is still open."
						: "Revision follow-up is clear right now.",
			},
			{
				id: "issue-set",
				label: "Issue sets",
				count: reviewInbox.metrics.issueSetAttentionCount,
				state:
					reviewInbox.metrics.issueSetAttentionCount > 0
						? "background"
						: "ready",
				detail:
					reviewInbox.metrics.issueSetAttentionCount > 0
						? "Package history still needs follow-up."
						: "Saved issue sets are aligned with the current package.",
			},
		],
		[currentPackageLabel, reviewInbox.metrics],
	);

	const handleQuickAction = async (
		item: ProjectReviewInboxItem,
		action: ProjectReviewInboxQuickAction,
	) => {
		setPendingActionId(action.id);
		try {
			if (action.kind === "decision") {
				if (item.type !== "title-block" && item.type !== "standards") {
					showToast(
						"warning",
						"This review item cannot be decided inline yet.",
					);
					return;
				}
				const result = await projectReviewDecisionService.saveDecision({
					projectId: project.id,
					issueSetId: item.issueSetId ?? currentIssueSetId,
					itemId: item.id,
					itemType: item.type,
					fingerprint: item.fingerprint,
					status: action.decisionStatus ?? "accepted",
				});
				if (!result.data) {
					showToast(
						"error",
						result.error?.message || "Unable to save the review decision.",
					);
					return;
				}
				showToast(
					"success",
					action.decisionStatus === "waived"
						? "Standards follow-up waived for this package snapshot."
						: "Title block item accepted for this package snapshot.",
				);
				reviewInbox.refresh();
				return;
			}

			if (action.kind === "revision-status") {
				const updated = await projectRevisionRegisterService.updateEntry(
					item.entityId,
					{
						issueStatus: action.revisionStatus ?? "resolved",
					},
				);
				if (!updated) {
					showToast("error", "Unable to update the revision item.");
					return;
				}
				showToast("success", "Revision item marked resolved.");
				reviewInbox.refresh();
			}
		} finally {
			setPendingActionId(null);
		}
	};

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Review</p>
					<h4 className={styles.title}>Review inbox</h4>
					<p className={styles.description}>
						Setup blockers, title block drift, standards follow-up, revision
						items, and package work all land here before issue.
					</p>
				</div>
				<TrustStateBadge state={reviewInbox.overallState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryTop}>
					<div className={styles.summaryMain}>
						<div className={styles.summaryHeader}>
							<div className={styles.summaryIconShell}>
								<ClipboardList className={styles.summaryIcon} />
							</div>
							<div>
								<h5 className={styles.summaryTitle}>Next action</h5>
								<p className={styles.summaryText}>{reviewInbox.nextAction}</p>
							</div>
						</div>
						<div className={styles.metricRow}>
							<div className={styles.summaryFact}>
								<span className={styles.metricLabel}>Open items</span>
								<strong className={styles.metricValue}>
									{reviewInbox.metrics.openCount}
								</strong>
							</div>
							<div className={styles.summaryFact}>
								<span className={styles.metricLabel}>Needs decision</span>
								<strong className={styles.metricValue}>
									{packageFollowUpCount}
								</strong>
							</div>
						</div>
						<p className={styles.summaryNote}>{summaryNote}</p>
						<div className={styles.laneStrip}>
							{reviewLanes.map((lane) => (
								<div
									key={lane.id}
									className={`${styles.laneCard} ${
										lane.state === "needs-attention"
											? styles.laneCardNeedsAttention
											: lane.state === "background"
												? styles.laneCardBackground
												: styles.laneCardReady
									}`}
								>
									<div className={styles.laneHeader}>
										<span className={styles.laneLabel}>{lane.label}</span>
										<Badge
											color={
												lane.state === "needs-attention"
													? "warning"
													: lane.state === "background"
														? "accent"
														: "success"
											}
											variant="soft"
										>
											{lane.count > 0 ? lane.count : "Clear"}
										</Badge>
									</div>
									<p className={styles.laneDetail}>{lane.detail}</p>
								</div>
							))}
						</div>
					</div>
					<div className={styles.summaryActions}>
						<Button
							variant="primary"
							size="md"
							iconRight={<FileCheck2 size={16} />}
							onClick={() => onOpenViewMode("issue-sets")}
						>
							Open issue sets
						</Button>
						<div className={styles.utilityLinks}>
							<Link to={drawingListHref} className={styles.utilityLink}>
								<FileCheck2 className={styles.linkIcon} />
								<span>Title block review</span>
							</Link>
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
				</div>

				<div className={styles.workflowDivider} />

				<div className={styles.inboxHeader}>
					<div>
						<h5 className={styles.inboxTitle}>Open items</h5>
						<p className={styles.inboxCopy}>
							Filter the queue by source so review work is clear instead of
							scattered between tools.
						</p>
					</div>
				</div>

				<div className={styles.filterRow}>
					{FILTER_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							className={
								filter === option.id
									? `${styles.filterChip} ${styles.filterChipActive}`
									: styles.filterChip
							}
							onClick={() => setFilter(option.id)}
						>
							{option.label}
						</button>
					))}
				</div>

				<ProjectReviewInboxList
					items={filteredItems}
					onOpenViewMode={onOpenViewMode}
					emptyText="No review items match this filter right now."
					onRunQuickAction={handleQuickAction}
					pendingActionId={pendingActionId}
				/>
			</Panel>

			{reviewInbox.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{reviewInbox.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}
