import {
	CheckCircle2,
	HardDriveDownload,
	RefreshCw,
	Server,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
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
	type AutoDraftPlanResponse,
	autoDraftService,
} from "./autodraftService";
import { agentService } from "@/services/agentService";
import {
	detectArcsFromSegments,
	extendDeadEndSegments,
	type Segment,
} from "./engine/pdfToCadGeometry";
import { AutoDraftComparePanel } from "./AutoDraftComparePanel";

type TabId = "architecture" | "rules" | "pipeline" | "training";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
	{ id: "architecture", label: "Architecture", icon: "\u{25C6}" },
	{ id: "rules", label: "Rule Library", icon: "\u{2699}" },
	{ id: "pipeline", label: "Pipeline", icon: "\u{25B8}" },
	{ id: "training", label: "Training Path", icon: "\u{25CE}" },
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
	const [crewReviewEntries, setCrewReviewEntries] = useState<CrewReviewEntry[]>(
		[],
	);
	const [crewReviewError, setCrewReviewError] = useState<string | null>(null);
	const [loadingPlan, setLoadingPlan] = useState(false);
	const [loadingExecute, setLoadingExecute] = useState(false);
	const [loadingBackcheck, setLoadingBackcheck] = useState(false);
	const [loadingCrewReview, setLoadingCrewReview] = useState(false);
	const [loadingHealth, setLoadingHealth] = useState(false);

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

	const runDemoExecuteDryRun = async () => {
		setLoadingExecute(true);
		setExecuteResult(null);
		setExecuteError(null);
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

			const executed = await autoDraftService.execute(plan.actions, {
				dryRun: true,
				backcheckRequestId: backcheckResult?.requestId || undefined,
				backcheckOverrideReason: hasFailingBackcheck
					? overrideReason || undefined
					: undefined,
				backcheckFailCount,
			});
			setExecuteResult(executed);
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
				<Stack gap={4}>
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
				<Stack gap={3}>
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
				<div className={styles.timeline}>
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
				<Stack gap={3}>
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

			<AutoDraftComparePanel />

			<Panel variant="inset" padding="md" className={styles.demoPanel}>
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
							onClick={() => void runDemoExecuteDryRun()}
							loading={loadingExecute}
						>
							Execute dry run
						</Button>
					</div>
				</HStack>
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
						{executeResult.job_id ? (
							<Text size="xs" color="muted">
								Job ID: {executeResult.job_id}
							</Text>
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
