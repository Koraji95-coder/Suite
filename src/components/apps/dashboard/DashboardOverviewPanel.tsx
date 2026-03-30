import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { SurfaceSkeleton } from "@/components/apps/ui/SurfaceSkeleton";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";
import styles from "./DashboardOverviewPanel.module.css";
import {
	DashboardDeliveryBoardSection,
	DashboardWatchdogSection,
} from "./DashboardOverviewSections";
import { buildDashboardWatchdogViewModel } from "./dashboardWatchdogSelectors";
import {
	summarizeDashboardDeliveryProjects,
	useDashboardDeliverySummary,
} from "./useDashboardDeliverySummary";
import { useDashboardOverviewData } from "./useDashboardOverviewData";

interface DashboardOverviewPanelProps {
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

type DashboardFocus = "watchdog" | "projects";

type DashboardStatusCard = {
	key: string;
	label: string;
	tone: "success" | "warning" | "danger" | "primary" | "default";
	detail: string;
};

type FocusPillOption = DashboardFocus | "all";

const TIME_WINDOW_OPTIONS = [
	{ value: "4", label: "4 hours" },
	{ value: "24", label: "24 hours" },
	{ value: "72", label: "72 hours" },
	{ value: "168", label: "7 days" },
] as const;

const CUSTOMER_FOCUS_OPTIONS: ReadonlyArray<{
	value: FocusPillOption;
	label: string;
}> = [
	{ value: "all", label: "Overview" },
	{ value: "watchdog", label: "Watchdog" },
	{ value: "projects", label: "Delivery" },
];

function toTrustState(tone: DashboardStatusCard["tone"]): TrustState {
	switch (tone) {
		case "success":
			return "ready";
		case "warning":
			return "needs-attention";
		case "danger":
			return "unavailable";
		default:
			return "background";
	}
}

function matchesQuery(query: string, values: Array<string | undefined | null>) {
	if (!query) return true;
	return values.some((value) =>
		String(value || "")
			.toLowerCase()
			.includes(query),
	);
}

function parseDashboardFocus(value: string | null): DashboardFocus | null {
	switch (value) {
		case "watchdog":
		case "projects":
			return value;
		default:
			return null;
	}
}

function formatDashboardDate(value: string | null) {
	if (!value) {
		return "No deadline";
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

function classifyStatusCard(
	key: string,
	label: string,
	errorMessage: string | null,
	connectedDetail: string,
	loadingDetail?: string,
	isLoading?: boolean,
): DashboardStatusCard {
	if (errorMessage) {
		const normalizedMessage = errorMessage.toLowerCase();
		if (
			normalizedMessage.includes("route") &&
			normalizedMessage.includes("unavailable")
		) {
			return {
				key,
				label,
				tone: "danger",
				detail:
					"Running backend is behind the repo route set. Restart the API from this checkout.",
			};
		}
		if (
			normalizedMessage.includes("unreachable") ||
			normalizedMessage.includes("failed to fetch") ||
			normalizedMessage.includes("cors")
		) {
			return {
				key,
				label,
				tone: "danger",
				detail:
					"Frontend cannot reach the current backend target. Check Vite proxy and backend startup.",
			};
		}
		if (normalizedMessage.includes("sign in")) {
			return {
				key,
				label,
				tone: "warning",
				detail:
					"This surface requires an authenticated session before it can load.",
			};
		}
		return {
			key,
			label,
			tone: "warning",
			detail: errorMessage,
		};
	}

	if (isLoading && loadingDetail) {
		return {
			key,
			label,
			tone: "default",
			detail: loadingDetail,
		};
	}

	return {
		key,
		label,
		tone: "success",
		detail: connectedDetail,
	};
}

export function DashboardOverviewPanel({
	onNavigateToProject,
	onNavigateToProjectsHub,
}: DashboardOverviewPanelProps) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { projects, activities, isLoading, projectTaskCounts, allProjectsMap } =
		useDashboardOverviewData();
	const deliverySummary = useDashboardDeliverySummary(
		projects,
		projectTaskCounts,
	);

	const [watchdogOverview, setWatchdogOverview] =
		useState<WatchdogOverviewResponse | null>(null);
	const [watchdogEvents, setWatchdogEvents] = useState<
		WatchdogCollectorEvent[]
	>([]);
	const [watchdogSessions, setWatchdogSessions] = useState<
		WatchdogSessionSummary[]
	>([]);
	const [collectors, setCollectors] = useState<WatchdogCollector[]>([]);
	const [watchdogError, setWatchdogError] = useState<string | null>(null);
	const [telemetryLoading, setTelemetryLoading] = useState(true);
	const initialFocusAppliedRef = useRef(false);
	const watchdogSectionRef = useRef<HTMLDivElement | null>(null);
	const projectSectionRef = useRef<HTMLDivElement | null>(null);

	const selectedProjectId = searchParams.get("project") || "all";
	const selectedCollectorId = searchParams.get("collector") || "all";
	const selectedWindowHours = searchParams.get("window") || "24";
	const selectedFocus = parseDashboardFocus(searchParams.get("focus"));
	const searchValue = searchParams.get("query") || "";
	const query = searchValue.trim().toLowerCase();

	const selectedWindowMs =
		Math.max(1, Number.parseInt(selectedWindowHours, 10) || 24) *
		60 *
		60 *
		1000;

	useEffect(() => {
		const next = new URLSearchParams(searchParams);
		let mutated = false;
		for (const key of [
			"domain",
			"agent",
			"includeAdvanced",
			"lifecycleState",
			"publishState",
		]) {
			if (next.has(key)) {
				next.delete(key);
				mutated = true;
			}
		}
		if (
			selectedFocus &&
			selectedFocus !== "watchdog" &&
			selectedFocus !== "projects"
		) {
			next.delete("focus");
			mutated = true;
		}
		if (mutated) {
			setSearchParams(next, { replace: true });
		}
	}, [searchParams, selectedFocus, setSearchParams]);

	const updateFilters = (updates: Record<string, string>) => {
		const next = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (!value || value === "all") {
				next.delete(key);
			} else {
				next.set(key, value);
			}
		}
		setSearchParams(next, { replace: true });
	};

	const updateFilter = (key: string, value: string) => {
		updateFilters({ [key]: value });
	};

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			setTelemetryLoading(true);
			setWatchdogError(null);

			const projectId =
				selectedProjectId !== "all" ? selectedProjectId : undefined;
			const collectorId =
				selectedCollectorId !== "all" ? selectedCollectorId : undefined;

			const [overviewResult, eventsResult, sessionsResult, collectorsResult] =
				await Promise.allSettled([
					watchdogService.getOverview({
						projectId,
						timeWindowMs: selectedWindowMs,
					}),
					watchdogService.listEvents({
						projectId,
						collectorId,
						limit: 8,
						sinceMs: Date.now() - selectedWindowMs,
					}),
					watchdogService.listSessions({
						projectId,
						collectorId,
						limit: 8,
						timeWindowMs: selectedWindowMs,
					}),
					watchdogService.listCollectors(),
				]);

			if (cancelled) return;

			if (overviewResult.status === "fulfilled") {
				setWatchdogOverview(overviewResult.value);
			} else {
				setWatchdogOverview(null);
				setWatchdogError(
					overviewResult.reason instanceof Error
						? overviewResult.reason.message
						: "Watchdog overview is unavailable.",
				);
			}

			setWatchdogEvents(
				eventsResult.status === "fulfilled"
					? (eventsResult.value.events ?? [])
					: [],
			);
			setWatchdogSessions(
				sessionsResult.status === "fulfilled"
					? (sessionsResult.value.sessions ?? [])
					: [],
			);
			setCollectors(
				collectorsResult.status === "fulfilled"
					? (collectorsResult.value.collectors ?? [])
					: [],
			);

			setTelemetryLoading(false);
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [selectedCollectorId, selectedProjectId, selectedWindowMs]);

	useEffect(() => {
		if (!selectedFocus || initialFocusAppliedRef.current) {
			return;
		}

		const focusMap = {
			watchdog: watchdogSectionRef,
			projects: projectSectionRef,
		};
		const targetRef = focusMap[selectedFocus];
		if (!targetRef?.current) return;
		initialFocusAppliedRef.current = true;

		const frame = window.requestAnimationFrame(() => {
			targetRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		});

		return () => window.cancelAnimationFrame(frame);
	}, [selectedFocus]);

	const handleNavigateToProject =
		onNavigateToProject ??
		((projectId: string) => navigate(`/app/projects/${projectId}`));
	const handleNavigateToProjectsHub =
		onNavigateToProjectsHub ?? (() => navigate("/app/projects"));

	const selectedProject =
		selectedProjectId !== "all"
			? projects.find((project) => project.id === selectedProjectId) || null
			: null;

	const filteredDeliveryProjects = useMemo(
		() =>
			deliverySummary.projects.filter((project) => {
				if (
					selectedProjectId !== "all" &&
					project.projectId !== selectedProjectId
				) {
					return false;
				}
				return matchesQuery(query, [
					project.name,
					project.issueTag,
					project.issueSetName,
					project.transmittalNumber,
					project.summary,
					project.detail,
					project.stateLabel,
				]);
			}),
		[deliverySummary.projects, query, selectedProjectId],
	);

	const filteredActivities = useMemo(
		() =>
			activities.filter((activity) => {
				if (
					selectedProjectId !== "all" &&
					activity.project_id !== selectedProjectId
				) {
					return false;
				}
				return matchesQuery(query, [
					activity.action,
					activity.description,
					activity.project_id,
				]);
			}),
		[activities, query, selectedProjectId],
	);

	const {
		visibleCollectors,
		liveSessionCards,
		activeCadSessionCount,
		sessionTimelineRows,
	} = useMemo(
		() =>
			buildDashboardWatchdogViewModel({
				allProjectsMap,
				collectors,
				selectedCollectorId,
				selectedProjectId,
				selectedWindowMs,
				watchdogEvents,
				watchdogSessions,
			}),
		[
			allProjectsMap,
			collectors,
			selectedCollectorId,
			selectedProjectId,
			selectedWindowMs,
			watchdogEvents,
			watchdogSessions,
		],
	);

	const trendMax = Math.max(
		1,
		...(watchdogOverview?.trendBuckets ?? []).map(
			(bucket) => bucket.eventCount,
		),
	);
	const telemetryHotspotProjects = (watchdogOverview?.projects.top ?? []).slice(
		0,
		4,
	);
	const watchdogEventCountByProject = useMemo(
		() =>
			new Map(
				(watchdogOverview?.projects.top ?? []).map((item) => [
					item.projectId,
					item.eventCount,
				]),
			),
		[watchdogOverview],
	);
	const deliveryMetrics = useMemo(
		() => summarizeDashboardDeliveryProjects(filteredDeliveryProjects),
		[filteredDeliveryProjects],
	);
	const nextDeliveryDeadline = useMemo(() => {
		const withDeadline = filteredDeliveryProjects
			.filter((project) => project.deadline || project.nextDue?.date)
			.map((project) => ({
				project,
				date: project.deadline || project.nextDue?.date || "",
			}))
			.filter((entry) => entry.date);
		if (withDeadline.length === 0) {
			return null;
		}
		return withDeadline.sort((left, right) =>
			left.date.localeCompare(right.date),
		)[0]?.project;
	}, [filteredDeliveryProjects]);

	const watchdogPanelClassName =
		selectedFocus === "watchdog"
			? `${styles.secondaryPanel} ${styles.focusedPanel}`
			: styles.secondaryPanel;
	const projectPanelClassName =
		selectedFocus === "projects"
			? `${styles.primaryPanel} ${styles.focusedPanel}`
			: styles.primaryPanel;
	const selectedWindowLabel =
		TIME_WINDOW_OPTIONS.find((option) => option.value === selectedWindowHours)
			?.label ?? `${selectedWindowHours} hours`;

	const statusCards = useMemo<DashboardStatusCard[]>(
		() => [
			classifyStatusCard(
				"watchdog",
				"Drawing activity",
				watchdogError,
				"Watchdog sessions and collector summaries are available for the current delivery scope.",
				"Drawing sessions and collector summaries settle in the background for the current delivery scope.",
				telemetryLoading,
			),
			{
				key: "review",
				label: "Review inbox",
				tone:
					deliveryMetrics.reviewPressureCount > 0
						? "warning"
						: deliverySummary.loading
							? "default"
							: "success",
				detail:
					deliveryMetrics.reviewPressureCount > 0
						? `${deliveryMetrics.reviewPressureCount} review item${deliveryMetrics.reviewPressureCount === 1 ? "" : "s"} still need package decisions in the current scope.`
						: deliverySummary.loading
							? "Delivery review signals are settling in the background for the current scope."
							: "No active package blockers are currently holding the selected project scope.",
			},
			{
				key: "packages",
				label: "Issue sets",
				tone:
					deliveryMetrics.readyCount > 0
						? "success"
						: deliveryMetrics.setupAttentionCount > 0
							? "warning"
							: "primary",
				detail:
					deliveryMetrics.readyCount > 0
						? `${deliveryMetrics.readyCount} package${deliveryMetrics.readyCount === 1 ? "" : "s"} are ready to move into issue.`
						: deliveryMetrics.setupAttentionCount > 0
							? `${deliveryMetrics.setupAttentionCount} project${deliveryMetrics.setupAttentionCount === 1 ? "" : "s"} still need setup before package work can settle.`
							: `${deliveryMetrics.packagesInProgressCount} package${deliveryMetrics.packagesInProgressCount === 1 ? "" : "s"} are still being assembled or reviewed.`,
			},
		],
		[
			deliveryMetrics.packagesInProgressCount,
			deliveryMetrics.readyCount,
			deliveryMetrics.reviewPressureCount,
			deliveryMetrics.setupAttentionCount,
			deliverySummary.loading,
			telemetryLoading,
			watchdogError,
		],
	);

	const hasFirstViewportPayload =
		projects.length > 0 ||
		activities.length > 0 ||
		projectTaskCounts.size > 0 ||
		allProjectsMap.size > 0 ||
		filteredDeliveryProjects.length > 0 ||
		Boolean(deliverySummary.error) ||
		Boolean(watchdogOverview) ||
		Boolean(watchdogError);
	const showMissionSkeleton =
		(isLoading || telemetryLoading) && !hasFirstViewportPayload;

	return (
		<div className={styles.root}>
			<PageContextBand
				eyebrow="Delivery overview"
				summary={
					<Text size="sm" color="muted" block className={styles.subtitle}>
						See which projects are ready to issue, which packages still need
						review, and what drawing activity is live right now.
					</Text>
				}
				actions={
					<div className={styles.mastheadActions}>
						<Button
							variant="outline"
							size="sm"
							onClick={() => navigate("/app/watchdog")}
							iconRight={<ArrowUpRight size={14} />}
						>
							Open Watchdog
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleNavigateToProjectsHub}
						>
							Open Projects
						</Button>
					</div>
				}
			>
				<div className={styles.bandFacts}>
					<div className={styles.bandFact}>
						<span className={styles.metaLabel}>Project</span>
						<strong>{selectedProject?.name || "All projects"}</strong>
					</div>
					<div className={styles.bandFact}>
						<span className={styles.metaLabel}>Next deadline</span>
						<strong>
							{nextDeliveryDeadline
								? formatDashboardDate(
										nextDeliveryDeadline.deadline ||
											nextDeliveryDeadline.nextDue?.date ||
											null,
									)
								: "No deadline"}
						</strong>
					</div>
					<div className={styles.bandFact}>
						<span className={styles.metaLabel}>Live CAD</span>
						<strong>{activeCadSessionCount}</strong>
					</div>
				</div>
			</PageContextBand>

			<div className={styles.commandFrame}>
				{showMissionSkeleton ? (
					<section className={styles.missionSkeletonGrid} aria-hidden="true">
						<SurfaceSkeleton tone="feature" height="tall" lines={3} />
						<SurfaceSkeleton tone="support" height="regular" lines={4} />
					</section>
				) : (
					<section className={styles.missionGrid}>
						<Panel
							variant="feature"
							padding="lg"
							className={styles.missionSurface}
						>
							<div className={styles.missionHeader}>
								<div className={styles.missionCopy}>
									<Text size="sm" weight="semibold" block>
										Delivery mission board
									</Text>
									<Text size="xs" color="muted" block>
										One glance at package readiness, review pressure, and the
										next deadline the team is moving toward.
									</Text>
								</div>
							</div>

							<section className={styles.statusStrip}>
								{statusCards.map((card) => (
									<div key={card.key} className={styles.statusCard}>
										<div className={styles.statusCardHeader}>
											<Text size="xs" weight="semibold">
												{card.label}
											</Text>
											<TrustStateBadge
												state={toTrustState(card.tone)}
												label={
													card.tone === "success"
														? "Ready"
														: card.tone === "danger"
															? "Unavailable"
															: card.tone === "warning"
																? "Needs attention"
																: "Background"
												}
												variant="outline"
											/>
										</div>
										<Text
											size="xs"
											color="muted"
											className={styles.statusCardDetail}
										>
											{card.detail}
										</Text>
									</div>
								))}
							</section>

							<div className={styles.missionHighlights}>
								<div className={styles.highlightCard}>
									<span className={styles.metaLabel}>Packages ready</span>
									<strong>{deliveryMetrics.readyCount}</strong>
								</div>
								<div className={styles.highlightCard}>
									<span className={styles.metaLabel}>Review items</span>
									<strong>{deliveryMetrics.reviewPressureCount}</strong>
								</div>
								<div className={styles.highlightCard}>
									<span className={styles.metaLabel}>Transmittal queue</span>
									<strong>{deliveryMetrics.transmittalQueueCount}</strong>
								</div>
							</div>
						</Panel>

						<Panel
							variant="support"
							padding="lg"
							className={styles.filterPanel}
						>
							<div className={styles.filterHeader}>
								<div>
									<Text size="xs" weight="semibold" block>
										Focus filters
									</Text>
									<Text size="xs" color="muted" block>
										Keep the same project and time scope across package
										readiness and drawing activity.
									</Text>
								</div>
							</div>

							<section className={styles.filters}>
								<div className={styles.filterField}>
									<label
										htmlFor="dashboard-project-filter"
										className={styles.filterLabel}
									>
										Project
									</label>
									<select
										id="dashboard-project-filter"
										value={selectedProjectId}
										onChange={(event) =>
											updateFilter("project", event.target.value)
										}
										className={styles.select}
										name="dashboard_project_filter"
									>
										<option value="all">All projects</option>
										{projects.map((project) => (
											<option key={project.id} value={project.id}>
												{project.name}
											</option>
										))}
									</select>
								</div>

								<div className={styles.filterField}>
									<label
										htmlFor="dashboard-window-filter"
										className={styles.filterLabel}
									>
										Time range
									</label>
									<select
										id="dashboard-window-filter"
										value={selectedWindowHours}
										onChange={(event) =>
											updateFilter("window", event.target.value)
										}
										className={styles.select}
										name="dashboard_window_filter"
									>
										{TIME_WINDOW_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</div>

								<div className={styles.filterFieldWide}>
									<label
										htmlFor="dashboard-query-filter"
										className={styles.filterLabel}
									>
										Search
									</label>
									<input
										id="dashboard-query-filter"
										type="search"
										value={searchValue}
										onChange={(event) =>
											updateFilter("query", event.target.value)
										}
										placeholder="Search projects, issue tags, transmittals, and actions..."
										className={styles.searchInput}
										name="dashboard_query_filter"
									/>
								</div>
							</section>

							<div className={styles.focusPills}>
								{CUSTOMER_FOCUS_OPTIONS.map((option) => {
									const isActive =
										(option.value === "all" && !selectedFocus) ||
										(option.value !== "all" && selectedFocus === option.value);
									return (
										<button
											key={option.value}
											type="button"
											className={`${styles.focusPill} ${
												isActive ? styles.focusPillActive : ""
											}`}
											onClick={() =>
												updateFilter(
													"focus",
													option.value === "all" ? "" : option.value,
												)
											}
										>
											{option.label}
										</button>
									);
								})}
							</div>
						</Panel>
					</section>
				)}

				<div className={styles.moduleGrid}>
					<DashboardDeliveryBoardSection
						panelRef={projectSectionRef}
						className={projectPanelClassName}
						isLoading={isLoading}
						deliveryLoading={deliverySummary.loading}
						deliveryError={deliverySummary.error}
						deliveryProjects={filteredDeliveryProjects}
						deliveryMetrics={deliveryMetrics}
						watchdogEventCountByProject={watchdogEventCountByProject}
						filteredActivities={filteredActivities}
						handleNavigateToProject={handleNavigateToProject}
					/>
					<DashboardWatchdogSection
						panelRef={watchdogSectionRef}
						className={watchdogPanelClassName}
						watchdogError={watchdogError}
						selectedProject={selectedProject}
						selectedWindowLabel={selectedWindowLabel}
						activeCadSessionCount={activeCadSessionCount}
						liveSessionCards={liveSessionCards}
						watchdogOverview={watchdogOverview}
						trendMax={trendMax}
						watchdogEvents={watchdogEvents}
						visibleCollectors={visibleCollectors}
						sessionTimelineRows={sessionTimelineRows}
						selectedProjectId={selectedProjectId}
						selectedCollectorId={selectedCollectorId}
						telemetryHotspotProjects={telemetryHotspotProjects}
						allProjectsMap={allProjectsMap}
						updateFilter={updateFilter}
						updateFilters={updateFilters}
					/>
				</div>
			</div>
		</div>
	);
}
