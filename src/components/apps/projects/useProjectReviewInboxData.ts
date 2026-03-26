import { useEffect, useMemo, useState } from "react";
import type { DrawingAnnotation } from "@/components/apps/standards-checker/standardsDrawingModels";
import { type TrustState } from "@/components/apps/ui/TrustStateBadge";
import {
	buildProjectIssueSetAppHref,
	buildProjectScopedAppHref,
} from "@/lib/projectWorkflowNavigation";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import { fetchProjectStandardsEvidence } from "@/services/projectDeliveryEvidenceService";
import {
	type ProjectDocumentMetadataRow,
	type ProjectDocumentMetadataSnapshot,
	projectDocumentMetadataService,
} from "@/services/projectDocumentMetadataService";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import {
	type ProjectReviewDecisionItemType,
	type ProjectReviewDecisionRecord,
	type ProjectReviewDecisionStatus,
	projectReviewDecisionService,
} from "@/services/projectReviewDecisionService";
import {
	type DrawingRevisionIssueStatus,
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import {
	type ProjectTransmittalReceiptRecord,
	projectTransmittalReceiptService,
} from "@/services/projectTransmittalReceiptService";
import type { Project, ViewMode } from "./projectmanagertypes";
import {
	buildStandardsReviewDescriptor,
	buildTitleBlockReviewDescriptor,
} from "./projectReviewDescriptors";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

export type ProjectReviewInboxItemType =
	| "setup"
	| "title-block"
	| "revision"
	| "standards"
	| "issue-set";

export type ProjectReviewInboxPriority = "high" | "medium" | "low";

export interface ProjectReviewInboxQuickAction {
	id: string;
	label: string;
	kind: "decision" | "revision-status";
	tone: "accent" | "warning" | "success";
	decisionStatus?: ProjectReviewDecisionStatus;
	revisionStatus?: DrawingRevisionIssueStatus;
}

export interface ProjectReviewInboxItem {
	id: string;
	type: ProjectReviewInboxItemType;
	priority: ProjectReviewInboxPriority;
	title: string;
	summary: string;
	detail: string;
	actionType: "link" | "view";
	actionLabel: string;
	actionTarget: string | ViewMode;
	issueSetId?: string | null;
	issueSetLabel?: string | null;
	entityId: string;
	fingerprint: string;
	quickActions: ProjectReviewInboxQuickAction[];
}

interface ProjectReviewInboxState {
	loading: boolean;
	scan: ProjectDocumentMetadataSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	standardsChecks: DrawingAnnotation[];
	issueSets: ProjectIssueSetRecord[];
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
	decisions: ProjectReviewDecisionRecord[];
	messages: string[];
}

export interface ProjectReviewInboxMetrics {
	openCount: number;
	highPriorityCount: number;
	setupAttentionCount: number;
	titleBlockAttentionCount: number;
	acceptedTitleBlockCount: number;
	revisionAttentionCount: number;
	standardsAttentionCount: number;
	waivedStandardsCount: number;
	issueSetAttentionCount: number;
}

export interface ProjectReviewInboxData {
	loading: boolean;
	scan: ProjectDocumentMetadataSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	standardsChecks: DrawingAnnotation[];
	issueSets: ProjectIssueSetRecord[];
	currentIssueSet: ProjectIssueSetRecord | null;
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
	messages: string[];
	items: ProjectReviewInboxItem[];
	metrics: ProjectReviewInboxMetrics;
	nextAction: string;
	overallState: TrustState;
	handledCount: number;
	refresh: () => void;
}

const EMPTY_STATE: ProjectReviewInboxState = {
	loading: true,
	scan: null,
	revisions: [],
	standardsChecks: [],
	issueSets: [],
	transmittalReceipts: [],
	decisions: [],
	messages: [],
};

function priorityRank(priority: ProjectReviewInboxPriority) {
	switch (priority) {
		case "high":
			return 0;
		case "medium":
			return 1;
		default:
			return 2;
	}
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function findMatchedTransmittalReceipt(
	issueSet: ProjectIssueSetRecord,
	receipts: ProjectTransmittalReceiptRecord[],
) {
	const normalizedTransmittalNumber = normalizeText(
		issueSet.transmittalNumber,
	).toUpperCase();
	const normalizedDocumentName = normalizeText(
		issueSet.transmittalDocumentName,
	).toUpperCase();

	return (
		receipts.find((receipt) => {
			if (
				normalizedTransmittalNumber &&
				normalizeText(receipt.transmittalNumber).toUpperCase() ===
					normalizedTransmittalNumber
			) {
				return true;
			}
			if (
				normalizedDocumentName &&
				normalizeText(receipt.description).toUpperCase() ===
					normalizedDocumentName
			) {
				return true;
			}
			return false;
		}) ?? null
	);
}

function getSetupItems(
	project: Project,
	telemetry: ProjectWatchdogTelemetry,
	scan: ProjectDocumentMetadataSnapshot | null,
): ProjectReviewInboxItem[] {
	const items: ProjectReviewInboxItem[] = [];
	const projectRoot = project.watchdog_root_path?.trim() || "";
	if (!projectRoot) {
		items.push({
			id: "setup:root",
			type: "setup",
			priority: "high",
			title: "Configure project root",
			summary:
				"Watchdog and drawing control do not know what folder belongs to this project yet.",
			detail:
				"Set a root path first so the drawing list, title block tools, and Watchdog all point at the same project workspace.",
			actionType: "link",
			actionLabel: "Open Watchdog",
			actionTarget: buildWatchdogHref(project.id),
			issueSetId: null,
			issueSetLabel: null,
			entityId: "setup:root",
			fingerprint: "",
			quickActions: [],
		});
	}
	if (projectRoot && !telemetry.ruleConfigured) {
		items.push({
			id: "setup:mapping",
			type: "setup",
			priority: "medium",
			title: "Confirm shared mapping rules",
			summary:
				"The project root is saved, but shared mapping rules are still incomplete.",
			detail:
				"Review shared roots and patterns so workstation events land on this project consistently.",
			actionType: "link",
			actionLabel: "Open Watchdog",
			actionTarget: buildWatchdogHref(project.id),
			issueSetId: null,
			issueSetLabel: null,
			entityId: "setup:mapping",
			fingerprint: "",
			quickActions: [],
		});
	}
	if (projectRoot && scan && scan.summary.drawingFiles === 0) {
		items.push({
			id: "setup:no-drawings",
			type: "setup",
			priority: "medium",
			title: "No drawings found in project root",
			summary:
				"The configured project root scanned cleanly, but no drawing files were found.",
			detail:
				"Check the root path or scan the intended drawing folder before issue prep begins.",
			actionType: "link",
			actionLabel: "Open title block review",
			actionTarget: buildProjectScopedAppHref(
				"/app/apps/drawing-list-manager",
				project.id,
			),
			issueSetId: null,
			issueSetLabel: null,
			entityId: "setup:no-drawings",
			fingerprint: "",
			quickActions: [],
		});
	}
	return items;
}

function getTitleBlockItems(
	rows: ProjectDocumentMetadataRow[],
	projectId: string,
	issueSet?: ProjectIssueSetRecord | null,
): ProjectReviewInboxItem[] {
	return rows
		.filter(
			(row) =>
				row.reviewState !== "ready" ||
				row.issues.length > 0 ||
				row.warnings.length > 0,
		)
		.map((row) => {
			const descriptor = buildTitleBlockReviewDescriptor(row);
			return {
				id: descriptor.itemId,
				type: "title-block",
				priority:
					row.issues.length > 0 || row.hasWdTbConflict ? "high" : "medium",
				title: descriptor.title,
				summary: descriptor.summary,
				detail: descriptor.detail,
				actionType: "link",
				actionLabel: "Open title block review",
				actionTarget: buildProjectIssueSetAppHref(
					"/app/apps/drawing-list-manager",
					projectId,
					issueSet?.id,
				),
				issueSetId: issueSet?.id ?? null,
				issueSetLabel: issueSet?.issueTag ?? null,
				entityId: descriptor.entityId,
				fingerprint: descriptor.fingerprint,
				quickActions: [
					{
						id: `title-block:accept:${row.id}`,
						label: "Accept for package",
						kind: "decision",
						tone: "accent",
						decisionStatus: "accepted",
					},
				],
			};
		});
}

function getRevisionItems(
	revisions: DrawingRevisionRegisterRow[],
): ProjectReviewInboxItem[] {
	return revisions
		.filter((entry) => entry.issue_status !== "resolved")
		.map((entry) => ({
			id: `revision:${entry.id}`,
			type: "revision",
			priority: entry.issue_severity === "critical" ? "high" : "medium",
			title: entry.title || entry.drawing_number || "Revision item",
			summary: entry.issue_summary || "Revision item needs review.",
			detail: `${entry.issue_status.replace("-", " ")} • ${
				entry.revision ? `Rev ${entry.revision}` : "No revision"
			}`,
			actionType: "view",
			actionLabel: "Open revisions",
			actionTarget: "revisions",
			issueSetId: null,
			issueSetLabel: null,
			entityId: entry.id,
			fingerprint: "",
			quickActions: [
				{
					id: `revision:resolve:${entry.id}`,
					label: "Mark resolved",
					kind: "revision-status",
					tone: "success",
					revisionStatus: "resolved",
				},
			],
		}));
}

function getStandardsItems(
	standardsChecks: DrawingAnnotation[],
	projectId: string,
	issueSet?: ProjectIssueSetRecord | null,
): ProjectReviewInboxItem[] {
	return standardsChecks
		.filter((row) => row.qa_status !== "pass")
		.map((row) => {
			const descriptor = buildStandardsReviewDescriptor(row);
			return {
				id: descriptor.itemId,
				type: "standards",
				priority:
					row.qa_status === "fail"
						? "high"
						: row.qa_status === "pending"
							? "medium"
							: "medium",
				title: descriptor.title,
				summary: descriptor.summary,
				detail: descriptor.detail,
				actionType: "link",
				actionLabel: "Open Standards Checker",
				actionTarget: buildProjectIssueSetAppHref(
					"/app/apps/standards-checker",
					projectId,
					issueSet?.id,
				),
				issueSetId: issueSet?.id ?? null,
				issueSetLabel: issueSet?.issueTag ?? null,
				entityId: descriptor.entityId,
				fingerprint: descriptor.fingerprint,
				quickActions: [
					{
						id: `standards:waive:${row.id}`,
						label: "Waive for package",
						kind: "decision",
						tone: "warning",
						decisionStatus: "waived",
					},
				],
			};
		});
}

function getIssueSetItems(args: {
	projectId: string;
	scan: ProjectDocumentMetadataSnapshot | null;
	issueSets: ProjectIssueSetRecord[];
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
}): ProjectReviewInboxItem[] {
	const { projectId, scan, issueSets, transmittalReceipts } = args;
	const items: ProjectReviewInboxItem[] = [];

	if ((scan?.summary.drawingFiles ?? 0) > 0 && issueSets.length === 0) {
		items.push({
			id: "issue-set:create",
			type: "issue-set",
			priority: "medium",
			title: "Create the first issue set",
			summary:
				"Drawing scan data exists, but no issue package draft has been saved yet.",
			detail:
				"Capture the current project state in an issue set before standards and transmittal evidence drift apart.",
			actionType: "view",
			actionLabel: "Open issue sets",
			actionTarget: "issue-sets",
			issueSetId: null,
			issueSetLabel: null,
			entityId: "issue-set:create",
			fingerprint: "",
			quickActions: [],
		});
	}

	for (const issueSet of issueSets) {
		if (issueSet.snapshot.reviewItemCount > 0) {
			items.push({
				id: `issue-set:blockers:${issueSet.id}`,
				type: "issue-set",
				priority: issueSet.snapshot.reviewItemCount > 2 ? "high" : "medium",
				title: issueSet.name,
				summary: `${issueSet.snapshot.reviewItemCount} blocker${
					issueSet.snapshot.reviewItemCount === 1 ? "" : "s"
				} are still attached to this issue set.`,
				detail: `${
					issueSet.issueTag
				} • ${issueSet.snapshot.selectedDrawingCount} selected drawing${
					issueSet.snapshot.selectedDrawingCount === 1 ? "" : "s"
				}`,
				actionType: "view",
				actionLabel: "Open issue sets",
				actionTarget: "issue-sets",
				issueSetId: issueSet.id,
				issueSetLabel: issueSet.issueTag,
				entityId: issueSet.id,
				fingerprint: "",
				quickActions: [],
			});
		}

		const linkedReceipt = findMatchedTransmittalReceipt(
			issueSet,
			transmittalReceipts,
		);
		if (
			(issueSet.transmittalNumber || issueSet.transmittalDocumentName) &&
			!linkedReceipt
		) {
			items.push({
				id: `issue-set:transmittal:${issueSet.id}`,
				type: "issue-set",
				priority: "medium",
				title: issueSet.name,
				summary:
					"The issue set references a transmittal, but no generated receipt is linked yet.",
				detail:
					issueSet.transmittalNumber ||
					issueSet.transmittalDocumentName ||
					"Transmittal receipt missing",
				actionType: "link",
				actionLabel: "Open Transmittal Builder",
				actionTarget: buildProjectIssueSetAppHref(
					"/app/apps/transmittal-builder",
					projectId,
					issueSet.id,
				),
				issueSetId: issueSet.id,
				issueSetLabel: issueSet.issueTag,
				entityId: issueSet.id,
				fingerprint: "",
				quickActions: [],
			});
		}
	}

	return items;
}

function sortItems(items: ProjectReviewInboxItem[]) {
	return [...items].sort((left, right) => {
		const priorityDelta =
			priorityRank(left.priority) - priorityRank(right.priority);
		if (priorityDelta !== 0) {
			return priorityDelta;
		}
		return left.title.localeCompare(right.title);
	});
}

function resolveDecisionType(
	itemType: ProjectReviewInboxItemType,
): ProjectReviewDecisionItemType | null {
	if (itemType === "title-block" || itemType === "standards") {
		return itemType;
	}
	return null;
}

function findMatchingDecision(
	item: ProjectReviewInboxItem,
	decisions: ProjectReviewDecisionRecord[],
) {
	const decisionType = resolveDecisionType(item.type);
	if (!decisionType) {
		return null;
	}
	return (
		decisions.find(
			(decision) =>
				decision.itemType === decisionType &&
				decision.itemId === item.id &&
				decision.fingerprint === item.fingerprint &&
				(decision.issueSetId || null) === (item.issueSetId || null),
		) ?? null
	);
}

export function useProjectReviewInboxData(
	project: Project,
	telemetry: ProjectWatchdogTelemetry,
	preferredIssueSetId?: string | null,
): ProjectReviewInboxData {
	const [state, setState] = useState<ProjectReviewInboxState>(EMPTY_STATE);
	const [refreshToken, setRefreshToken] = useState(0);

	const refresh = () => {
		setRefreshToken((current) => current + 1);
	};

	useEffect(() => {
		let cancelled = false;
		void refreshToken;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const [
				revisionsResult,
				issueSetsResult,
				receiptsResult,
				decisionsResult,
				snapshotResult,
			] = await Promise.all([
				projectRevisionRegisterService.fetchEntries(project.id),
				projectIssueSetService.fetchIssueSets(project.id),
				projectTransmittalReceiptService.fetchReceipts(project.id),
				projectReviewDecisionService.fetchDecisions(project.id),
				project.watchdog_root_path?.trim()
					? projectDocumentMetadataService
							.loadSnapshot({
								projectId: project.id,
								projectRootPath: project.watchdog_root_path,
							})
							.then((data) => ({ data, error: null as Error | null }))
							.catch((error) => ({
								data: null,
								error:
									error instanceof Error
										? error
										: new Error("Unable to load drawing scan."),
							}))
					: Promise.resolve({
							data: null,
							error: null as Error | null,
						}),
			]);

			const standardsResult = snapshotResult.data
				? await fetchProjectStandardsEvidence(
						project.id,
						snapshotResult.data.rows.map((row) => row.relativePath),
					)
				: { data: [], error: null as Error | null };

			if (cancelled) {
				return;
			}

			setState({
				loading: false,
				scan: snapshotResult.data,
				revisions: revisionsResult.data,
				standardsChecks: standardsResult.data,
				issueSets: issueSetsResult.data,
				transmittalReceipts: receiptsResult.data,
				decisions: decisionsResult.data,
				messages: [
					...(revisionsResult.error ? [revisionsResult.error.message] : []),
					...(issueSetsResult.error ? [issueSetsResult.error.message] : []),
					...(receiptsResult.error ? [receiptsResult.error.message] : []),
					...(decisionsResult.error ? [decisionsResult.error.message] : []),
					...(standardsResult.error ? [standardsResult.error.message] : []),
					...(snapshotResult.error ? [snapshotResult.error.message] : []),
				],
			});
		};

		void load();

		return () => {
			cancelled = true;
		};
	}, [project.id, project.watchdog_root_path, refreshToken]);

	const currentIssueSet = useMemo(
		() =>
			state.issueSets.find((issueSet) => issueSet.id === preferredIssueSetId) ??
			state.issueSets[0] ??
			null,
		[preferredIssueSetId, state.issueSets],
	);

	const allItems = useMemo(() => {
		const scanRows = state.scan?.rows ?? [];
		return sortItems([
			...getSetupItems(project, telemetry, state.scan),
			...getTitleBlockItems(scanRows, project.id, currentIssueSet),
			...getRevisionItems(state.revisions),
			...getStandardsItems(
				state.standardsChecks,
				project.id,
				currentIssueSet,
			),
			...getIssueSetItems({
				projectId: project.id,
				scan: state.scan,
				issueSets: state.issueSets,
				transmittalReceipts: state.transmittalReceipts,
			}),
		]);
	}, [
		project,
		state.issueSets,
		state.revisions,
		state.scan,
		state.standardsChecks,
		state.transmittalReceipts,
		telemetry,
		currentIssueSet,
	]);

	const items = useMemo(
		() =>
			allItems.filter((item) => !findMatchingDecision(item, state.decisions)),
		[allItems, state.decisions],
	);

	const handledCount = allItems.length - items.length;
	const currentIssueSetId = currentIssueSet?.id ?? null;
	const scopedDecisions = useMemo(
		() =>
			state.decisions.filter(
				(decision) => (decision.issueSetId || null) === currentIssueSetId,
			),
		[currentIssueSetId, state.decisions],
	);

	const metrics = useMemo<ProjectReviewInboxMetrics>(
		() => ({
			openCount: items.length,
			highPriorityCount: items.filter((item) => item.priority === "high")
				.length,
			setupAttentionCount: items.filter((item) => item.type === "setup").length,
			titleBlockAttentionCount: items.filter(
				(item) => item.type === "title-block",
			).length,
			acceptedTitleBlockCount: scopedDecisions.filter(
				(decision) =>
					decision.itemType === "title-block" &&
					decision.status === "accepted",
			).length,
			revisionAttentionCount: items.filter((item) => item.type === "revision")
				.length,
			standardsAttentionCount: items.filter((item) => item.type === "standards")
				.length,
			waivedStandardsCount: scopedDecisions.filter(
				(decision) =>
					decision.itemType === "standards" && decision.status === "waived",
			).length,
			issueSetAttentionCount: items.filter((item) => item.type === "issue-set")
				.length,
		}),
		[items, scopedDecisions],
	);

	const messages = useMemo(
		() => [
			...state.messages,
			...(handledCount > 0
				? [
						`${handledCount} review item${
							handledCount === 1 ? "" : "s"
						} already have package decisions for the current snapshot.`,
					]
				: []),
		],
		[handledCount, state.messages],
	);

	const overallState = useMemo<TrustState>(() => {
		if (metrics.openCount === 0) {
			return state.loading ? "background" : "ready";
		}
		return metrics.highPriorityCount > 0 ? "needs-attention" : "background";
	}, [metrics.highPriorityCount, metrics.openCount, state.loading]);

	return {
		loading: state.loading,
		scan: state.scan,
		revisions: state.revisions,
		standardsChecks: state.standardsChecks,
		issueSets: state.issueSets,
		currentIssueSet,
		transmittalReceipts: state.transmittalReceipts,
		messages,
		items,
		metrics,
		nextAction:
			items[0]?.summary ??
			"This project is ready to move through review and package assembly.",
		overallState,
		handledCount,
		refresh,
	};
}
