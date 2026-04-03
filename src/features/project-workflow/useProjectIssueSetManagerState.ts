import { useEffect, useMemo, useState } from "react";
import type { TrustState } from "@/components/apps/ui/TrustStateBadge";
import type { Project } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";
import {
	buildProjectIssueSetEvidencePacket,
	fetchProjectStandardsEvidence,
	renderProjectIssueSetEvidencePacketMarkdown,
	type ProjectDeliverableRegisterRow,
	type ProjectDeliverableRegisterSnapshot,
} from "@/features/project-delivery";
import {
	type ProjectDocumentMetadataSnapshot,
	projectDocumentMetadataService,
} from "@/features/project-documents";
import {
	buildNativeStandardsReviewDescriptor,
	buildStandardsReviewDescriptor,
	buildTitleBlockReviewDescriptor,
} from "@/features/project-review/descriptors";
import {
	type ProjectStandardsLatestReview,
	standardsCheckerBackendService,
	hasRecordedProjectStandardsLatestReview,
} from "@/features/standards-checker";
import { buildProjectIssueSetAppHref } from "@/lib/projectWorkflowNavigation";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import type { ProjectReviewDecisionRecord } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService, type DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";
import {
	type ProjectIssueSetInput,
	type ProjectIssueSetRecord,
	type ProjectIssueSetSnapshot,
	type ProjectIssueSetStatus,
	projectIssueSetService,
} from "./issueSetService";
import { projectWorkflowSharedStateService } from "./sharedStateService";

interface ProjectIssueSetManagerDataState {
	loading: boolean;
	saving: boolean;
	scan: ProjectDocumentMetadataSnapshot | null;
	registerSnapshot: ProjectDeliverableRegisterSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	issueSets: ProjectIssueSetRecord[];
	standardsChecks: Awaited<
		ReturnType<typeof fetchProjectStandardsEvidence>
	>["data"];
	nativeStandardsReview: ProjectStandardsLatestReview | null;
	decisions: ProjectReviewDecisionRecord[];
	transmittalReceipts: Awaited<
		ReturnType<typeof projectTransmittalReceiptService.fetchReceipts>
	>["data"];
	automationReceipts: Awaited<
		ReturnType<typeof projectAutomationReceiptService.fetchReceipts>
	>["data"];
	messages: string[];
}

export interface ProjectIssueSetFormState {
	name: string;
	issueTag: string;
	status: ProjectIssueSetStatus;
	targetDate: string;
	transmittalNumber: string;
	transmittalDocumentName: string;
	summary: string;
	notes: string;
	selectedDrawingPaths: string[];
	selectedRegisterRowIds: string[];
	selectedDrawingNumbers: string[];
	selectedPdfFileIds: string[];
}

type ShowToast = (
	type: "success" | "error" | "warning" | "info",
	message: string,
) => void;

const EMPTY_STATE: ProjectIssueSetManagerDataState = {
	loading: true,
	saving: false,
	scan: null,
	registerSnapshot: null,
	revisions: [],
	issueSets: [],
	standardsChecks: [],
	nativeStandardsReview: null,
	decisions: [],
	transmittalReceipts: [],
	automationReceipts: [],
	messages: [],
};

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeDrawingKey(value: unknown) {
	return normalizeText(value)
		.replace(/^.*[\\/]/, "")
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function buildEmptyForm(): ProjectIssueSetFormState {
	return {
		name: "",
		issueTag: "",
		status: "draft",
		targetDate: "",
		transmittalNumber: "",
		transmittalDocumentName: "",
		summary: "",
		notes: "",
		selectedDrawingPaths: [],
		selectedRegisterRowIds: [],
		selectedDrawingNumbers: [],
		selectedPdfFileIds: [],
	};
}

function getPreferredMatchedFileId(row: ProjectDeliverableRegisterRow) {
	if (row.pdfPairingStatus !== "paired" && row.pdfPairingStatus !== "manual") {
		return null;
	}
	return row.pdfMatches[0]?.fileId ?? null;
}

function getPreferredMatchedDrawingPath(row: ProjectDeliverableRegisterRow) {
	if (row.dwgPairingStatus !== "paired" && row.dwgPairingStatus !== "manual") {
		return null;
	}
	return row.dwgMatches[0]?.relativePath || null;
}

function buildRegisterSelection(rows: ProjectDeliverableRegisterRow[]) {
	const selectedRegisterRowIds = rows.map((row) => row.id);
	const selectedDrawingNumbers = rows
		.map((row) => normalizeText(row.drawingNumber))
		.filter(Boolean);
	const selectedPdfFileIds = rows
		.map((row) => getPreferredMatchedFileId(row))
		.filter((value): value is string => Boolean(value));
	const selectedDrawingPaths = rows
		.map((row) => getPreferredMatchedDrawingPath(row))
		.filter((value): value is string => Boolean(value));
	return {
		selectedRegisterRowIds,
		selectedDrawingNumbers,
		selectedPdfFileIds,
		selectedDrawingPaths,
	};
}

function computeSetupBlockerCount(
	project: Project,
	telemetry: ProjectWatchdogTelemetry,
	scan: ProjectDocumentMetadataSnapshot | null,
) {
	let count = 0;
	const projectRoot = project.watchdog_root_path?.trim() || "";
	if (!projectRoot) {
		count += 1;
	}
	if (projectRoot && !telemetry.ruleConfigured) {
		count += 1;
	}
	if (projectRoot && scan && scan.summary.drawingFiles === 0) {
		count += 1;
	}
	return count;
}

function computeUnresolvedRevisionCount(revisions: DrawingRevisionRegisterRow[]) {
	return revisions.filter((entry) => entry.issue_status !== "resolved").length;
}

function buildSnapshot(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	scan: ProjectDocumentMetadataSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	standardsChecks: Awaited<
		ReturnType<typeof fetchProjectStandardsEvidence>
	>["data"];
	nativeStandardsReview: ProjectStandardsLatestReview | null;
	decisions: ProjectReviewDecisionRecord[];
	issueSetId?: string | null;
	selectedDrawingPaths: string[];
}): ProjectIssueSetSnapshot {
	const selectedRows = (args.scan?.rows ?? []).filter((row) =>
		args.selectedDrawingPaths.includes(row.relativePath),
	);
	const titleBlockReviewRows = selectedRows.filter(
		(row) =>
			row.reviewState !== "ready" ||
			row.issues.length > 0 ||
			row.warnings.length > 0,
	);
	const acceptedTitleBlockCount = titleBlockReviewRows.filter((row) => {
		const descriptor = buildTitleBlockReviewDescriptor(row);
		return args.decisions.some(
			(decision) =>
				decision.itemType === "title-block" &&
				decision.itemId === descriptor.itemId &&
				decision.fingerprint === descriptor.fingerprint &&
				(decision.issueSetId || null) === (args.issueSetId || null) &&
				decision.status === "accepted",
		);
	}).length;
	const titleBlockReviewCount = Math.max(
		0,
		titleBlockReviewRows.length - acceptedTitleBlockCount,
	);
	const selectedDrawingKeys = new Set(
		args.selectedDrawingPaths.map((path) => normalizeDrawingKey(path)),
	);
	const actionableStandardsChecks = args.standardsChecks.filter((row) => {
		if (row.qa_status === "pass") {
			return false;
		}
		const drawingNameKey = normalizeDrawingKey(row.drawing_name);
		const filePathKey = normalizeDrawingKey(row.file_path);
		return (
			selectedDrawingKeys.has(drawingNameKey) ||
			selectedDrawingKeys.has(filePathKey)
		);
	});
	const waivedStandardsCount = actionableStandardsChecks.filter((row) => {
		const descriptor = buildStandardsReviewDescriptor(row);
		return args.decisions.some(
			(decision) =>
				decision.itemType === "standards" &&
				decision.itemId === descriptor.itemId &&
				decision.fingerprint === descriptor.fingerprint &&
				(decision.issueSetId || null) === (args.issueSetId || null) &&
				decision.status === "waived",
		);
	}).length;
	const blockingNativeReview =
		args.nativeStandardsReview &&
		args.nativeStandardsReview.overallStatus !== "pass"
			? args.nativeStandardsReview
			: null;
	const waivedNativeStandardsCount = blockingNativeReview
		? (() => {
				const descriptor =
					buildNativeStandardsReviewDescriptor(blockingNativeReview);
				return args.decisions.some(
					(decision) =>
						decision.itemType === "standards" &&
						decision.itemId === descriptor.itemId &&
						decision.fingerprint === descriptor.fingerprint &&
						(decision.issueSetId || null) === (args.issueSetId || null) &&
						decision.status === "waived",
				)
					? 1
					: 0;
			})()
		: 0;
	const standardsReviewCount = Math.max(
		0,
		actionableStandardsChecks.length +
			(blockingNativeReview ? 1 : 0) -
			(waivedStandardsCount + waivedNativeStandardsCount),
	);
	const unresolvedRevisionCount = computeUnresolvedRevisionCount(
		args.revisions,
	);
	const setupBlockerCount = computeSetupBlockerCount(
		args.project,
		args.telemetry,
		args.scan,
	);
	return {
		drawingCount: args.scan?.summary.drawingFiles ?? 0,
		selectedDrawingCount: args.selectedDrawingPaths.length,
		reviewItemCount:
			titleBlockReviewCount +
			standardsReviewCount +
			unresolvedRevisionCount +
			setupBlockerCount,
		titleBlockReviewCount,
		standardsReviewCount,
		unresolvedRevisionCount,
		setupBlockerCount,
		trackedDrawingCount: args.telemetry.trackedDrawings.length,
		acceptedTitleBlockCount,
		waivedStandardsCount: waivedStandardsCount + waivedNativeStandardsCount,
	};
}

export function getProjectIssueSetSnapshotState(
	snapshot: ProjectIssueSetSnapshot,
): TrustState {
	if (
		snapshot.reviewItemCount > 0 ||
		snapshot.selectedDrawingCount === 0 ||
		snapshot.drawingCount === 0
	) {
		return "needs-attention";
	}
	return "ready";
}

export function formatProjectIssueSetRelativeDate(value: string | null) {
	if (!value) {
		return "No target date";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatProjectIssueSetTimestamp(value: string | null) {
	if (!value) {
		return "--";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function buildEvidenceFileName(
	projectName: string,
	issueTag: string,
	format: "md" | "json",
) {
	const slug = `${projectName}-${issueTag || "issue-set"}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${slug || "issue-set"}-evidence.${format}`;
}

function buildDefaultDraft(args: {
	project: Project;
	issueSetCount: number;
	scan: ProjectDocumentMetadataSnapshot | null;
	registerSnapshot: ProjectDeliverableRegisterSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	standardsChecks: Awaited<
		ReturnType<typeof fetchProjectStandardsEvidence>
	>["data"];
	nativeStandardsReview: ProjectStandardsLatestReview | null;
	decisions: ProjectReviewDecisionRecord[];
	telemetry: ProjectWatchdogTelemetry;
}): ProjectIssueSetFormState {
	const selectedRegisterRows = (args.registerSnapshot?.rows ?? []).filter(
		(row) => row.issueSetEligible,
	);
	const registerSelection = buildRegisterSelection(selectedRegisterRows);
	const selectedDrawingPaths =
		registerSelection.selectedDrawingPaths.length > 0
			? registerSelection.selectedDrawingPaths
			: (args.scan?.rows ?? []).map((row) => row.relativePath);
	const snapshot = buildSnapshot({
		project: args.project,
		telemetry: args.telemetry,
		scan: args.scan,
		revisions: args.revisions,
		standardsChecks: args.standardsChecks,
		nativeStandardsReview: args.nativeStandardsReview,
		decisions: args.decisions,
		selectedDrawingPaths,
	});
	const sequence = args.issueSetCount + 1;
	return {
		name: `${args.project.name} issue set`,
		issueTag: `ISSUE-${String(sequence).padStart(2, "0")}`,
		status: snapshot.reviewItemCount === 0 ? "ready" : "draft",
		targetDate: args.project.deadline?.split("T")[0] ?? "",
		transmittalNumber: "",
		transmittalDocumentName: "",
		summary:
			snapshot.reviewItemCount > 0
				? `${snapshot.reviewItemCount} blocker${
						snapshot.reviewItemCount === 1 ? "" : "s"
					} still need review before issue.`
				: "Project package draft is ready to move into standards review and transmittal assembly.",
		notes: "",
		selectedDrawingPaths,
		selectedRegisterRowIds: registerSelection.selectedRegisterRowIds,
		selectedDrawingNumbers: registerSelection.selectedDrawingNumbers,
		selectedPdfFileIds: registerSelection.selectedPdfFileIds,
	};
}

export function useProjectIssueSetManagerState(args: {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
	showToast: ShowToast;
}) {
	const {
		project,
		telemetry,
		preferredIssueSetId,
		onIssueSetContextChange,
		showToast,
	} = args;
	const [state, setState] = useState<ProjectIssueSetManagerDataState>(
		EMPTY_STATE,
	);
	const [editingIssueSetId, setEditingIssueSetId] = useState<string | null>(
		null,
	);
	const [expandedIssueSetId, setExpandedIssueSetId] = useState<string | null>(
		null,
	);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState<ProjectIssueSetFormState>(buildEmptyForm);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const [
				revisionsResult,
				workflowStateResult,
				snapshotResult,
				nativeReviewResult,
			] = await Promise.all([
				projectRevisionRegisterService.fetchEntries(project.id),
				projectWorkflowSharedStateService.fetch(project.id),
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
				standardsCheckerBackendService.fetchLatestReview(project.id),
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

			setState((current) => ({
				...current,
				loading: false,
				scan: snapshotResult.data,
				registerSnapshot: workflowStateResult.data.registerSnapshot,
				revisions: revisionsResult.data,
				issueSets: workflowStateResult.data.issueSets,
				standardsChecks: standardsResult.data,
				nativeStandardsReview: hasRecordedProjectStandardsLatestReview(
					nativeReviewResult.data,
				)
					? nativeReviewResult.data
					: null,
				decisions: workflowStateResult.data.decisions,
				transmittalReceipts: workflowStateResult.data.transmittalReceipts,
				automationReceipts: workflowStateResult.data.automationReceipts,
				messages: [
					...(revisionsResult.error ? [revisionsResult.error.message] : []),
					...workflowStateResult.messages,
					...(standardsResult.error ? [standardsResult.error.message] : []),
					...(snapshotResult.error ? [snapshotResult.error.message] : []),
					...(nativeReviewResult.error
						? [nativeReviewResult.error.message]
						: []),
				],
			}));
		};

		void load();

		return () => {
			cancelled = true;
		};
	}, [project.id, project.watchdog_root_path]);

	const preferredIssueSet = useMemo(
		() =>
			state.issueSets.find((issueSet) => issueSet.id === preferredIssueSetId) ??
			null,
		[preferredIssueSetId, state.issueSets],
	);
	const activeIssueSetContextId =
		editingIssueSetId ?? preferredIssueSet?.id ?? state.issueSets[0]?.id ?? null;

	const currentSnapshot = useMemo(() => {
		const registerSelection = buildRegisterSelection(
			(state.registerSnapshot?.rows ?? []).filter((row) => row.issueSetEligible),
		);
		return buildSnapshot({
			project,
			telemetry,
			scan: state.scan,
			revisions: state.revisions,
			standardsChecks: state.standardsChecks,
			nativeStandardsReview: state.nativeStandardsReview,
			decisions: state.decisions,
			issueSetId: activeIssueSetContextId,
			selectedDrawingPaths:
				registerSelection.selectedDrawingPaths.length > 0
					? registerSelection.selectedDrawingPaths
					: (state.scan?.rows ?? []).map((row) => row.relativePath),
		});
	}, [
		activeIssueSetContextId,
		project,
		state.decisions,
		state.nativeStandardsReview,
		state.registerSnapshot,
		state.revisions,
		state.scan,
		state.standardsChecks,
		telemetry,
	]);

	const currentSnapshotState = useMemo(
		() => getProjectIssueSetSnapshotState(currentSnapshot),
		[currentSnapshot],
	);

	const availableDrawingRows = state.scan?.rows ?? [];
	const availableRegisterRows = state.registerSnapshot?.rows ?? [];
	const hasRegisterRows = availableRegisterRows.length > 0;

	const openDraftFromCurrentProject = () => {
		setEditingIssueSetId(null);
		onIssueSetContextChange?.(null);
		setForm(
			buildDefaultDraft({
				project,
				issueSetCount: state.issueSets.length,
				scan: state.scan,
				registerSnapshot: state.registerSnapshot,
				revisions: state.revisions,
				standardsChecks: state.standardsChecks,
				nativeStandardsReview: state.nativeStandardsReview,
				decisions: state.decisions,
				telemetry,
			}),
		);
		setShowForm(true);
	};

	const openEditIssueSet = (issueSet: ProjectIssueSetRecord) => {
		setEditingIssueSetId(issueSet.id);
		onIssueSetContextChange?.(issueSet.id);
		setForm({
			name: issueSet.name,
			issueTag: issueSet.issueTag,
			status: issueSet.status,
			targetDate: issueSet.targetDate ?? "",
			transmittalNumber: issueSet.transmittalNumber ?? "",
			transmittalDocumentName: issueSet.transmittalDocumentName ?? "",
			summary: issueSet.summary,
			notes: issueSet.notes ?? "",
			selectedDrawingPaths: issueSet.selectedDrawingPaths,
			selectedRegisterRowIds: issueSet.selectedRegisterRowIds ?? [],
			selectedDrawingNumbers: issueSet.selectedDrawingNumbers ?? [],
			selectedPdfFileIds: issueSet.selectedPdfFileIds ?? [],
		});
		setShowForm(true);
	};

	const closeForm = () => {
		setEditingIssueSetId(null);
		setForm(buildEmptyForm());
		setShowForm(false);
	};

	const toggleSelectedDrawing = (relativePath: string) => {
		setForm((current) => {
			const exists = current.selectedDrawingPaths.includes(relativePath);
			return {
				...current,
				selectedDrawingPaths: exists
					? current.selectedDrawingPaths.filter((path) => path !== relativePath)
					: [...current.selectedDrawingPaths, relativePath],
			};
		});
	};

	const toggleSelectedRegisterRow = (row: ProjectDeliverableRegisterRow) => {
		setForm((current) => {
			const exists = current.selectedRegisterRowIds.includes(row.id);
			if (exists) {
				const nextRegisterRowIds = current.selectedRegisterRowIds.filter(
					(id) => id !== row.id,
				);
				const nextDrawingNumbers = current.selectedDrawingNumbers.filter(
					(value) => value !== row.drawingNumber,
				);
				const matchedPdfId = getPreferredMatchedFileId(row);
				const matchedDrawingPath = getPreferredMatchedDrawingPath(row);
				return {
					...current,
					selectedRegisterRowIds: nextRegisterRowIds,
					selectedDrawingNumbers: nextDrawingNumbers,
					selectedPdfFileIds: matchedPdfId
						? current.selectedPdfFileIds.filter((id) => id !== matchedPdfId)
						: current.selectedPdfFileIds,
					selectedDrawingPaths: matchedDrawingPath
						? current.selectedDrawingPaths.filter(
								(path) => path !== matchedDrawingPath,
							)
						: current.selectedDrawingPaths,
				};
			}
			return {
				...current,
				selectedRegisterRowIds: [...current.selectedRegisterRowIds, row.id],
				selectedDrawingNumbers: current.selectedDrawingNumbers.includes(
					row.drawingNumber,
				)
					? current.selectedDrawingNumbers
					: [...current.selectedDrawingNumbers, row.drawingNumber],
				selectedPdfFileIds: (() => {
					const matchedPdfId = getPreferredMatchedFileId(row);
					if (!matchedPdfId || current.selectedPdfFileIds.includes(matchedPdfId)) {
						return current.selectedPdfFileIds;
					}
					return [...current.selectedPdfFileIds, matchedPdfId];
				})(),
				selectedDrawingPaths: (() => {
					const matchedDrawingPath = getPreferredMatchedDrawingPath(row);
					if (
						!matchedDrawingPath ||
						current.selectedDrawingPaths.includes(matchedDrawingPath)
					) {
						return current.selectedDrawingPaths;
					}
					return [...current.selectedDrawingPaths, matchedDrawingPath];
				})(),
			};
		});
	};

	const handleSave = async () => {
		const normalizedName = normalizeText(form.name);
		if (!normalizedName) {
			showToast("error", "Give the issue set a name before saving.");
			return;
		}
		const snapshot = buildSnapshot({
			project,
			telemetry,
			scan: state.scan,
			revisions: state.revisions,
			standardsChecks: state.standardsChecks,
			nativeStandardsReview: state.nativeStandardsReview,
			decisions: state.decisions,
			issueSetId: editingIssueSetId ?? null,
			selectedDrawingPaths: form.selectedDrawingPaths,
		});
		setState((current) => ({ ...current, saving: true }));
		const payload: ProjectIssueSetInput = {
			projectId: project.id,
			name: normalizedName,
			issueTag: form.issueTag,
			status: form.status,
			targetDate: form.targetDate || null,
			transmittalNumber: form.transmittalNumber || null,
			transmittalDocumentName: form.transmittalDocumentName || null,
			registerSnapshotId: state.registerSnapshot?.id ?? null,
			terminalScheduleSnapshotId:
				state.issueSets.find((issueSet) => issueSet.id === editingIssueSetId)
					?.terminalScheduleSnapshotId ?? null,
			summary: form.summary,
			notes: form.notes || null,
			selectedDrawingPaths: form.selectedDrawingPaths,
			selectedRegisterRowIds: form.selectedRegisterRowIds,
			selectedDrawingNumbers: form.selectedDrawingNumbers,
			selectedPdfFileIds: form.selectedPdfFileIds,
			snapshot,
		};
		const result = await projectIssueSetService.saveIssueSet(
			payload,
			editingIssueSetId,
		);
		const savedIssueSet = result.data;
		const nextIssueSetId = savedIssueSet?.id ?? editingIssueSetId ?? null;
		setState((current) => ({
			...current,
			saving: false,
			issueSets: savedIssueSet
				? [
						savedIssueSet,
						...current.issueSets.filter((entry) => entry.id !== savedIssueSet.id),
					]
				: current.issueSets,
		}));
		projectWorkflowSharedStateService.clear(project.id);
		onIssueSetContextChange?.(nextIssueSetId);
		if (result.error) {
			showToast(
				"warning",
				`Issue set saved with local fallback: ${result.error.message}`,
			);
		} else {
			showToast(
				"success",
				editingIssueSetId ? "Issue set updated." : "Issue set draft created.",
			);
		}
		closeForm();
	};

	const handleDelete = async (issueSetId: string) => {
		const result = await projectIssueSetService.deleteIssueSet(
			project.id,
			issueSetId,
		);
		if (!result.success) {
			showToast(
				"error",
				result.error?.message || "Unable to delete issue set.",
			);
			return;
		}
		const remainingIssueSets = state.issueSets.filter(
			(entry) => entry.id !== issueSetId,
		);
		setState((current) => ({
			...current,
			issueSets: remainingIssueSets,
		}));
		if (editingIssueSetId === issueSetId) {
			closeForm();
		}
		if (activeIssueSetContextId === issueSetId) {
			onIssueSetContextChange?.(remainingIssueSets[0]?.id ?? null);
		}
		setExpandedIssueSetId((current) =>
			current === issueSetId ? null : current,
		);
		projectWorkflowSharedStateService.clear(project.id);
		showToast("success", "Issue set removed.");
	};

	const handleMarkIssued = async (issueSet: ProjectIssueSetRecord) => {
		const result = await projectIssueSetService.saveIssueSet(
			{
				projectId: issueSet.projectId,
				name: issueSet.name,
				issueTag: issueSet.issueTag,
				status: "issued",
				targetDate: issueSet.targetDate,
				transmittalNumber: issueSet.transmittalNumber,
				transmittalDocumentName: issueSet.transmittalDocumentName,
				registerSnapshotId: issueSet.registerSnapshotId,
				terminalScheduleSnapshotId: issueSet.terminalScheduleSnapshotId,
				summary: issueSet.summary,
				notes: issueSet.notes,
				selectedDrawingPaths: issueSet.selectedDrawingPaths,
				selectedRegisterRowIds: issueSet.selectedRegisterRowIds ?? [],
				selectedDrawingNumbers: issueSet.selectedDrawingNumbers ?? [],
				selectedPdfFileIds: issueSet.selectedPdfFileIds ?? [],
				snapshot: issueSet.snapshot,
			},
			issueSet.id,
		);
		if (!result.data) {
			showToast("error", "Unable to mark issue set as issued.");
			return;
		}
		const issuedIssueSet = result.data;
		setState((current) => ({
			...current,
			issueSets: [
				issuedIssueSet,
				...current.issueSets.filter((entry) => entry.id !== issuedIssueSet.id),
			],
		}));
		projectWorkflowSharedStateService.clear(project.id);
		onIssueSetContextChange?.(issuedIssueSet.id);
		showToast("success", "Issue set marked as issued.");
	};

	const packagePathSummary =
		currentSnapshot.reviewItemCount > 0
			? `${currentSnapshot.reviewItemCount} blocker${
					currentSnapshot.reviewItemCount === 1 ? "" : "s"
				} still need review before issue.`
			: "No blocking review items remain. You can move into standards and package assembly.";

	const linkedReceiptCount = useMemo(() => {
		const receiptNumbers = new Set(
			state.transmittalReceipts
				.map((receipt) => receipt.transmittalNumber?.trim().toUpperCase() || "")
				.filter(Boolean),
		);
		return state.issueSets.filter((issueSet) => {
			const number = issueSet.transmittalNumber?.trim().toUpperCase() || "";
			return Boolean(number && receiptNumbers.has(number));
		}).length;
	}, [state.issueSets, state.transmittalReceipts]);

	const linkedAutomationReceiptCount = useMemo(
		() =>
			state.issueSets.filter((issueSet) =>
				state.automationReceipts.some(
					(receipt) => (receipt.issueSetId || null) === issueSet.id,
				),
			).length,
		[state.automationReceipts, state.issueSets],
	);

	const evidenceSourceSummary = [
		linkedReceiptCount > 0
			? `${linkedReceiptCount} linked transmittal receipt${
					linkedReceiptCount === 1 ? "" : "s"
				}`
			: null,
		linkedAutomationReceiptCount > 0
			? `${linkedAutomationReceiptCount} automation receipt${
					linkedAutomationReceiptCount === 1 ? "" : "s"
				}`
			: null,
		state.standardsChecks.length > 0
			? `${state.standardsChecks.length} standards result${
					state.standardsChecks.length === 1 ? "" : "s"
				}`
			: null,
	]
		.filter((value): value is string => Boolean(value))
		.join(", ");

	const summaryNote =
		linkedReceiptCount > 0 ||
		linkedAutomationReceiptCount > 0 ||
		state.standardsChecks.length > 0
			? `${evidenceSourceSummary} already feed package evidence. ${currentSnapshot.unresolvedRevisionCount} open revision${
					currentSnapshot.unresolvedRevisionCount === 1 ? "" : "s"
				} remain, along with ${
					currentSnapshot.titleBlockReviewCount +
					currentSnapshot.standardsReviewCount
				} package review item${
					currentSnapshot.titleBlockReviewCount +
						currentSnapshot.standardsReviewCount ===
					1
						? ""
						: "s"
				} still needing decisions.`
			: `${currentSnapshot.trackedDrawingCount} tracked drawing${
					currentSnapshot.trackedDrawingCount === 1 ? "" : "s"
				} are already attributed to this project, with ${currentSnapshot.drawingCount} scanned drawing${
					currentSnapshot.drawingCount === 1 ? "" : "s"
				} in scope. Save a draft package to lock the current review snapshot.`;

	const drawingListHref = buildProjectIssueSetAppHref(
		"/app/apps/drawing-list-manager",
		project.id,
		activeIssueSetContextId,
	);
	const standardsHref = buildProjectIssueSetAppHref(
		"/app/apps/standards-checker",
		project.id,
		activeIssueSetContextId,
	);
	const transmittalHref = buildProjectIssueSetAppHref(
		"/app/apps/transmittal-builder",
		project.id,
		activeIssueSetContextId,
	);
	const watchdogHref = buildWatchdogHref(project.id, activeIssueSetContextId);

	const issueSetEvidencePackets = useMemo(
		() =>
			new Map(
				state.issueSets.map((issueSet) => [
					issueSet.id,
					buildProjectIssueSetEvidencePacket({
						project,
						issueSet,
						registerSnapshot: state.registerSnapshot,
						scanRows: availableDrawingRows,
						scanProfile: state.scan?.profile ?? null,
						scanArtifacts: state.scan?.artifacts ?? null,
						revisions: state.revisions,
						telemetry,
						standardsChecks: state.standardsChecks,
						nativeStandardsReview: state.nativeStandardsReview,
						decisions: state.decisions,
						transmittalReceipts: state.transmittalReceipts,
						automationReceipts: state.automationReceipts,
					}),
				]),
			),
		[
			availableDrawingRows,
			project,
			state.decisions,
			state.issueSets,
			state.nativeStandardsReview,
			state.registerSnapshot,
			state.revisions,
			state.scan,
			state.standardsChecks,
			state.automationReceipts,
			state.transmittalReceipts,
			telemetry,
		],
	);

	const exportEvidencePacket = (
		issueSet: ProjectIssueSetRecord,
		format: "md" | "json",
	) => {
		if (typeof window === "undefined") {
			return;
		}
		const packet = issueSetEvidencePackets.get(issueSet.id);
		if (!packet) {
			showToast("error", "Issue set evidence is not ready yet.");
			return;
		}
		const content =
			format === "json"
				? JSON.stringify(packet, null, 2)
				: renderProjectIssueSetEvidencePacketMarkdown(packet);
		const blob = new Blob([content], {
			type: format === "json" ? "application/json" : "text/markdown",
		});
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = buildEvidenceFileName(
			project.name,
			issueSet.issueTag || issueSet.name,
			format,
		);
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
		showToast(
			"success",
			format === "json"
				? "Evidence packet exported as JSON."
				: "Evidence packet exported.",
		);
	};

	return {
		state,
		editingIssueSetId,
		setEditingIssueSetId,
		expandedIssueSetId,
		setExpandedIssueSetId,
		showForm,
		setShowForm,
		form,
		setForm,
		activeIssueSetContextId,
		currentSnapshot,
		currentSnapshotState,
		availableDrawingRows,
		availableRegisterRows,
		hasRegisterRows,
		packagePathSummary,
		summaryNote,
		drawingListHref,
		standardsHref,
		transmittalHref,
		watchdogHref,
		issueSetEvidencePackets,
		openDraftFromCurrentProject,
		openEditIssueSet,
		closeForm,
		toggleSelectedDrawing,
		toggleSelectedRegisterRow,
		handleSave,
		handleDelete,
		handleMarkIssued,
		exportEvidencePacket,
	};
}

