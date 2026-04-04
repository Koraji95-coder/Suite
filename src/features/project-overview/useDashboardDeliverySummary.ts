import { useEffect, useMemo, useState } from "react";
import type { TrustState } from "@/components/system/TrustStateBadge";
import {
	type ProjectIssueSetRecord,
	type ProjectIssueSetStatus,
	projectIssueSetService,
} from "@/features/project-workflow/issueSetService";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import {
	type ProjectTransmittalReceiptRecord,
	projectTransmittalReceiptService,
} from "@/services/projectTransmittalReceiptService";
import type {
	DashboardProject,
	DashboardTaskCount,
} from "./useDashboardOverviewData";

export interface DashboardDeliveryProjectSummary {
	projectId: string;
	name: string;
	deadline: string | null;
	nextDue: DashboardTaskCount["nextDue"];
	openTaskCount: number;
	watchdogRootConfigured: boolean;
	needsSetup: boolean;
	issueSetId: string | null;
	issueSetName: string | null;
	issueTag: string | null;
	issueSetStatus: ProjectIssueSetStatus | null;
	reviewItemCount: number;
	selectedDrawingCount: number;
	trackedDrawingCount: number;
	unresolvedRevisionCount: number;
	transmittalReceiptCount: number;
	transmittalPendingReviewCount: number;
	transmittalNumber: string | null;
	lastReceiptAt: string | null;
	state: TrustState;
	stateLabel: string;
	summary: string;
	detail: string;
	dueSoon: boolean;
	overdue: boolean;
}

export interface DashboardDeliverySummaryMetrics {
	totalProjects: number;
	reviewPressureCount: number;
	reviewProjectCount: number;
	readyCount: number;
	issuedCount: number;
	packagesInProgressCount: number;
	transmittalQueueCount: number;
	setupAttentionCount: number;
	dueSoonCount: number;
	overdueCount: number;
	openTaskCount: number;
}

interface DashboardDeliverySummaryState {
	loading: boolean;
	error: string | null;
	projects: DashboardDeliveryProjectSummary[];
}

const EMPTY_STATE: DashboardDeliverySummaryState = {
	loading: true,
	error: null,
	projects: [],
};

function parseLocalDay(value: string | null) {
	if (!value) {
		return null;
	}
	const [year, month, day] = value.split("T")[0].split("-").map(Number);
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	) {
		return null;
	}
	return new Date(year, month - 1, day);
}

function buildProjectSummary(args: {
	project: DashboardProject;
	taskCounts: DashboardTaskCount | undefined;
	issueSets: ProjectIssueSetRecord[];
	revisions: DrawingRevisionRegisterRow[];
	receipts: ProjectTransmittalReceiptRecord[];
}): DashboardDeliveryProjectSummary {
	const { project, taskCounts, issueSets, revisions, receipts } = args;
	const latestIssueSet = issueSets[0] ?? null;
	const latestReceipt = receipts[0] ?? null;
	const unresolvedRevisionCount = revisions.filter(
		(entry) => entry.issue_status !== "resolved",
	).length;
	const watchdogRootConfigured = Boolean(project.watchdog_root_path?.trim());
	const needsSetup = !watchdogRootConfigured;
	const reviewItemCount = latestIssueSet
		? Math.max(0, latestIssueSet.snapshot.reviewItemCount)
		: unresolvedRevisionCount;
	const selectedDrawingCount =
		latestIssueSet?.snapshot.selectedDrawingCount ?? 0;
	const trackedDrawingCount = latestIssueSet?.snapshot.trackedDrawingCount ?? 0;
	const transmittalPendingReviewCount = receipts.reduce(
		(total, receipt) => total + Math.max(0, receipt.pendingReviewCount),
		0,
	);
	const openTaskCount = taskCounts
		? Math.max(0, taskCounts.total - taskCounts.completed)
		: 0;
	const deadlineDate = parseLocalDay(project.deadline);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const dueSoonBoundary = new Date(today);
	dueSoonBoundary.setDate(dueSoonBoundary.getDate() + 7);
	const overdue = Boolean(deadlineDate && deadlineDate < today);
	const dueSoon = Boolean(
		deadlineDate && deadlineDate >= today && deadlineDate <= dueSoonBoundary,
	);

	let state: TrustState = "background";
	let stateLabel = "In progress";
	let summary = "Start packaging work from the project workspace.";
	let detail = latestIssueSet
		? latestIssueSet.summary || "A project issue set is in progress."
		: "Create the first issue set to capture package scope, review blockers, and transmittal prep.";

	if (needsSetup) {
		state = "needs-attention";
		stateLabel = "Finish setup";
		summary = "Project root and Watchdog mapping still need setup.";
		detail =
			"Configure the tracked project root before drawing scans, issue sets, and drawing telemetry can stay aligned.";
	} else if (!latestIssueSet) {
		state = openTaskCount > 0 ? "background" : "needs-attention";
		stateLabel = "Create issue set";
		summary =
			openTaskCount > 0
				? `${openTaskCount} open task${openTaskCount === 1 ? "" : "s"} are still active before package prep.`
				: "No issue set has been drafted for this project yet.";
		detail = taskCounts?.nextDue?.name
			? `Next due: ${taskCounts.nextDue.name}. Start an issue set when the package scope is ready.`
			: "Start the first issue set to capture drawings, review blockers, and transmittal state in one place.";
	} else if (latestIssueSet.status === "issued") {
		state = "ready";
		stateLabel = "Issued";
		summary = `${latestIssueSet.issueTag} has already been issued.`;
		detail = latestReceipt?.transmittalNumber
			? `Latest receipt: ${latestReceipt.transmittalNumber} with ${latestReceipt.documentCount} document${latestReceipt.documentCount === 1 ? "" : "s"}.`
			: "The latest package is marked issued and can be reviewed from issue set history.";
	} else if (reviewItemCount > 0) {
		state = "needs-attention";
		stateLabel = "Review blockers";
		summary = `${reviewItemCount} review item${reviewItemCount === 1 ? "" : "s"} still need attention.`;
		detail =
			unresolvedRevisionCount > 0
				? `${unresolvedRevisionCount} revision item${unresolvedRevisionCount === 1 ? "" : "s"} remain unresolved before issue.`
				: "Clear the current package blockers before moving into transmittal and issue.";
	} else if (latestIssueSet.status === "ready") {
		state = "ready";
		stateLabel = "Ready for issue";
		summary = `${latestIssueSet.issueTag} is ready to move into transmittal and issue.`;
		detail = latestIssueSet.transmittalNumber
			? `Transmittal ${latestIssueSet.transmittalNumber} is linked to the current package draft.`
			: `${selectedDrawingCount} selected drawing${selectedDrawingCount === 1 ? "" : "s"} are packaged and ready for issue.`;
	} else if (latestIssueSet.status === "review") {
		state = "background";
		stateLabel = "In review";
		summary = `${latestIssueSet.issueTag} is moving through review.`;
		detail = latestIssueSet.transmittalNumber
			? `Linked transmittal: ${latestIssueSet.transmittalNumber}.`
			: `${selectedDrawingCount} selected drawing${selectedDrawingCount === 1 ? "" : "s"} are staged for package review.`;
	} else {
		state = "background";
		stateLabel = "Draft package";
		summary = `${latestIssueSet.issueTag} is still being assembled.`;
		detail = `${selectedDrawingCount} selected drawing${selectedDrawingCount === 1 ? "" : "s"} are currently in the package draft.`;
	}

	return {
		projectId: project.id,
		name: project.name,
		deadline: project.deadline,
		nextDue: taskCounts?.nextDue ?? null,
		openTaskCount,
		watchdogRootConfigured,
		needsSetup,
		issueSetId: latestIssueSet?.id ?? null,
		issueSetName: latestIssueSet?.name ?? null,
		issueTag: latestIssueSet?.issueTag ?? null,
		issueSetStatus: latestIssueSet?.status ?? null,
		reviewItemCount,
		selectedDrawingCount,
		trackedDrawingCount,
		unresolvedRevisionCount,
		transmittalReceiptCount: receipts.length,
		transmittalPendingReviewCount,
		transmittalNumber:
			latestIssueSet?.transmittalNumber ||
			latestReceipt?.transmittalNumber ||
			null,
		lastReceiptAt: latestReceipt?.generatedAt ?? null,
		state,
		stateLabel,
		summary,
		detail,
		dueSoon,
		overdue,
	};
}

export function summarizeDashboardDeliveryProjects(
	projects: DashboardDeliveryProjectSummary[],
): DashboardDeliverySummaryMetrics {
	return projects.reduce<DashboardDeliverySummaryMetrics>(
		(acc, project) => {
			acc.totalProjects += 1;
			acc.reviewPressureCount += Math.max(0, project.reviewItemCount);
			acc.openTaskCount += Math.max(0, project.openTaskCount);
			if (project.reviewItemCount > 0) {
				acc.reviewProjectCount += 1;
			}
			if (project.issueSetStatus === "ready") {
				acc.readyCount += 1;
			}
			if (project.issueSetStatus === "issued") {
				acc.issuedCount += 1;
			}
			if (
				project.issueSetStatus === "draft" ||
				project.issueSetStatus === "review"
			) {
				acc.packagesInProgressCount += 1;
			}
			if (
				(project.transmittalNumber && project.issueSetStatus !== "issued") ||
				project.transmittalPendingReviewCount > 0
			) {
				acc.transmittalQueueCount += 1;
			}
			if (project.needsSetup) {
				acc.setupAttentionCount += 1;
			}
			if (project.dueSoon) {
				acc.dueSoonCount += 1;
			}
			if (project.overdue) {
				acc.overdueCount += 1;
			}
			return acc;
		},
		{
			totalProjects: 0,
			reviewPressureCount: 0,
			reviewProjectCount: 0,
			readyCount: 0,
			issuedCount: 0,
			packagesInProgressCount: 0,
			transmittalQueueCount: 0,
			setupAttentionCount: 0,
			dueSoonCount: 0,
			overdueCount: 0,
			openTaskCount: 0,
		},
	);
}

export function useDashboardDeliverySummary(
	projects: DashboardProject[],
	projectTaskCounts: ReadonlyMap<string, DashboardTaskCount>,
) {
	const [state, setState] =
		useState<DashboardDeliverySummaryState>(EMPTY_STATE);

	useEffect(() => {
		let cancelled = false;

		if (projects.length === 0) {
			setState({
				loading: false,
				error: null,
				projects: [],
			});
			return () => {
				cancelled = true;
			};
		}

		const run = async () => {
			setState((current) => ({
				...current,
				loading: true,
				error: null,
			}));

			const projectIds = projects.map((project) => project.id);
			const [issueSetsByProject, revisionsByProject, receiptsByProject] =
				await Promise.all([
					projectIssueSetService.fetchIssueSetsForProjects(projectIds),
					projectRevisionRegisterService.fetchEntriesForProjects(projectIds),
					projectTransmittalReceiptService.fetchReceiptsForProjects(projectIds),
				]);

			const results = projects.map((project) => {
				const issueSetsResult = issueSetsByProject.get(project.id) ?? {
					data: [],
					error: null,
				};
				const revisionsResult = revisionsByProject.get(project.id) ?? {
					data: [],
					error: null,
				};
				const receiptsResult = receiptsByProject.get(project.id) ?? {
					data: [],
					error: null,
				};

				const errors = [
					issueSetsResult.error,
					revisionsResult.error,
					receiptsResult.error,
				].filter((error): error is Error => error instanceof Error);

				return {
					project,
					issueSets: issueSetsResult.data ?? [],
					revisions: revisionsResult.data ?? [],
					receipts: receiptsResult.data ?? [],
					errors,
				};
			});

			if (cancelled) {
				return;
			}

			const summaries = results.map((result) =>
				buildProjectSummary({
					project: result.project,
					taskCounts: projectTaskCounts.get(result.project.id),
					issueSets: result.issueSets,
					revisions: result.revisions,
					receipts: result.receipts,
				}),
			);
			const errorMessages = Array.from(
				new Set(
					results
						.flatMap((result) => result.errors.map((error) => error.message))
						.filter(Boolean),
				),
			);

			setState({
				loading: false,
				error:
					errorMessages.length > 0
						? errorMessages[0] ||
							"Some project delivery signals are unavailable."
						: null,
				projects: summaries.sort((left, right) => {
					if (left.overdue !== right.overdue) {
						return left.overdue ? -1 : 1;
					}
					if (left.state !== right.state) {
						const stateRank = (value: TrustState) => {
							switch (value) {
								case "needs-attention":
									return 0;
								case "background":
									return 1;
								default:
									return 2;
							}
						};
						return stateRank(left.state) - stateRank(right.state);
					}
					return left.name.localeCompare(right.name);
				}),
			});
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [projectTaskCounts, projects]);

	const metrics = useMemo(
		() => summarizeDashboardDeliveryProjects(state.projects),
		[state.projects],
	);

	return {
		loading: state.loading,
		error: state.error,
		projects: state.projects,
		metrics,
	};
}
