import {
	CheckCircle2,
	HardDriveDownload,
	RefreshCw,
	Server,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import styles from "./AutoDraftStudioApp.module.css";
import {
	type AutoDraftRule,
	MIGRATION_BREAKDOWN,
	PIPELINE_STEPS,
	RULE_LIBRARY,
	TRAINING_PHASES,
} from "./autodraftData";
import {
	type AutoDraftHealth,
	type AutoDraftBackcheckResponse,
	type AutoDraftExecuteResponse,
	type AutoDraftExecuteRevisionContext,
	type AutoDraftExecuteWorkflowContext,
	type AutoDraftPlanResponse,
	autoDraftService,
} from "./autodraftService";
import { agentService } from "@/services/agentService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import {
	detectArcsFromSegments,
	extendDeadEndSegments,
	type Segment,
} from "./engine/pdfToCadGeometry";
import { AutoDraftComparePanel } from "./AutoDraftComparePanel";
import {
	buildAutoDraftCommitReview,
} from "./autodraftCommitReview";
import {
	buildAutoDraftExecutionIssueSummary,
	buildAutoDraftRevisionTraceNotes,
	summarizeAutoDraftExecution,
} from "./autodraftExecutionTraceSummary";

type TabId = "architecture" | "rules" | "pipeline" | "training";

const TABS: Array<{ id: TabId; label: string; icon: string; hint: string }> = [
	{
		id: "architecture",
		label: "Architecture",
		icon: "\u{25C6}",
		hint: "Service boundaries, migration lanes, and geometry translation status.",
	},
	{
		id: "rules",
		label: "Rule Library",
		icon: "\u{2699}",
		hint: "Deterministic markup-to-action rules with confidence and triggers.",
	},
	{
		id: "pipeline",
		label: "Pipeline",
		icon: "\u{25B8}",
		hint: "End-to-end workflow from Bluebeam markup extraction to CAD execution.",
	},
	{
		id: "training",
		label: "Training Path",
		icon: "\u{25CE}",
		hint: "Local model evolution path for markup and replacement learning.",
	},
];

const DEMO_MARKUPS = [
	{ type: "cloud", color: "green", text: "DELETE BUS DUCT A3" },
	{ type: "cloud", color: "red", text: "Add grounding strap" },
	{ type: "text", color: "blue", text: "Coordinate with field install notes" },
	{ type: "arrow", color: "blue", text: "swap this with RP1L5-4" },
];

const DEMO_SEGMENTS: Segment[] = [
	{ x1: 0, y1: 0, x2: 10, y2: 2 },
	{ x1: 10, y1: 2, x2: 18, y2: 8 },
	{ x1: 18, y1: 8, x2: 20, y2: 16 },
	{ x1: 20, y1: 16, x2: 18, y2: 24 },
	{ x1: 18, y1: 24, x2: 10, y2: 30 },
	{ x1: 10, y1: 30, x2: 0, y2: 32 },
	{ x1: 0, y1: 32, x2: -8, y2: 30 },
	{ x1: -8, y1: 30, x2: -16, y2: 24 },
	{ x1: -16, y1: 24, x2: -18, y2: 16 },
	{ x1: -18, y1: 16, x2: -16, y2: 8 },
	{ x1: -16, y1: 8, x2: -8, y2: 2 },
	{ x1: -8, y1: 2, x2: 0, y2: 0 },
	{ x1: 28, y1: 16, x2: 32, y2: 16 },
	{ x1: 34.5, y1: 16, x2: 40, y2: 16 },
];

const STATUS_BADGE_BY_CATEGORY: Record<
	AutoDraftRule["category"],
	"danger" | "success" | "primary" | "warning" | "default"
> = {
	DELETE: "danger",
	ADD: "success",
	NOTE: "primary",
	SWAP: "warning",
	TITLE_BLOCK: "default",
	BLOCK_REF: "default",
	REVISION_CLOUD: "warning",
	DIMENSION: "default",
};

type CrewReviewProfile = "draftsmith" | "gridsage";

type CrewReviewEntry = {
	profileId: CrewReviewProfile;
	status: "running" | "completed" | "failed";
	response?: string;
	error?: string;
};

type ExecuteMode = "preview" | "commit";
type ProjectContextOption = Pick<
	Database["public"]["Tables"]["projects"]["Row"],
	"id" | "name" | "status" | "category" | "color"
>;
type ProjectFileContextOption = Pick<
	Database["public"]["Tables"]["files"]["Row"],
	"id" | "name" | "file_path" | "project_id"
>;

function deriveRevisionMetadataFromFileName(fileName: string) {
	const baseName = fileName.replace(/\.[^/.]+$/, "");
	const numberMatch = baseName.match(
		/^((?:R3P-[A-Z0-9]{3,6})-[A-Z0-9]{1,4}-[A-Z0-9]{3}-\d{3})(?:\s+([A-Z0-9]+))?(?:[-_ ]+(.*))?$/i,
	);
	if (!numberMatch) {
		return {
			drawingNumber: "",
			revision: "",
			title: baseName.replace(/[_-]+/g, " ").trim(),
		};
	}
	return {
		drawingNumber: numberMatch[1].trim(),
		revision: (numberMatch[2] || "").trim(),
		title: (numberMatch[3] || "").replace(/[_-]+/g, " ").trim(),
	};
}

function extractAgentResponseText(data: Record<string, unknown> | undefined): string {
	if (!data) return "";
	const directKeys = ["response", "reply", "output", "message"] as const;
	for (const key of directKeys) {
		const value = data[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return JSON.stringify(data);
}

function buildCrewReviewPrompt(args: {
	profileId: CrewReviewProfile;
	backcheck: AutoDraftBackcheckResponse;
	draftsmithReview?: string;
}): string {
	const { profileId, backcheck, draftsmithReview } = args;
	const header =
		profileId === "draftsmith"
			? "Review this AutoDraft backcheck as the CAD drafting specialist."
			: "Review this AutoDraft backcheck as the electrical engineering QA specialist.";
	const draftsmithContext = draftsmithReview?.trim()
		? `Draftsmith review:\n${draftsmithReview}`
		: "";

	return [
		header,
		"Return concise implementation guidance with concrete fix steps and validation checkpoints.",
		"Focus on actionable items that improve Bluebeam markup interpretation and CAD execution safety.",
		`Backcheck summary: ${JSON.stringify(backcheck.summary)}`,
		`CAD status: ${JSON.stringify(backcheck.cad)}`,
		`Warnings: ${JSON.stringify(backcheck.warnings)}`,
		`Findings: ${JSON.stringify(backcheck.findings)}`,
		draftsmithContext,
	]
		.filter(Boolean)
		.join("\n\n");
}

export function AutoDraftStudioApp() {
	const { showToast } = useToast();
	const [activeTab, setActiveTab] = useState<TabId>("architecture");
	const [expandedRule, setExpandedRule] = useState<string | null>(null);
	const [expandedPhase, setExpandedPhase] = useState<number>(0);
	const [health, setHealth] = useState<AutoDraftHealth | null>(null);
	const [rules, setRules] = useState<AutoDraftRule[]>(RULE_LIBRARY);
	const [rulesSource, setRulesSource] = useState<"local" | "backend">("local");
	const [planResult, setPlanResult] = useState<AutoDraftPlanResponse | null>(
		null,
	);
	const [executeResult, setExecuteResult] =
		useState<AutoDraftExecuteResponse | null>(null);
	const [executeError, setExecuteError] = useState<string | null>(null);
	const [backcheckResult, setBackcheckResult] =
		useState<AutoDraftBackcheckResponse | null>(null);
	const [backcheckError, setBackcheckError] = useState<string | null>(null);
	const [executeOverrideReason, setExecuteOverrideReason] = useState("");
	const [workflowContext, setWorkflowContext] =
		useState<AutoDraftExecuteWorkflowContext>({
			lane: "autodraft-studio",
			phase: "demo",
		});
	const [revisionContext, setRevisionContext] =
		useState<AutoDraftExecuteRevisionContext>({
			projectId: "",
			fileId: "",
			drawingNumber: "",
			title: "",
			revision: "",
			previousRevision: "",
			issueSummary: "AutoDraft execution receipt recorded from Studio.",
			notes: "",
		});
	const [revisionTraceMessage, setRevisionTraceMessage] = useState<string | null>(
		null,
	);
	const [projectOptions, setProjectOptions] = useState<ProjectContextOption[]>([]);
	const [projectFiles, setProjectFiles] = useState<ProjectFileContextOption[]>([]);
	const [crewReviewEntries, setCrewReviewEntries] = useState<CrewReviewEntry[]>(
		[],
	);
	const [crewReviewError, setCrewReviewError] = useState<string | null>(null);
	const [commitReviewAcknowledged, setCommitReviewAcknowledged] =
		useState(false);
	const [lastPreviewReviewKey, setLastPreviewReviewKey] = useState<string | null>(
		null,
	);
	const [loadingPlan, setLoadingPlan] = useState(false);
	const [loadingExecute, setLoadingExecute] = useState(false);
	const [loadingBackcheck, setLoadingBackcheck] = useState(false);
	const [loadingCrewReview, setLoadingCrewReview] = useState(false);
	const [loadingHealth, setLoadingHealth] = useState(false);
	const activeTabConfig = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
	const executionSummary = useMemo(
		() => summarizeAutoDraftExecution(executeResult),
		[executeResult],
	);
	const selectedProjectId =
		revisionContext.projectId?.trim() || workflowContext.projectId?.trim() || "";
	const selectedProject = useMemo(
		() => projectOptions.find((project) => project.id === selectedProjectId) ?? null,
		[projectOptions, selectedProjectId],
	);
	const selectedFile = useMemo(
		() =>
			projectFiles.find((file) => file.id === (revisionContext.fileId?.trim() || "")) ??
			null,
		[projectFiles, revisionContext.fileId],
	);
	const commitReview = useMemo(
		() => buildAutoDraftCommitReview(planResult?.actions ?? [], revisionContext),
		[planResult?.actions, revisionContext],
	);
	const commitReviewResetKey = useMemo(
		() =>
			commitReview.items
				.map((item) => `${item.id}:${item.status}:${item.target}:${item.reason}`)
				.join("|"),
		[commitReview.items],
	);
	const lastCommitReviewResetKeyRef = useRef(commitReviewResetKey);
	const previewIsCurrent =
		lastPreviewReviewKey !== null && lastPreviewReviewKey === commitReviewResetKey;
	const commitCanRun =
		commitReview.readyCount > 0 && commitReviewAcknowledged && previewIsCurrent;

	const translatedGeometryStats = useMemo(() => {
		const arcResult = detectArcsFromSegments(DEMO_SEGMENTS, {
			detectArcs: true,
			arcMaxRelativeError: 0.12,
		});
		const extendedSegments = extendDeadEndSegments(
			arcResult.remainingSegments,
			{
				extendLines: true,
				extendMaxPt: 8,
				joinTolerancePt: 2,
			},
		);

		return {
			inputSegments: DEMO_SEGMENTS.length,
			arcsDetected: arcResult.arcs.length,
			remainingSegments: arcResult.remainingSegments.length,
			extendedSegments: extendedSegments.length,
		};
	}, []);

	const refreshStatus = useCallback(async () => {
		setLoadingHealth(true);
		try {
			const [nextHealth, nextRules] = await Promise.all([
				autoDraftService.health(),
				autoDraftService.listRules(),
			]);
			setHealth(nextHealth);
			if (nextRules.length > 0) {
				setRules(nextRules);
				setRulesSource("backend");
			} else {
				setRules(RULE_LIBRARY);
				setRulesSource("local");
			}
		} finally {
			setLoadingHealth(false);
		}
	}, []);

	useEffect(() => {
		void refreshStatus();
	}, [refreshStatus]);

	useEffect(() => {
		let cancelled = false;
		const loadProjectOptions = async () => {
			const {
				data: { user },
				error: authError,
			} = await supabase.auth.getUser();
			if (cancelled) return;
			if (authError || !user) {
				setProjectOptions([]);
				return;
			}

			const { data, error } = await supabase
				.from("projects")
				.select("id, name, status, category, color")
				.eq("user_id", user.id)
				.order("created_at", { ascending: false });

			if (cancelled) return;
			if (error) {
				showToast(
					"warning",
					"Project context is unavailable. Execution can still run without revision linking.",
				);
				setProjectOptions([]);
				return;
			}

			setProjectOptions(data ?? []);
		};

		void loadProjectOptions();
		return () => {
			cancelled = true;
		};
	}, [showToast]);

	useEffect(() => {
		let cancelled = false;
		if (!selectedProjectId) {
			setProjectFiles([]);
			return;
		}

		const loadProjectFiles = async () => {
			const { data, error } = await supabase
				.from("files")
				.select("id, name, file_path, project_id")
				.eq("project_id", selectedProjectId)
				.order("uploaded_at", { ascending: false });
			if (cancelled) return;
			if (error) {
				setProjectFiles([]);
				return;
			}
			setProjectFiles(data ?? []);
		};

		void loadProjectFiles();
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId]);

	useEffect(() => {
		if (lastCommitReviewResetKeyRef.current !== commitReviewResetKey) {
			lastCommitReviewResetKeyRef.current = commitReviewResetKey;
			setCommitReviewAcknowledged(false);
		}
	}, [commitReviewResetKey]);

	const buildWorkflowContext = (): AutoDraftExecuteWorkflowContext | undefined => {
		const next: AutoDraftExecuteWorkflowContext = {
			projectId: workflowContext.projectId?.trim(),
			projectName: workflowContext.projectName?.trim(),
			lane: workflowContext.lane?.trim(),
			phase: workflowContext.phase?.trim(),
			workflowId: workflowContext.workflowId?.trim(),
			itemId: workflowContext.itemId?.trim(),
			summary: workflowContext.summary?.trim(),
		};
		return Object.values(next).some(Boolean) ? next : undefined;
	};

	const buildRevisionContext = (): AutoDraftExecuteRevisionContext | undefined => {
		const fallbackProjectId = workflowContext.projectId?.trim();
		const next: AutoDraftExecuteRevisionContext = {
			projectId: revisionContext.projectId?.trim() || fallbackProjectId,
			fileId: revisionContext.fileId?.trim(),
			drawingNumber: revisionContext.drawingNumber?.trim(),
			title: revisionContext.title?.trim(),
			revision: revisionContext.revision?.trim(),
			previousRevision: revisionContext.previousRevision?.trim(),
			issueSummary: revisionContext.issueSummary?.trim(),
			notes: revisionContext.notes?.trim(),
		};
		return Object.values(next).some(Boolean) ? next : undefined;
	};

	const persistRevisionTrace = useCallback(
		async (
			executed: AutoDraftExecuteResponse,
			mode: ExecuteMode,
			revisionPayload: AutoDraftExecuteRevisionContext | undefined,
		) => {
			if (mode !== "commit" || executed.dry_run || executed.accepted <= 0) {
				setRevisionTraceMessage(null);
				return;
			}
			const resolvedProjectId = revisionPayload?.projectId?.trim();
			const requestId =
				executed.requestId?.trim() ||
				executed.meta?.requestId?.trim() ||
				executed.meta?.executionReceipt?.requestId?.trim();
			if (!resolvedProjectId || !requestId) {
				setRevisionTraceMessage(
					"Commit receipt stored locally. Add a project id in trace context to link it into the revision register.",
				);
				return;
			}
			const receipt = executed.meta?.executionReceipt;
			const status = executed.status.trim();
			const notes = buildAutoDraftRevisionTraceNotes({
				response: executed,
				workflowContext,
				revisionContext: revisionPayload,
			});
			const row = await projectRevisionRegisterService.upsertAutoDraftExecutionEntry({
				projectId: resolvedProjectId,
				fileId: revisionPayload?.fileId?.trim() || null,
				drawingNumber: revisionPayload?.drawingNumber?.trim(),
				title: revisionPayload?.title?.trim(),
				revision: revisionPayload?.revision?.trim(),
				previousRevision: revisionPayload?.previousRevision?.trim() || null,
				issueSummary:
					revisionPayload?.issueSummary?.trim() ||
					buildAutoDraftExecutionIssueSummary(executed),
				notes,
				requestId,
				sourceRef: receipt?.id || executed.job_id || null,
				status,
				accepted: executed.accepted,
				skipped: executed.skipped,
			});
			if (row) {
				const message = `Linked commit receipt to revision register for project ${resolvedProjectId}.`;
				setRevisionTraceMessage(message);
				showToast("success", message);
				return;
			}
			const message =
				"Commit receipt stored, but the revision register link could not be created.";
			setRevisionTraceMessage(message);
			showToast("warning", message);
		},
		[showToast, workflowContext],
	);

	const runDemoPlan = async () => {
		setLoadingPlan(true);
		setExecuteResult(null);
		setExecuteError(null);
		setBackcheckResult(null);
		setBackcheckError(null);
		setExecuteOverrideReason("");
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		try {
			const planned = await autoDraftService.plan(DEMO_MARKUPS);
			setPlanResult(planned);
		} catch {
			setPlanResult(null);
		} finally {
			setLoadingPlan(false);
		}
	};

	const runDemoExecute = async (mode: ExecuteMode) => {
		setLoadingExecute(true);
		setExecuteResult(null);
		setExecuteError(null);
		setRevisionTraceMessage(null);
		try {
			const plan = planResult ?? (await autoDraftService.plan(DEMO_MARKUPS));
			if (!planResult) {
				setPlanResult(plan);
			}
			if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
				setExecuteError("No actions available to execute.");
				return;
			}
			const hasFailingBackcheck = (backcheckResult?.summary.fail_count || 0) > 0;
			const backcheckFailCount = backcheckResult?.summary.fail_count || 0;
			const overrideReason = executeOverrideReason.trim();
			if (hasFailingBackcheck && !overrideReason) {
				setExecuteError(
					"Backcheck contains failing actions. Enter an override reason to run execute.",
				);
				return;
			}
			if (mode === "commit") {
				if (commitReview.readyCount <= 0) {
					setExecuteError(
						"No commit-ready targets are currently resolved. Review the plan or add missing revision context first.",
					);
					return;
				}
				if (!previewIsCurrent) {
					setExecuteError(
						"Run preview execute on the current plan before committing to CAD.",
					);
					return;
				}
				if (!commitReviewAcknowledged) {
					setExecuteError(
						"Review and confirm the commit targets before writing to CAD.",
					);
					return;
				}
			}
			const workflowPayload = buildWorkflowContext();
			const revisionPayload = buildRevisionContext();

			const executed = await autoDraftService.execute(plan.actions, {
				dryRun: mode !== "commit",
				backcheckRequestId: backcheckResult?.requestId || undefined,
				backcheckOverrideReason: hasFailingBackcheck
					? overrideReason || undefined
					: undefined,
				backcheckFailCount,
				workflowContext: workflowPayload,
				revisionContext: revisionPayload,
			});
			setExecuteResult(executed);
			if (mode === "preview" && executed.ok) {
				setLastPreviewReviewKey(commitReviewResetKey);
			}
			await persistRevisionTrace(executed, mode, revisionPayload);
		} catch (error) {
			const message =
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: "Execution request failed.";
			setExecuteError(message);
		} finally {
			setLoadingExecute(false);
		}
	};

	const runDemoBackcheck = async () => {
		setLoadingBackcheck(true);
		setBackcheckResult(null);
		setBackcheckError(null);
		setExecuteOverrideReason("");
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		try {
			const plan = planResult ?? (await autoDraftService.plan(DEMO_MARKUPS));
			if (!planResult) {
				setPlanResult(plan);
			}
			if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
				setBackcheckError("No actions available to backcheck.");
				return;
			}
			const checked = await autoDraftService.backcheck(plan.actions);
			setBackcheckResult(checked);
		} catch (error) {
			const message =
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: "Backcheck request failed.";
			setBackcheckError(message);
		} finally {
			setLoadingBackcheck(false);
		}
	};

	const runCadCrewReview = async () => {
		if (!backcheckResult) {
			setCrewReviewError("Run backcheck first before requesting CAD crew review.");
			return;
		}

		setLoadingCrewReview(true);
		setCrewReviewError(null);
		setCrewReviewEntries([]);

		const entries: CrewReviewEntry[] = [];
		try {
			entries.push({ profileId: "draftsmith", status: "running" });
			setCrewReviewEntries([...entries]);
			const draftsmithResult = await agentService.sendMessage(
				buildCrewReviewPrompt({
					profileId: "draftsmith",
					backcheck: backcheckResult,
				}),
				{
					profileId: "draftsmith",
					promptMode: "template",
					templateLabel: "AutoDraft backcheck review",
				},
			);
			if (!draftsmithResult.success) {
				entries[0] = {
					profileId: "draftsmith",
					status: "failed",
					error: draftsmithResult.error || "Draftsmith review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[0].error || "Draftsmith review failed.");
				return;
			}
			const draftsmithText = extractAgentResponseText(draftsmithResult.data);
			entries[0] = {
				profileId: "draftsmith",
				status: "completed",
				response: draftsmithText,
			};
			entries.push({ profileId: "gridsage", status: "running" });
			setCrewReviewEntries([...entries]);

			const gridsageResult = await agentService.sendMessage(
				buildCrewReviewPrompt({
					profileId: "gridsage",
					backcheck: backcheckResult,
					draftsmithReview: draftsmithText,
				}),
				{
					profileId: "gridsage",
					promptMode: "template",
					templateLabel: "AutoDraft electrical QA review",
				},
			);
			if (!gridsageResult.success) {
				entries[1] = {
					profileId: "gridsage",
					status: "failed",
					error: gridsageResult.error || "GridSage review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[1].error || "GridSage review failed.");
				return;
			}

			entries[1] = {
				profileId: "gridsage",
				status: "completed",
				response: extractAgentResponseText(gridsageResult.data),
			};
			setCrewReviewEntries([...entries]);
		} finally {
			setLoadingCrewReview(false);
		}
	};

	const exportBackcheckReport = () => {
		if (!backcheckResult) return;
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const payload = JSON.stringify(backcheckResult, null, 2);
		const blob = new Blob([payload], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `autodraft-backcheck-${stamp}.json`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	};

	const handleProjectSelection = (nextValue: string) => {
		const normalizedProjectId = nextValue.trim();
		const nextProject =
			projectOptions.find((project) => project.id === normalizedProjectId) ?? null;
		setWorkflowContext((prev) => ({
			...prev,
			projectId: normalizedProjectId,
			projectName: nextProject?.name ?? "",
		}));
		setRevisionContext((prev) => ({
			...prev,
			projectId: normalizedProjectId,
			fileId: "",
		}));
	};

	const handleProjectFileSelection = (nextValue: string) => {
		const normalizedFileId = nextValue.trim();
		const nextFile =
			projectFiles.find((file) => file.id === normalizedFileId) ?? null;
		const parsed = nextFile
			? deriveRevisionMetadataFromFileName(nextFile.name)
			: null;

		setRevisionContext((prev) => ({
			...prev,
			fileId: normalizedFileId,
			drawingNumber:
				prev.drawingNumber?.trim() || !parsed?.drawingNumber
					? prev.drawingNumber
					: parsed.drawingNumber,
			title:
				prev.title?.trim() ||
				!parsed ||
				!nextFile
					? prev.title
					: parsed.title || nextFile.name.replace(/\.[^/.]+$/, ""),
			revision:
				prev.revision?.trim() || !parsed?.revision ? prev.revision : parsed.revision,
		}));
	};

	return (
		<div className={styles.page}>
			<Panel variant="default" padding="lg" className={styles.headerPanel}>
				<div className={styles.headerRow}>
					<div>
						<HStack gap={2} align="center">
							<Text as="h1" size="2xl" weight="bold">
								AutoDraft Studio
							</Text>
							<Badge color="primary" variant="soft">
								New App
							</Badge>
						</HStack>
						<Text size="sm" color="muted">
							Bluebeam markup recognition and CAD action planning through a
							.NET-ready API pipeline.
						</Text>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void refreshStatus()}
						iconLeft={<RefreshCw size={14} />}
						loading={loadingHealth}
					>
						Refresh status
					</Button>
				</div>

				<div className={styles.statusGrid}>
					<Panel variant="inset" padding="md" className={styles.statusCard}>
						<HStack gap={2} align="center">
							<Server size={14} />
							<Text size="sm" weight="semibold">
								Backend
							</Text>
						</HStack>
						<Text size="sm" color={health?.ok ? "success" : "danger"}>
							{health?.ok ? "Online" : "Unavailable"}
						</Text>
					</Panel>

					<Panel variant="inset" padding="md" className={styles.statusCard}>
						<HStack gap={2} align="center">
							<Sparkles size={14} />
							<Text size="sm" weight="semibold">
								Rule Source
							</Text>
						</HStack>
						<Text size="sm">
							{rulesSource === "backend" ? "Backend rules" : "Local seed rules"}
						</Text>
					</Panel>

					<Panel variant="inset" padding="md" className={styles.statusCard}>
						<HStack gap={2} align="center">
							{health?.dotnet?.reachable ? (
								<CheckCircle2 size={14} />
							) : (
								<TriangleAlert size={14} />
							)}
							<Text size="sm" weight="semibold">
								.NET API
							</Text>
						</HStack>
						<Text
							size="sm"
							color={health?.dotnet?.reachable ? "success" : "warning"}
						>
							{health?.dotnet?.reachable
								? "Connected"
								: health?.dotnet?.configured
									? "Configured, offline"
									: "Not configured"}
						</Text>
					</Panel>
				</div>
			</Panel>

			<Panel variant="inset" padding="md" className={styles.commandStrip}>
				<div className={styles.commandCopy}>
					<p className={styles.eyebrow}>AutoDraft command center</p>
					<Text size="sm" weight="semibold">
						{activeTabConfig.label} lane
					</Text>
					<Text size="xs" color="muted">
						{activeTabConfig.hint}
					</Text>
				</div>
				<div className={styles.commandStats}>
					<div className={styles.commandStat}>
						<Text size="xs" color="muted">
							Rules loaded
						</Text>
						<Text size="sm" weight="semibold">
							{rules.length}
						</Text>
					</div>
					<div className={styles.commandStat}>
						<Text size="xs" color="muted">
							Pipeline stages
						</Text>
						<Text size="sm" weight="semibold">
							{PIPELINE_STEPS.length}
						</Text>
					</div>
					<div className={styles.commandStat}>
						<Text size="xs" color="muted">
							Training phases
						</Text>
						<Text size="sm" weight="semibold">
							{TRAINING_PHASES.length}
						</Text>
					</div>
				</div>
			</Panel>

			<div className={styles.tabBar} role="tablist" aria-label="AutoDraft tabs">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={activeTab === tab.id}
						className={activeTab === tab.id ? styles.tabActive : styles.tab}
						onClick={() => setActiveTab(tab.id)}
					>
						<span>{tab.icon}</span>
						<span>{tab.label}</span>
					</button>
				))}
			</div>

			{activeTab === "architecture" && (
				<Stack gap={4} className={styles.contentShell}>
					<div className={styles.threeCol}>
						{MIGRATION_BREAKDOWN.map((item) => (
							<Panel
								key={item.title}
								variant="default"
								padding="md"
								className={styles.migrationCard}
							>
								<Text size="sm" weight="semibold">
									{item.title}
								</Text>
								<Text size="sm" color="muted">
									{item.description}
								</Text>
							</Panel>
						))}
					</div>

					<Panel variant="inset" padding="md">
						<Text size="sm" weight="semibold">
							Data Flow
						</Text>
						<pre className={styles.flowCode}>
							{`Bluebeam PDF
  ├── Content Stream    -> vector extraction (segments/arcs)
  ├── /Annots Dictionary -> markup extraction (clouds/arrows/text)
  ├── Rule Engine        -> deterministic action mapping
  ├── ML Fallback        -> unresolved/ambiguous markups
  └── Review Queue       -> approve -> execute via .NET API`}
						</pre>
					</Panel>

					<Panel variant="default" padding="md">
						<Text size="sm" weight="semibold">
							TypeScript Port Snapshot
						</Text>
						<div className={styles.metricsGrid}>
							<Metric
								label="Input segments"
								value={translatedGeometryStats.inputSegments}
							/>
							<Metric
								label="Arcs detected"
								value={translatedGeometryStats.arcsDetected}
							/>
							<Metric
								label="Remaining segments"
								value={translatedGeometryStats.remainingSegments}
							/>
							<Metric
								label="Post-extension segments"
								value={translatedGeometryStats.extendedSegments}
							/>
						</div>
					</Panel>
				</Stack>
			)}

			{activeTab === "rules" && (
				<Stack gap={3} className={styles.contentShell}>
					{rules.map((rule) => {
						const open = expandedRule === rule.id;
						const examples = Array.isArray(rule.examples) ? rule.examples : [];
						const badgeColor = STATUS_BADGE_BY_CATEGORY[rule.category] ?? "default";
						return (
							<Panel
								key={rule.id}
								variant="default"
								padding="md"
								className={styles.ruleCard}
							>
								<button
									type="button"
									className={styles.ruleHeader}
									onClick={() => setExpandedRule(open ? null : rule.id)}
								>
									<HStack gap={2} align="center">
										<Text>{rule.icon}</Text>
										<Badge color={badgeColor} variant="soft">
											{rule.category}
										</Badge>
										<Text size="sm" weight="semibold">
											{rule.action}
										</Text>
									</HStack>
									<Text size="xs" color="muted">
										{Math.round(rule.confidence * 100)}% confidence{" "}
										{open ? "▾" : "▸"}
									</Text>
								</button>
								{open && (
									<div className={styles.ruleBody}>
										<pre className={styles.ruleTrigger}>
											{JSON.stringify(rule.trigger, null, 2)}
										</pre>
										<div>
											<Text size="xs" color="muted">
												Examples
											</Text>
											{examples.map((example) => (
												<Text key={example} size="sm">
													• {example}
												</Text>
											))}
										</div>
									</div>
								)}
							</Panel>
						);
					})}
				</Stack>
			)}

			{activeTab === "pipeline" && (
				<div className={`${styles.timeline} ${styles.contentShell}`}>
					{PIPELINE_STEPS.map((step) => (
						<div key={step.step} className={styles.timelineRow}>
							<div className={styles.timelineBadge}>{step.step}</div>
							<Panel
								variant="default"
								padding="md"
								className={styles.timelineCard}
							>
								<Text size="sm" weight="semibold">
									{step.name}
								</Text>
								<Text size="sm" color="primary">
									{step.description}
								</Text>
								<Text size="sm" color="muted">
									{step.detail}
								</Text>
								<Text size="xs" color="muted">
									{step.tech}
								</Text>
							</Panel>
						</div>
					))}
				</div>
			)}

			{activeTab === "training" && (
				<Stack gap={3} className={styles.contentShell}>
					{TRAINING_PHASES.map((phase, index) => {
						const open = expandedPhase === index;
						return (
							<Panel key={phase.phase} variant="default" padding="md">
								<button
									type="button"
									className={styles.phaseHeader}
									onClick={() => setExpandedPhase(open ? -1 : index)}
								>
									<Text size="sm" weight="semibold">
										{phase.phase}
									</Text>
									<Text size="xs" color="muted">
										{phase.effort} {open ? "▾" : "▸"}
									</Text>
								</button>
								{open && (
									<div className={styles.phaseBody}>
										{phase.items.map((item) => (
											<Text key={item} size="sm" color="muted">
												→ {item}
											</Text>
										))}
									</div>
								)}
							</Panel>
						);
					})}
				</Stack>
			)}

			<section className={styles.compareSection}>
				<div className={styles.sectionHeader}>
					<p className={styles.eyebrow}>Compare operations</p>
					<Text size="sm" color="muted">
						Run calibrated compare reviews, submit markup feedback, and train
						local replacement intelligence.
					</Text>
				</div>
				<AutoDraftComparePanel />
			</section>

			<Panel variant="inset" padding="md" className={styles.demoPanel}>
				<div className={styles.sectionHeader}>
					<p className={styles.eyebrow}>Pipeline simulation</p>
					<HStack gap={2} align="center" justify="between">
						<Text size="sm" weight="semibold">
							Demo Plan + Execute
						</Text>
						<div className={styles.demoActions}>
							<Button
								variant="primary"
								size="sm"
								onClick={() => void runDemoPlan()}
								loading={loadingPlan}
							>
								Run sample markups
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void runDemoBackcheck()}
								loading={loadingBackcheck}
							>
								Run backcheck
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void runCadCrewReview()}
								loading={loadingCrewReview}
							>
								Run CAD crew review
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void runDemoExecute("preview")}
								loading={loadingExecute}
							>
								Preview execute
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void runDemoExecute("commit")}
								loading={loadingExecute}
								disabled={!commitCanRun}
							>
								Commit to CAD
							</Button>
						</div>
					</HStack>
				</div>
				<div className={styles.executionContextPanel}>
						<div className={styles.executionContextHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Execution workflow context
							</Text>
							<Text size="xs" color="muted">
								Link CAD commits to a real project and drawing so receipts can
								flow into revision history instead of staying local-only.
							</Text>
						</div>
							<Badge color="accent" variant="soft">
								Preview {"->"} Commit
							</Badge>
						</div>
						<div className={styles.executionStageRow}>
							<div className={styles.executionStageCard}>
								<HStack gap={2} align="center" wrap>
									<Badge color={previewIsCurrent ? "success" : "warning"} variant="soft">
										{previewIsCurrent ? "Preview current" : "Preview required"}
									</Badge>
									<Text size="xs" color="muted">
										{previewIsCurrent
											? "The current commit targets were previewed against the active plan."
											: "Run preview execute again whenever commit targets or revision context change."}
									</Text>
								</HStack>
							</div>
							<div className={styles.executionStageCard}>
								<HStack gap={2} align="center" wrap>
									<Badge
										color={commitCanRun ? "success" : "default"}
										variant="soft"
									>
										{commitCanRun ? "Commit ready" : "Commit blocked"}
									</Badge>
									<Text size="xs" color="muted">
										{commitCanRun
											? "All commit guards are satisfied for the current plan."
											: "Commit stays disabled until preview is current and the review is acknowledged."}
									</Text>
								</HStack>
							</div>
						</div>
						{planResult ? (
						<div className={styles.commitReviewPanel}>
							<div className={styles.commitReviewHeader}>
								<div>
									<Text size="sm" weight="semibold">
										Pre-commit review
									</Text>
									<Text size="xs" color="muted">
										Commit is now gated by resolved targets and explicit review, not
										just by running execute.
									</Text>
								</div>
								<div className={styles.commitReviewBadges}>
									<Badge color="success" variant="soft">
										{commitReview.readyCount} ready
									</Badge>
									<Badge color="warning" variant="soft">
										{commitReview.needsContextCount} needs context
									</Badge>
									<Badge color="default" variant="soft">
										{commitReview.reviewCount} review
									</Badge>
								</div>
							</div>
							<div className={styles.commitReviewList}>
								{commitReview.items.map((item) => (
									<div key={item.id} className={styles.commitReviewItem}>
										<div className={styles.commitReviewItemHeader}>
											<HStack gap={2} align="center" wrap>
												<Badge color="default" variant="soft">
													{item.familyLabel}
												</Badge>
												<Badge
													color={
														item.status === "ready"
															? "success"
															: item.status === "needs_context"
																? "warning"
																: "default"
													}
													variant="soft"
												>
													{item.status === "ready"
														? "Ready"
														: item.status === "needs_context"
															? "Needs context"
															: "Review"}
												</Badge>
											</HStack>
											<Text size="sm" weight="semibold" block>
												{item.title}
											</Text>
										</div>
										<Text size="xs" color="muted" block>
											{item.summary}
										</Text>
										{item.target ? (
											<Text size="xs" color="primary" block>
												{item.target}
											</Text>
										) : null}
										{item.reason ? (
											<Text
												size="xs"
												color={item.status === "review" ? "warning" : "muted"}
												block
											>
												{item.reason}
											</Text>
										) : null}
									</div>
								))}
							</div>
							<label className={styles.commitReviewConfirm}>
								<input
									type="checkbox"
									checked={commitReviewAcknowledged}
									onChange={(event) =>
										setCommitReviewAcknowledged(event.target.checked)
									}
									disabled={commitReview.readyCount <= 0}
								/>
								<span>
									{commitReview.readyCount > 0
										? `I reviewed ${commitReview.readyCount} commit-ready target(s) before writing to CAD.`
										: "No commit-ready targets yet. Resolve review items or add the missing context first."}
								</span>
							</label>
						</div>
					) : null}
					{selectedProject || selectedFile ? (
						<div className={styles.executionContextSummary}>
							<Text size="xs" color="muted" block>
								{selectedProject
									? `Project: ${selectedProject.name}`
									: "No project linked yet."}
							</Text>
							<Text size="xs" color="muted" block>
								{selectedFile
									? `Drawing file: ${selectedFile.name}`
									: selectedProjectId
										? "Select a project file to attach the commit receipt to a drawing."
										: "Select a project to enable revision-register traceability."}
							</Text>
						</div>
					) : null}
					<div className={styles.executionContextGrid}>
						<label className={styles.compareField}>
							<span>Project</span>
							<select
								value={selectedProjectId}
								onChange={(event) => handleProjectSelection(event.target.value)}
								className={styles.executionContextSelect}
							>
								<option value="">Select project</option>
								{projectOptions.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
						</label>
						<label className={styles.compareField}>
							<span>Workflow lane</span>
							<Input
								value={workflowContext.lane ?? ""}
								onChange={(event) =>
									setWorkflowContext((prev) => ({
										...prev,
										lane: event.target.value,
									}))
								}
								placeholder="autodraft-studio"
							/>
						</label>
						<label className={styles.compareField}>
							<span>Project file</span>
							<select
								value={revisionContext.fileId ?? ""}
								onChange={(event) => handleProjectFileSelection(event.target.value)}
								className={styles.executionContextSelect}
								disabled={!selectedProjectId}
							>
								<option value="">
									{selectedProjectId ? "Select drawing file" : "Pick project first"}
								</option>
								{projectFiles.map((file) => (
									<option key={file.id} value={file.id}>
										{file.name}
									</option>
								))}
							</select>
						</label>
						<label className={styles.compareField}>
							<span>Drawing number</span>
							<Input
								value={revisionContext.drawingNumber ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										drawingNumber: event.target.value,
									}))
								}
								placeholder="E-101"
							/>
						</label>
						<label className={styles.compareField}>
							<span>Revision</span>
							<Input
								value={revisionContext.revision ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										revision: event.target.value,
									}))
								}
								placeholder="B"
							/>
						</label>
						<label className={styles.compareField}>
							<span>Previous revision</span>
							<Input
								value={revisionContext.previousRevision ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										previousRevision: event.target.value,
									}))
								}
								placeholder="A"
							/>
						</label>
						<label className={styles.compareField}>
							<span>Drawing title</span>
							<Input
								value={revisionContext.title ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										title: event.target.value,
									}))
								}
								placeholder="Main switchgear one-line"
							/>
						</label>
						<label className={`${styles.compareField} ${styles.executionContextWide}`}>
							<span>Issue summary</span>
							<Input
								value={revisionContext.issueSummary ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										issueSummary: event.target.value,
									}))
								}
								placeholder="AutoDraft execution receipt recorded from Studio."
							/>
						</label>
						<label className={`${styles.compareField} ${styles.executionContextWide}`}>
							<span>Revision notes</span>
							<textarea
								rows={2}
								className={styles.executionContextTextarea}
								value={revisionContext.notes ?? ""}
								onChange={(event) =>
									setRevisionContext((prev) => ({
										...prev,
										notes: event.target.value,
									}))
								}
								placeholder="Optional PM trace notes, reviewer context, or closeout comments."
							/>
						</label>
					</div>
				</div>
				{planResult ? (
					<div className={styles.planSummary}>
						<Text size="xs" color="muted">
							Source: {planResult.source}
						</Text>
						<Text size="sm">
							{planResult.summary.actions_proposed} actions,{" "}
							{planResult.summary.classified} classified,{" "}
							{planResult.summary.needs_review} manual review.
						</Text>
					</div>
				) : (
					<Text size="sm" color="muted">
						Uses the new `/api/autodraft/plan` contract (local fallback if .NET
						API is not online).
					</Text>
				)}
				{planResult && !backcheckResult && !backcheckError ? (
					<Text size="xs" color="warning">
						Backcheck has not been run yet. Execution is still available, but
						CAD mismatch checks are reduced.
					</Text>
				) : null}
				{backcheckResult ? (
					<div className={styles.backcheckPanel}>
						<HStack gap={2} align="center" justify="between">
							<Text size="xs" color="muted">
								Backcheck {backcheckResult.requestId} ·{" "}
								{backcheckResult.cad.degraded ? "degraded" : "cad-aware"}
							</Text>
							<Button
								variant="ghost"
								size="sm"
								iconLeft={<HardDriveDownload size={13} />}
								onClick={exportBackcheckReport}
							>
								Export JSON
							</Button>
						</HStack>
						<HStack gap={2} align="center" wrap>
							<Badge color="success" variant="soft">
								pass {backcheckResult.summary.pass_count}
							</Badge>
							<Badge color="warning" variant="soft">
								warn {backcheckResult.summary.warn_count}
							</Badge>
							<Badge color="danger" variant="soft">
								fail {backcheckResult.summary.fail_count}
							</Badge>
						</HStack>
						{backcheckResult.warnings.map((warning) => (
							<Text key={warning} size="xs" color="warning">
								{warning}
							</Text>
						))}
						<Text size="xs" color="muted">
							CAD context source: {backcheckResult.cad.source || "unknown"}
						</Text>
						{backcheckResult.summary.fail_count > 0 ? (
							<div className={styles.overridePanel}>
								<label
									htmlFor="autodraft-override-reason"
									className={styles.overrideLabel}
								>
									Override reason (required to execute with fail findings)
								</label>
								<textarea
									id="autodraft-override-reason"
									name="autodraftOverrideReason"
									rows={2}
									className={styles.overrideTextarea}
									value={executeOverrideReason}
									onChange={(event) => setExecuteOverrideReason(event.target.value)}
									placeholder="Explain why execute is safe despite failing checks..."
								/>
							</div>
						) : null}
						<div className={styles.findingList}>
							{backcheckResult.findings.map((finding) => (
								<div key={finding.id} className={styles.findingCard}>
									<HStack gap={2} align="center" wrap>
										<Badge
											color={
												finding.status === "fail"
													? "danger"
													: finding.status === "warn"
														? "warning"
														: "success"
											}
											variant="soft"
										>
											{finding.status}
										</Badge>
										<Text size="xs" color="muted">
											{finding.action_id} · {finding.category}
										</Text>
									</HStack>
									{finding.notes.map((note) => (
										<Text key={`${finding.id}:${note}`} size="xs" color="muted">
											{note}
										</Text>
									))}
									{finding.suggestions.length > 0 ? (
										<Text size="xs" color="muted">
											Next: {finding.suggestions.join(" ")}
										</Text>
									) : null}
								</div>
							))}
						</div>
						{backcheckResult.summary.fail_count > 0 ? (
							<Text size="xs" color="warning">
								Backcheck found failing actions. Execute now requires an
								override reason.
							</Text>
						) : null}
						{crewReviewEntries.length > 0 ? (
							<div className={styles.crewReviewPanel}>
								<Text size="xs" color="muted">
									CAD crew review (Draftsmith {"->"} GridSage)
								</Text>
								{crewReviewEntries.map((entry) => (
									<div key={entry.profileId} className={styles.crewReviewCard}>
										<HStack gap={2} align="center" wrap>
											<Badge
												color={
													entry.status === "completed"
														? "success"
														: entry.status === "running"
															? "warning"
															: "danger"
												}
												variant="soft"
											>
												{entry.status}
											</Badge>
											<Text size="xs" color="muted">
												{entry.profileId}
											</Text>
										</HStack>
										{entry.response ? (
											<pre className={styles.crewReviewResponse}>
												{entry.response}
											</pre>
										) : null}
										{entry.error ? (
											<Text size="xs" color="warning">
												{entry.error}
											</Text>
										) : null}
									</div>
								))}
							</div>
						) : null}
						{crewReviewError ? (
							<Text size="xs" color="warning">
								{crewReviewError}
							</Text>
						) : null}
					</div>
				) : null}
				{backcheckError ? (
					<Text size="sm" color="warning">
						{backcheckError}
					</Text>
				) : null}
				{executeResult ? (
					<div className={styles.executeSummary}>
						<Text size="xs" color="muted">
							Execute source: {executeResult.source} · status:{" "}
							{executeResult.status}
						</Text>
						<Text size="sm">
							Accepted {executeResult.accepted}, skipped {executeResult.skipped}
							, dry run: {executeResult.dry_run ? "yes" : "no"}.
						</Text>
						{executeResult.requestId ? (
							<Text size="xs" color="muted">
								Request ID: {executeResult.requestId}
							</Text>
						) : null}
						{executeResult.job_id ? (
							<Text size="xs" color="muted">
								Job ID: {executeResult.job_id}
							</Text>
						) : null}
						{executeResult.meta?.cad ? (
							<div className={styles.executeMetaGrid}>
								<div className={styles.executeMetaCard}>
									<Text size="xs" color="muted">
										CAD drawing
									</Text>
									<Text size="sm" weight="semibold">
										{executionSummary?.cad.drawingName || "unknown"}
									</Text>
									<Text size="xs" color="muted">
										{executionSummary?.cad.readOnly === true
											? "Read-only"
											: executionSummary?.cad.readOnly === false
												? "Writable"
												: "State unknown"}
									</Text>
								</div>
								<div className={styles.executeMetaCard}>
									<Text size="xs" color="muted">
										CAD context
									</Text>
									<Text size="sm" weight="semibold">
										{executionSummary?.cad.activeLayout || "No active layout"}
									</Text>
									<Text size="xs" color="muted">
										{executionSummary?.cad.activeSpace
											? `Space: ${executionSummary.cad.activeSpace}`
											: "Space unavailable"}
									</Text>
									<Text size="xs" color="muted">
										{[
											typeof executionSummary?.cad.layoutCount === "number"
												? `layouts ${executionSummary.cad.layoutCount}`
												: "",
											typeof executionSummary?.cad.blockCount === "number"
												? `blocks ${executionSummary.cad.blockCount}`
												: "",
											typeof executionSummary?.cad.layerCount === "number"
												? `layers ${executionSummary.cad.layerCount}`
												: "",
										]
											.filter(Boolean)
											.join(" · ") || "Counts unavailable"}
									</Text>
								</div>
								<div className={styles.executeMetaCard}>
									<Text size="xs" color="muted">
										Commit impact
									</Text>
									<Text size="sm" weight="semibold">
										{executionSummary
											? `${executionSummary.accepted} accepted / ${executionSummary.skipped} skipped`
											: `${executeResult.accepted} accepted / ${executeResult.skipped} skipped`}
									</Text>
									<div className={styles.executeMetaBadges}>
										{executionSummary?.counts.createdHandles ? (
											<Badge color="primary" variant="soft">
												handles {executionSummary.counts.createdHandles}
											</Badge>
										) : null}
										{executionSummary?.counts.titleBlockUpdates ? (
											<Badge color="accent" variant="soft">
												title blocks {executionSummary.counts.titleBlockUpdates}
											</Badge>
										) : null}
										{executionSummary?.counts.textReplacementUpdates ? (
											<Badge color="success" variant="soft">
												text updates {executionSummary.counts.textReplacementUpdates}
											</Badge>
										) : null}
										{executionSummary?.counts.textDeleteUpdates ? (
											<Badge color="warning" variant="soft">
												text deletes {executionSummary.counts.textDeleteUpdates}
											</Badge>
										) : null}
									</div>
								</div>
							</div>
						) : null}
						{executeResult.meta?.commit ? (
							<Text size="xs" color="muted">
								Commit: {String(executeResult.meta.commit.committed || 0)} written
								{Array.isArray(executeResult.meta.commit.createdHandles) &&
								executeResult.meta.commit.createdHandles.length > 0
									? ` · handles ${executeResult.meta.commit.createdHandles.join(", ")}`
									: ""}
							</Text>
						) : null}
						{executeResult.meta?.executionReceipt ? (
							<>
								<Text size="xs" color="muted">
									Receipt: {executeResult.meta.executionReceipt.id || "stored"}
									{executeResult.meta.executionReceipt.providerPath
										? ` · ${executeResult.meta.executionReceipt.providerPath}`
										: ""}
								</Text>
								{executionSummary?.cad.drawingPath ? (
									<Text size="xs" color="muted">
										Path: {executionSummary.cad.drawingPath}
									</Text>
								) : null}
								{executionSummary?.titleBlockUpdates.length ? (
									<div className={styles.executeUpdateList}>
										<Text size="xs" color="muted">
											Title block updates
										</Text>
										{executionSummary.titleBlockUpdates.map((item, index) => (
											<div
												key={`title-block-update-${index}`}
												className={styles.executeUpdateCard}
											>
												<Text size="xs">
													{String(item.attributeTag || item.normalizedFieldKey || "Field")}
													{" -> "}
													{String(item.nextValue || item.targetValue || "")}
												</Text>
												<Text size="xs" color="muted">
													{String(item.handle || item.blockHandle || "handle unavailable")}
												</Text>
											</div>
										))}
									</div>
								) : null}
								{executionSummary?.textReplacementUpdates.length ? (
									<div className={styles.executeUpdateList}>
										<Text size="xs" color="muted">
											Text replacement updates
										</Text>
										{executionSummary.textReplacementUpdates.map((item, index) => (
											<div
												key={`text-update-${index}`}
												className={styles.executeUpdateCard}
											>
												<Text size="xs">
													{String(item.previousValue || "")}
													{" -> "}
													{String(item.nextValue || "")}
												</Text>
												<Text size="xs" color="muted">
													{String(item.handle || item.targetEntityId || "target unavailable")}
												</Text>
											</div>
										))}
									</div>
								) : null}
								{executionSummary?.textDeleteUpdates.length ? (
									<div className={styles.executeUpdateList}>
										<Text size="xs" color="muted">
											Text deletions
										</Text>
										{executionSummary.textDeleteUpdates.map((item, index) => (
											<div
												key={`text-delete-${index}`}
												className={styles.executeUpdateCard}
											>
												<Text size="xs">
													{String(item.previousValue || "Deleted text")}
												</Text>
												<Text size="xs" color="muted">
													{String(item.handle || item.targetEntityId || "target unavailable")}
												</Text>
											</div>
										))}
									</div>
								) : null}
							</>
						) : null}
						{revisionTraceMessage ? (
							<Text size="xs" color="primary">
								{revisionTraceMessage}
							</Text>
						) : null}
						{executeResult.warnings?.length ? (
							<div className={styles.executeWarnings}>
								{executeResult.warnings.map((warning) => (
									<Text key={warning} size="xs" color="warning">
										{warning}
									</Text>
								))}
							</div>
						) : null}
						{executeResult.message ? (
							<Text size="xs" color="muted">
								{executeResult.message}
							</Text>
						) : null}
					</div>
				) : executeError ? (
					<Text size="sm" color="warning">
						{executeError}
					</Text>
				) : (
					<Text size="xs" color="muted">
						Execution uses `/api/autodraft/execute` and returns a backend error
						until .NET execution is wired and reachable.
					</Text>
				)}
			</Panel>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className={styles.metricCard}>
			<Text size="xs" color="muted">
				{label}
			</Text>
			<Text size="lg" weight="semibold">
				{value}
			</Text>
		</div>
	);
}
