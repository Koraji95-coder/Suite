import {
	ClipboardCheck,
	Download,
	FileCheck2,
	FilePenLine,
	ShieldCheck,
	Trash2,
	Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input, TextArea } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { buildProjectIssueSetAppHref } from "@/lib/projectWorkflowNavigation";
import { cn } from "@/lib/utils";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import {
	buildProjectIssueSetEvidencePacket,
	fetchProjectStandardsEvidence,
	renderProjectIssueSetEvidencePacketMarkdown,
} from "@/services/projectDeliveryEvidenceService";
import {
	type ProjectDocumentMetadataSnapshot,
	projectDocumentMetadataService,
} from "@/services/projectDocumentMetadataService";
import {
	type ProjectIssueSetInput,
	type ProjectIssueSetRecord,
	type ProjectIssueSetSnapshot,
	type ProjectIssueSetStatus,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import {
	type ProjectReviewDecisionRecord,
	projectReviewDecisionService,
} from "@/services/projectReviewDecisionService";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";
import {
	buildStandardsReviewDescriptor,
	buildTitleBlockReviewDescriptor,
} from "./projectReviewDescriptors";
import styles from "./ProjectIssueSetManager.module.css";
import type { Project, ViewMode } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

const ISSUE_SET_STATUS_OPTIONS: ProjectIssueSetStatus[] = [
	"draft",
	"review",
	"ready",
	"issued",
];

interface ProjectIssueSetManagerProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
	onOpenViewMode: (mode: ViewMode) => void;
}

interface ProjectIssueSetManagerState {
	loading: boolean;
	saving: boolean;
	scan: ProjectDocumentMetadataSnapshot | null;
	revisions: DrawingRevisionRegisterRow[];
	issueSets: ProjectIssueSetRecord[];
	standardsChecks: Awaited<
		ReturnType<typeof fetchProjectStandardsEvidence>
	>["data"];
	decisions: ProjectReviewDecisionRecord[];
	transmittalReceipts: Awaited<
		ReturnType<typeof projectTransmittalReceiptService.fetchReceipts>
	>["data"];
	messages: string[];
}

interface IssueSetFormState {
	name: string;
	issueTag: string;
	status: ProjectIssueSetStatus;
	targetDate: string;
	transmittalNumber: string;
	transmittalDocumentName: string;
	summary: string;
	notes: string;
	selectedDrawingPaths: string[];
}

const EMPTY_STATE: ProjectIssueSetManagerState = {
	loading: true,
	saving: false,
	scan: null,
	revisions: [],
	issueSets: [],
	standardsChecks: [],
	decisions: [],
	transmittalReceipts: [],
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

function buildEmptyForm(): IssueSetFormState {
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

function computeUnresolvedRevisionCount(
	revisions: DrawingRevisionRegisterRow[],
) {
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
	const standardsReviewCount = Math.max(
		0,
		actionableStandardsChecks.length - waivedStandardsCount,
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
		waivedStandardsCount,
	};
}

function getSnapshotState(snapshot: ProjectIssueSetSnapshot): TrustState {
	if (
		snapshot.reviewItemCount > 0 ||
		snapshot.selectedDrawingCount === 0 ||
		snapshot.drawingCount === 0
	) {
		return "needs-attention";
	}
	return "ready";
}

function formatRelativeDate(value: string | null) {
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

function formatTimestamp(value: string | null) {
	if (!value) {
		return "—";
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
	revisions: DrawingRevisionRegisterRow[];
	standardsChecks: Awaited<
		ReturnType<typeof fetchProjectStandardsEvidence>
	>["data"];
	decisions: ProjectReviewDecisionRecord[];
	telemetry: ProjectWatchdogTelemetry;
}): IssueSetFormState {
	const selectedDrawingPaths = (args.scan?.rows ?? []).map(
		(row) => row.relativePath,
	);
	const snapshot = buildSnapshot({
		project: args.project,
		telemetry: args.telemetry,
		scan: args.scan,
		revisions: args.revisions,
		standardsChecks: args.standardsChecks,
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
	};
}

function statusTone(
	status: ProjectIssueSetStatus,
): "default" | "warning" | "success" | "accent" {
	switch (status) {
		case "issued":
			return "success";
		case "ready":
			return "accent";
		case "review":
			return "warning";
		default:
			return "default";
	}
}

export function ProjectIssueSetManager({
	project,
	telemetry,
	preferredIssueSetId,
	onIssueSetContextChange,
	onOpenViewMode,
}: ProjectIssueSetManagerProps) {
	const { showToast } = useToast();
	const [state, setState] = useState<ProjectIssueSetManagerState>(EMPTY_STATE);
	const [editingIssueSetId, setEditingIssueSetId] = useState<string | null>(
		null,
	);
	const [expandedIssueSetId, setExpandedIssueSetId] = useState<string | null>(
		null,
	);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState<IssueSetFormState>(buildEmptyForm);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setState((current) => ({
				...current,
				loading: true,
				messages: [],
			}));

			const [
				issueSetsResult,
				revisionsResult,
				receiptsResult,
				decisionsResult,
				snapshotResult,
			] = await Promise.all([
					projectIssueSetService.fetchIssueSets(project.id),
					projectRevisionRegisterService.fetchEntries(project.id),
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

			setState((current) => ({
				...current,
				loading: false,
				scan: snapshotResult.data,
				revisions: revisionsResult.data,
				issueSets: issueSetsResult.data,
				standardsChecks: standardsResult.data,
				decisions: decisionsResult.data,
				transmittalReceipts: receiptsResult.data,
				messages: [
					...(issueSetsResult.error ? [issueSetsResult.error.message] : []),
					...(revisionsResult.error ? [revisionsResult.error.message] : []),
					...(receiptsResult.error ? [receiptsResult.error.message] : []),
					...(decisionsResult.error ? [decisionsResult.error.message] : []),
					...(standardsResult.error ? [standardsResult.error.message] : []),
					...(snapshotResult.error ? [snapshotResult.error.message] : []),
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

	const currentSnapshot = useMemo(
		() =>
			buildSnapshot({
				project,
				telemetry,
				scan: state.scan,
				revisions: state.revisions,
				standardsChecks: state.standardsChecks,
				decisions: state.decisions,
				issueSetId: activeIssueSetContextId,
				selectedDrawingPaths: (state.scan?.rows ?? []).map(
					(row) => row.relativePath,
				),
			}),
		[
			activeIssueSetContextId,
			project,
			state.decisions,
			state.revisions,
			state.scan,
			state.standardsChecks,
			telemetry,
		],
	);

	const currentSnapshotState = useMemo(
		() => getSnapshotState(currentSnapshot),
		[currentSnapshot],
	);

	const availableDrawingRows = state.scan?.rows ?? [];

	const openDraftFromCurrentProject = () => {
		setEditingIssueSetId(null);
		onIssueSetContextChange?.(null);
		setForm(
			buildDefaultDraft({
				project,
				issueSetCount: state.issueSets.length,
				scan: state.scan,
				revisions: state.revisions,
				standardsChecks: state.standardsChecks,
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
			summary: form.summary,
			notes: form.notes || null,
			selectedDrawingPaths: form.selectedDrawingPaths,
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
				summary: issueSet.summary,
				notes: issueSet.notes,
				selectedDrawingPaths: issueSet.selectedDrawingPaths,
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
	const summaryNote =
		linkedReceiptCount > 0 || state.standardsChecks.length > 0
			? `${linkedReceiptCount} linked receipt${
					linkedReceiptCount === 1 ? "" : "s"
				} and ${state.standardsChecks.length} standards result${
					state.standardsChecks.length === 1 ? "" : "s"
				} already feed package evidence. ${currentSnapshot.unresolvedRevisionCount} open revision${
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

	const issueSetEvidencePackets = useMemo(
		() =>
			new Map(
				state.issueSets.map((issueSet) => [
					issueSet.id,
					buildProjectIssueSetEvidencePacket({
						project,
						issueSet,
						scanRows: availableDrawingRows,
						revisions: state.revisions,
						telemetry,
						standardsChecks: state.standardsChecks,
						decisions: state.decisions,
						transmittalReceipts: state.transmittalReceipts,
					}),
				]),
			),
		[
			availableDrawingRows,
			project,
			state.decisions,
			state.issueSets,
			state.revisions,
			state.standardsChecks,
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

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Issue package workflow</p>
					<h4 className={styles.title}>Issue set manager</h4>
					<p className={styles.description}>
						Capture a package draft from the current project state, then track
						what was ready, selected, and issued without leaving the project.
					</p>
				</div>
				<TrustStateBadge state={currentSnapshotState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryTop}>
					<div className={styles.summaryMain}>
						<div className={styles.summaryHeader}>
							<div className={styles.summaryIconShell}>
								<ClipboardCheck className={styles.summaryIcon} />
							</div>
							<div>
								<h5 className={styles.summaryTitle}>Current package snapshot</h5>
								<p className={styles.summaryText}>{packagePathSummary}</p>
							</div>
						</div>
						<div className={styles.summaryFacts}>
							<div className={styles.summaryFact}>
								<span className={styles.summaryFactLabel}>Review blockers</span>
								<span className={styles.summaryFactValue}>
									{currentSnapshot.reviewItemCount} open in this package window
								</span>
							</div>
							<div className={styles.summaryFact}>
								<span className={styles.summaryFactLabel}>Saved issue sets</span>
								<span className={styles.summaryFactValue}>
									{state.issueSets.length} captured so far
								</span>
							</div>
						</div>
						<p className={styles.summaryNote}>{summaryNote}</p>
					</div>
					<div className={styles.summaryActions}>
						<Button
							variant="primary"
							size="md"
							iconRight={<ClipboardCheck size={16} />}
							onClick={openDraftFromCurrentProject}
						>
							Create draft from current project
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
							<Link
								to={buildWatchdogHref(project.id, activeIssueSetContextId)}
								className={styles.utilityLink}
							>
								<FileCheck2 className={styles.linkIcon} />
								<span>Watchdog</span>
							</Link>
							<button
								type="button"
								className={styles.utilityButton}
								onClick={() => onOpenViewMode("revisions")}
							>
								<FilePenLine className={styles.linkIcon} />
								<span>Revisions</span>
							</button>
						</div>
					</div>
				</div>

				<div className={styles.workflowDivider} />

				<div className={styles.issueSetHeader}>
					<div>
						<h5 className={styles.issueSetTitle}>Saved issue sets</h5>
						<p className={styles.issueSetCopy}>
							Each saved issue set keeps a snapshot of what was selected and how
							ready the project was at that moment.
						</p>
					</div>
					<Badge color="accent" variant="soft">
						{state.issueSets.length} total
					</Badge>
				</div>

				{state.loading ? (
					<div className={styles.emptyState}>Loading issue sets...</div>
				) : state.issueSets.length === 0 ? (
					<div className={styles.emptyState}>
						No issue sets saved yet. Create the first package draft from the
						current project state.
					</div>
				) : (
				<div className={styles.issueSetList}>
						{state.issueSets.map((issueSet) => {
							const packet = issueSetEvidencePackets.get(issueSet.id) ?? null;
							const isExpanded = expandedIssueSetId === issueSet.id;
							const linkedReceipt = packet?.transmittal.linkedReceipt ?? null;
							const receiptSummary = linkedReceipt
								? linkedReceipt.transmittalNumber || "Linked receipt"
								: issueSet.transmittalNumber || "Not linked";
							const selectedDrawingSummary = packet
								? packet.selectedDrawings
										.slice(0, 3)
										.map(
											(drawing) => drawing.drawingNumber || drawing.fileName,
										)
										.join(", ")
								: "";
							const watchdogSummary = packet?.watchdog.drawings[0]
								? `${packet.watchdog.matchedTrackedCount} tracked drawing${
										packet.watchdog.matchedTrackedCount === 1 ? "" : "s"
								  } • last worked ${formatTimestamp(
										packet.watchdog.drawings[0].lastWorkedAt,
								  )}`
								: "No tracked drawing history yet";

							return (
								<div key={issueSet.id} className={styles.issueSetCard}>
									<div className={styles.issueSetCardHeader}>
										<div>
											<div className={styles.issueSetTitleRow}>
												<h6 className={styles.issueSetCardTitle}>
													{issueSet.name}
												</h6>
												<div className={styles.badgeRow}>
													<Badge
														color={statusTone(issueSet.status)}
														variant="soft"
													>
														{issueSet.status}
													</Badge>
													<Badge color="accent" variant="soft">
														{issueSet.issueTag}
													</Badge>
												</div>
											</div>
											<p className={styles.issueSetMeta}>
												Target {formatRelativeDate(issueSet.targetDate)} •
												Updated {formatTimestamp(issueSet.updatedAt)}
												{issueSet.issuedAt
													? ` • Issued ${formatTimestamp(issueSet.issuedAt)}`
													: ""}
											</p>
										</div>
										<div className={styles.issueSetActions}>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => openEditIssueSet(issueSet)}
											>
												Edit
											</Button>
											{issueSet.status !== "issued" ? (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														void handleMarkIssued(issueSet);
													}}
												>
													Mark issued
												</Button>
											) : null}
											<Button
												variant="ghost"
												size="sm"
												iconRight={<Trash2 size={14} />}
												onClick={() => {
													void handleDelete(issueSet.id);
												}}
											>
												Delete
											</Button>
										</div>
									</div>

									<p className={styles.issueSetSummary}>
										{issueSet.summary || "No summary recorded."}
									</p>

									<div className={styles.issueSetFactRow}>
										<span className={styles.issueSetFact}>
											<strong>{issueSet.snapshot.selectedDrawingCount}</strong>{" "}
											drawing{issueSet.snapshot.selectedDrawingCount === 1 ? "" : "s"}
										</span>
										<span className={styles.issueSetFact}>
											<strong>{issueSet.snapshot.reviewItemCount}</strong>{" "}
											blocker{issueSet.snapshot.reviewItemCount === 1 ? "" : "s"}
										</span>
										<span className={styles.issueSetFact}>
											<strong>{receiptSummary}</strong> receipt
										</span>
									</div>

									{packet ? (
										<p className={styles.issueSetEvidenceSummary}>
											<span>
												<strong>Title block review</strong>{" "}
												{packet.reviewDecisions.acceptedTitleBlockCount > 0
													? `${packet.reviewDecisions.acceptedTitleBlockCount} accepted • `
													: ""}
												{packet.titleBlock.needsReviewCount > 0
													? `${packet.titleBlock.needsReviewCount} need review`
													: `${packet.titleBlock.readyCount} ready`}
												{packet.titleBlock.fallbackCount > 0
													? ` • ${packet.titleBlock.fallbackCount} fallback`
													: ""}
											</span>
											<span>
												<strong>Standards</strong>{" "}
												{packet.standards.matchedDrawingCount > 0
													? `${
															packet.reviewDecisions.waivedStandardsCount > 0
																? `${packet.reviewDecisions.waivedStandardsCount} waived • `
																: ""
														}${packet.standards.passCount} pass • ${packet.standards.warningCount} warn • ${packet.standards.failCount} fail`
													: "No linked checks yet"}
											</span>
											<span>
												<strong>Transmittal</strong>{" "}
												{linkedReceipt
													? `${receiptSummary} • ${linkedReceipt.outputs.length} output${
															linkedReceipt.outputs.length === 1 ? "" : "s"
														}`
													: issueSet.transmittalDocumentName
														? `Manual reference • ${issueSet.transmittalDocumentName}`
														: "No linked receipt yet"}
											</span>
											<span>
												<strong>Watchdog</strong>{" "}
												{packet.watchdog.matchedTrackedCount > 0
													? `${packet.watchdog.matchedTrackedCount} tracked drawing${
															packet.watchdog.matchedTrackedCount === 1 ? "" : "s"
														}`
													: "No tracked drawing history yet"}
											</span>
										</p>
									) : null}

									{issueSet.notes ? (
										<div className={styles.issueSetNotes}>{issueSet.notes}</div>
									) : null}
									{packet && isExpanded ? (
										<div className={styles.issueSetDetailPanel}>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Package scope
												</span>
												<span className={styles.issueSetDetailValue}>
													{selectedDrawingSummary ||
														"No selected drawings captured."}
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Title block review
												</span>
												<span className={styles.issueSetDetailValue}>
													{packet.titleBlock.readyCount} ready •{" "}
													{packet.titleBlock.needsReviewCount} need review •{" "}
													{packet.reviewDecisions.acceptedTitleBlockCount} accepted
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Standards
												</span>
												<span className={styles.issueSetDetailValue}>
													{packet.standards.passCount} pass •{" "}
													{packet.standards.warningCount} warn •{" "}
													{packet.standards.failCount} fail •{" "}
													{packet.reviewDecisions.waivedStandardsCount} waived
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Transmittal
												</span>
												<span className={styles.issueSetDetailValue}>
													{linkedReceipt
														? `${receiptSummary} • ${
																linkedReceipt.outputs.length
														  } output${
																linkedReceipt.outputs.length === 1 ? "" : "s"
														  }`
														: issueSet.transmittalDocumentName ||
															"No linked receipt yet"}
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Watchdog
												</span>
												<span className={styles.issueSetDetailValue}>
													{watchdogSummary}
												</span>
											</div>
										</div>
									) : null}
									<div className={styles.issueSetFooterActions}>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												onIssueSetContextChange?.(issueSet.id);
												setExpandedIssueSetId((current) =>
													current === issueSet.id ? null : issueSet.id,
												);
											}}
										>
											{isExpanded ? "Hide details" : "View details"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											iconRight={<Download size={14} />}
											onClick={() => exportEvidencePacket(issueSet, "md")}
										>
											Export packet
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => exportEvidencePacket(issueSet, "json")}
										>
											Export JSON
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>

			{showForm ? (
				<Panel variant="support" padding="lg" className={styles.formPanel}>
					<div className={styles.formHeader}>
						<div>
							<h5 className={styles.formTitle}>
								{editingIssueSetId ? "Edit issue set" : "New issue set"}
							</h5>
							<p className={styles.formCopy}>
								Save the package snapshot now, then refine standards,
								transmittal, and issuance details as the project closes review
								items.
							</p>
						</div>
						<Button variant="ghost" size="sm" onClick={closeForm}>
							Cancel
						</Button>
					</div>

					<div className={styles.formGrid}>
						<Input
							label="Issue set name"
							value={form.name}
							onChange={(event) =>
								setForm((current) => ({ ...current, name: event.target.value }))
							}
							placeholder="Nanulak IFC package"
						/>
						<Input
							label="Issue tag"
							value={form.issueTag}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									issueTag: event.target.value,
								}))
							}
							placeholder="IFC-01"
						/>
						<Input
							label="Target date"
							type="date"
							value={form.targetDate}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									targetDate: event.target.value,
								}))
							}
						/>
						<label className={styles.field}>
							<span className={styles.label}>Status</span>
							<select
								className={styles.select}
								value={form.status}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										status: event.target.value as ProjectIssueSetStatus,
									}))
								}
							>
								{ISSUE_SET_STATUS_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<Input
							label="Transmittal number"
							value={form.transmittalNumber}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									transmittalNumber: event.target.value,
								}))
							}
							placeholder="XMTL-001"
						/>
						<Input
							label="Transmittal document"
							value={form.transmittalDocumentName}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									transmittalDocumentName: event.target.value,
								}))
							}
							placeholder="Issued package cover sheet"
						/>
						<div className={cn(styles.fieldWide, styles.selectedSummary)}>
							<div className={styles.selectedSummaryHeader}>
								<span className={styles.label}>Included drawings</span>
								<Badge color="accent" variant="soft">
									{form.selectedDrawingPaths.length} selected
								</Badge>
							</div>
							{availableDrawingRows.length === 0 ? (
								<p className={styles.inlineHint}>
									Run the drawing scan first to select package drawings.
								</p>
							) : (
								<div className={styles.checkboxGrid}>
									{availableDrawingRows.map((row) => (
										<label
											key={row.id}
											className={styles.checkboxRow}
											htmlFor={`issue-set-drawing-${row.id}`}
										>
											<input
												id={`issue-set-drawing-${row.id}`}
												type="checkbox"
												checked={form.selectedDrawingPaths.includes(
													row.relativePath,
												)}
												onChange={() => toggleSelectedDrawing(row.relativePath)}
											/>
											<span>{row.fileName}</span>
										</label>
									))}
								</div>
							)}
						</div>
						<div className={styles.fieldWide}>
							<TextArea
								label="Summary"
								minRows={3}
								value={form.summary}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										summary: event.target.value,
									}))
								}
								placeholder="What this package is for and what still needs review."
							/>
						</div>
						<div className={styles.fieldWide}>
							<TextArea
								label="Notes"
								minRows={4}
								value={form.notes}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										notes: event.target.value,
									}))
								}
								placeholder="Customer issue notes, package caveats, or follow-up tasks."
							/>
						</div>
					</div>

					<div className={styles.formActions}>
						<Button
							variant="primary"
							size="sm"
							loading={state.saving}
							onClick={() => {
								void handleSave();
							}}
						>
							{editingIssueSetId ? "Save issue set" : "Create issue set"}
						</Button>
					</div>
				</Panel>
			) : null}

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
