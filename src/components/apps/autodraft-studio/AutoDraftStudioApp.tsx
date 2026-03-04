import {
	CheckCircle2,
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
	type AutoDraftPlanResponse,
	autoDraftService,
} from "./autodraftService";
import {
	detectArcsFromSegments,
	extendDeadEndSegments,
	type Segment,
} from "./engine/pdfToCadGeometry";

type TabId = "architecture" | "rules" | "pipeline" | "training";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
	{ id: "architecture", label: "Architecture", icon: "◆" },
	{ id: "rules", label: "Rule Library", icon: "⚙" },
	{ id: "pipeline", label: "Pipeline", icon: "▸" },
	{ id: "training", label: "Training Path", icon: "◎" },
];

const DEMO_MARKUPS = [
	{ type: "cloud", color: "red", text: "DELETE BUS DUCT A3" },
	{ type: "cloud", color: "green", text: "Add grounding strap" },
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
	const [loadingPlan, setLoadingPlan] = useState(false);
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
		try {
			const planned = await autoDraftService.plan(DEMO_MARKUPS);
			setPlanResult(planned);
		} catch {
			setPlanResult(null);
		} finally {
			setLoadingPlan(false);
		}
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
										<Badge
											color={STATUS_BADGE_BY_CATEGORY[rule.category]}
											variant="soft"
										>
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
											{rule.examples.map((example) => (
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

			<Panel variant="inset" padding="md" className={styles.demoPanel}>
				<HStack gap={2} align="center" justify="between">
					<Text size="sm" weight="semibold">
						Demo Plan Run
					</Text>
					<Button
						variant="primary"
						size="sm"
						onClick={() => void runDemoPlan()}
						loading={loadingPlan}
					>
						Run sample markups
					</Button>
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
