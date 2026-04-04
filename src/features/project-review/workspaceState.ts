import { useEffect, useMemo, useState } from "react";
import type { TrustState } from "@/components/system/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import type { Project } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";
import { buildProjectIssueSetAppHref, buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import { projectWorkflowSharedStateService } from "@/features/project-workflow/sharedStateService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import {
	type ProjectReviewInboxData,
	type ProjectReviewInboxItem,
	type ProjectReviewInboxItemType,
	type ProjectReviewInboxQuickAction,
	useProjectReviewInboxData,
} from "./useProjectReviewInboxData";

export type ReviewInboxFilter =
	| "all"
	| "high-priority"
	| ProjectReviewInboxItemType;

export const REVIEW_INBOX_FILTER_OPTIONS: Array<{
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

export interface ReviewLaneSummary {
	id: string;
	label: string;
	count: number;
	state: TrustState;
	detail: string;
}

export interface ProjectReadinessCard {
	id: string;
	title: string;
	state: TrustState;
	summary: string;
	detail: string;
}

function useSynchronizedIssueSetContext(args: {
	loading: boolean;
	currentIssueSetId?: string | null;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
}) {
	const {
		loading,
		currentIssueSetId,
		preferredIssueSetId,
		onIssueSetContextChange,
	} = args;

	useEffect(() => {
		if (!onIssueSetContextChange || loading) {
			return;
		}
		const resolvedIssueSetId = currentIssueSetId ?? null;
		const preferred = preferredIssueSetId ?? null;
		if (resolvedIssueSetId === preferred) {
			return;
		}
		if (!resolvedIssueSetId) {
			if (!preferred) {
				return;
			}
			onIssueSetContextChange(null);
			return;
		}
		onIssueSetContextChange(resolvedIssueSetId);
	}, [currentIssueSetId, loading, onIssueSetContextChange, preferredIssueSetId]);
}

function buildReadinessCards(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	inbox: ProjectReviewInboxData;
}): ProjectReadinessCard[] {
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
					? `${metrics.openCount} item${metrics.openCount === 1 ? "" : "s"} need review`
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
							: "Setup, title blocks, standards, and revisions are clear.",
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

function getOverallState(cards: ProjectReadinessCard[]): TrustState {
	if (cards.some((card) => card.state === "needs-attention")) {
		return "needs-attention";
	}
	if (cards.some((card) => card.state === "background")) {
		return "background";
	}
	return "ready";
}

export function useProjectReadinessWorkspaceState(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
}) {
	const { project, telemetry, preferredIssueSetId, onIssueSetContextChange } = args;
	const inbox = useProjectReviewInboxData(project, telemetry, preferredIssueSetId);

	useSynchronizedIssueSetContext({
		loading: inbox.loading,
		currentIssueSetId: inbox.currentIssueSet?.id ?? null,
		preferredIssueSetId,
		onIssueSetContextChange,
	});

	const cards = buildReadinessCards({ project, telemetry, inbox });
	const overallState = getOverallState(cards);
	const drawingsScanned = inbox.scan?.summary.drawingFiles ?? 0;
	const previewItems = inbox.items.slice(0, 5);
	const currentIssueSetId = inbox.currentIssueSet?.id ?? null;

	return {
		inbox,
		cards,
		overallState,
		drawingsScanned,
		previewItems,
		setupHref: buildProjectDetailHref(project.id, "setup"),
		drawingListHref: buildProjectIssueSetAppHref(
			"/app/draft/drawing-list-manager",
			project.id,
			currentIssueSetId,
		),
		watchdogHref: buildWatchdogHref(project.id, currentIssueSetId),
		standardsHref: buildProjectIssueSetAppHref(
			"/app/review/standards-checker",
			project.id,
			currentIssueSetId,
		),
		transmittalHref: buildProjectIssueSetAppHref(
			"/app/projects/transmittal-builder",
			project.id,
			currentIssueSetId,
		),
	};
}

export function useProjectReviewWorkspaceState(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
}) {
	const { project, telemetry, preferredIssueSetId, onIssueSetContextChange } = args;
	const { showToast } = useToast();
	const [filter, setFilter] = useState<ReviewInboxFilter>("all");
	const [pendingActionId, setPendingActionId] = useState<string | null>(null);
	const reviewInbox = useProjectReviewInboxData(project, telemetry, preferredIssueSetId);

	useSynchronizedIssueSetContext({
		loading: reviewInbox.loading,
		currentIssueSetId: reviewInbox.currentIssueSet?.id ?? null,
		preferredIssueSetId,
		onIssueSetContextChange,
	});

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
	const currentPackageLabel = reviewInbox.currentIssueSet?.issueTag ?? "this package";
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
				projectWorkflowSharedStateService.clear(project.id);
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

	return {
		filter,
		setFilter,
		pendingActionId,
		filteredItems,
		reviewInbox,
		reviewLanes,
		packageFollowUpCount,
		summaryNote,
		drawingListHref: buildProjectIssueSetAppHref(
			"/app/draft/drawing-list-manager",
			project.id,
			currentIssueSetId,
		),
		standardsHref: buildProjectIssueSetAppHref(
			"/app/review/standards-checker",
			project.id,
			currentIssueSetId,
		),
		transmittalHref: buildProjectIssueSetAppHref(
			"/app/projects/transmittal-builder",
			project.id,
			currentIssueSetId,
		),
		handleQuickAction,
	};
}

