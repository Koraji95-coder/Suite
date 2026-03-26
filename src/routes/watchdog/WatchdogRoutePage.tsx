import { ArrowUpRight, RefreshCw, TimerReset } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import {
	formatDuration,
	formatRelativeTime,
} from "@/components/apps/dashboard/dashboardOverviewFormatters";
import {
	buildDashboardWatchdogViewModel,
	type DashboardSessionTimelineRow,
} from "@/components/apps/dashboard/dashboardWatchdogSelectors";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { SurfaceSkeleton } from "@/components/apps/ui/SurfaceSkeleton";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import { isDevAudience } from "@/lib/audience";
import { logger } from "@/lib/errorLogger";
import {
	basenameFromPath,
	isAutoCadCollector,
	isAutoCadEvent,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";
import { supabase } from "@/supabase/client";
import styles from "./WatchdogRoutePage.module.css";
import {
	formatWatchdogTechnicalLabel,
	getWatchdogTechnicalSourceLabel,
	presentWatchdogOperatorFeed,
} from "./watchdogPresentation";
import {
	buildAttentionRows,
	buildDaybookRows,
	buildProjectRollupRows,
	buildWorkstationRows,
	getOperatorSessionLabel,
	normalizeTargetKey,
	readCommandName,
	resolveEventTargetPath,
	resolveProjectDisplayName,
	type WatchdogAttentionRow,
	type WatchdogProjectRollupRow,
} from "./watchdogRouteViewModel";

interface WatchdogProjectOption {
	id: string;
	name: string;
}

const WINDOW_OPTIONS = [
	{ value: "4", label: "4 hours" },
	{ value: "24", label: "24 hours" },
	{ value: "72", label: "72 hours" },
	{ value: "168", label: "7 days" },
] as const;

function readRouteErrorMessage(reason: unknown, fallback: string): string {
	return reason instanceof Error && reason.message ? reason.message : fallback;
}

function getTrustState(
	errorMessage: string | null,
	collectors: WatchdogCollector[],
): TrustState {
	if (errorMessage && collectors.length === 0) {
		return "unavailable";
	}
	if (collectors.some((collector) => collector.status === "online")) {
		return errorMessage ? "needs-attention" : "ready";
	}
	if (collectors.length > 0) {
		return "needs-attention";
	}
	return errorMessage ? "needs-attention" : "background";
}

function getTimelineMetaLabel(row: DashboardSessionTimelineRow): string {
	return [
		row.collectorName,
		row.projectName ||
			(row.session.projectId ? "Tracked project" : "Unassigned"),
		`Tracker ${formatRelativeTime(row.trackerAt)}`,
	]
		.filter(Boolean)
		.join(" • ");
}

function getSessionTone(
	status: WatchdogSessionSummary["status"],
): "primary" | "warning" | "accent" {
	switch (status) {
		case "live":
			return "primary";
		case "paused":
			return "warning";
		default:
			return "accent";
	}
}

async function loadProjectOptions(): Promise<WatchdogProjectOption[]> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) {
		logger.warn(
			"WatchdogRoutePage",
			"Unable to resolve project options for Watchdog.",
			{ error },
		);
		return [];
	}

	const { data, error: projectError } = await supabase
		.from("projects")
		.select("id, name")
		.eq("user_id", user.id)
		.order("name", { ascending: true });

	if (projectError) {
		logger.warn(
			"WatchdogRoutePage",
			"Failed to load project options for Watchdog.",
			{ error: projectError },
		);
		return [];
	}

	return Array.isArray(data)
		? data.map((project) => ({
				id: String(project.id),
				name: String(project.name || project.id),
			}))
		: [];
}

export default function WatchdogRoutePage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const requestIdRef = useRef(0);
	const { user } = useAuth();
	const [activityView, setActivityView] = useState<"actions" | "technical">(
		"actions",
	);
	const [coverageView, setCoverageView] = useState<"workstations" | "projects">(
		"workstations",
	);

	useRegisterPageHeader({
		title: "Watchdog",
		subtitle:
			"Collector health, drawing activity, and project-attributed AutoCAD sessions.",
	});

	const selectedProjectId = searchParams.get("project") || "all";
	const selectedIssueSetId = searchParams.get("issueSet") || null;
	const selectedCollectorId = searchParams.get("collector") || "all";
	const selectedWindowHours = searchParams.get("window") || "24";
	const selectedDrawingKey = normalizeTargetKey(searchParams.get("drawing"));
	const showTechnicalPanels = isDevAudience(user);
	const selectedWindowMs =
		Math.max(1, Number.parseInt(selectedWindowHours, 10) || 24) *
		60 *
		60 *
		1000;

	const [projects, setProjects] = useState<WatchdogProjectOption[]>([]);
	const [selectedIssueSet, setSelectedIssueSet] =
		useState<ProjectIssueSetRecord | null>(null);
	const [overview, setOverview] = useState<WatchdogOverviewResponse | null>(
		null,
	);
	const [events, setEvents] = useState<WatchdogCollectorEvent[]>([]);
	const [sessions, setSessions] = useState<WatchdogSessionSummary[]>([]);
	const [collectors, setCollectors] = useState<WatchdogCollector[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const updateFilters = useCallback(
		(updates: Record<string, string>) => {
			const next = new URLSearchParams(searchParams);
			for (const [key, value] of Object.entries(updates)) {
				if (!value || value === "all") {
					next.delete(key);
				} else {
					next.set(key, value);
				}
			}
			setSearchParams(next, { replace: true });
		},
		[searchParams, setSearchParams],
	);

	const loadWatchdogSnapshot = useCallback(async () => {
		const requestId = ++requestIdRef.current;
		const projectId =
			selectedProjectId !== "all" ? selectedProjectId : undefined;
		const collectorId =
			selectedCollectorId !== "all" ? selectedCollectorId : undefined;
		const isWarmRefresh = hasLoadedOnce;

		if (isWarmRefresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		const results = await Promise.allSettled([
			loadProjectOptions(),
			watchdogService.getOverview({
				projectId,
				timeWindowMs: selectedWindowMs,
			}),
			watchdogService.listEvents({
				projectId,
				collectorId,
				limit: 60,
				sinceMs: Date.now() - selectedWindowMs,
			}),
			watchdogService.listSessions({
				projectId,
				collectorId,
				limit: 14,
				timeWindowMs: selectedWindowMs,
			}),
			watchdogService.listCollectors(),
		]);

		if (requestId !== requestIdRef.current) {
			return;
		}

		const [
			projectsResult,
			overviewResult,
			eventsResult,
			sessionsResult,
			collectorsResult,
		] = results;

		if (projectsResult.status === "fulfilled") {
			setProjects(projectsResult.value);
		}

		let refreshError: string | null = null;

		if (overviewResult.status === "fulfilled") {
			setOverview(overviewResult.value);
		} else {
			refreshError = readRouteErrorMessage(
				overviewResult.reason,
				"Watchdog overview is unavailable.",
			);
			if (!isWarmRefresh) {
				setOverview(null);
			}
		}

		if (eventsResult.status === "fulfilled") {
			setEvents(eventsResult.value.events ?? []);
		} else if (!isWarmRefresh) {
			setEvents([]);
		}

		if (sessionsResult.status === "fulfilled") {
			setSessions(sessionsResult.value.sessions ?? []);
		} else if (!isWarmRefresh) {
			setSessions([]);
		}

		if (collectorsResult.status === "fulfilled") {
			setCollectors(collectorsResult.value.collectors ?? []);
		} else if (!isWarmRefresh) {
			setCollectors([]);
		}

		setErrorMessage(
			refreshError && isWarmRefresh
				? `Showing the last successful Watchdog snapshot. ${refreshError}`
				: refreshError,
		);
		if (!refreshError || isWarmRefresh) {
			setLastLoadedAt(Date.now());
		}
		setHasLoadedOnce(true);
		setLoading(false);
		setRefreshing(false);
	}, [hasLoadedOnce, selectedCollectorId, selectedProjectId, selectedWindowMs]);

	useEffect(() => {
		void loadWatchdogSnapshot();
	}, [loadWatchdogSnapshot]);

	useEffect(() => {
		if (!showTechnicalPanels) {
			setActivityView("actions");
		}
	}, [showTechnicalPanels]);

	useEffect(() => {
		let cancelled = false;
		if (selectedProjectId === "all" || !selectedIssueSetId) {
			setSelectedIssueSet(null);
			return;
		}
		void projectIssueSetService
			.fetchIssueSet(selectedProjectId, selectedIssueSetId)
			.then((result) => {
				if (cancelled) {
					return;
				}
				setSelectedIssueSet(result.data ?? null);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedIssueSetId, selectedProjectId]);

	const projectNameMap = useMemo(
		() =>
			new Map(projects.map((project) => [project.id, { name: project.name }])),
		[projects],
	);
	const selectedProject =
		selectedProjectId !== "all"
			? projects.find((project) => project.id === selectedProjectId) || null
			: null;
	const selectedIssueSetDrawingKeys = useMemo(
		() =>
			new Set(
				(selectedIssueSet?.selectedDrawingPaths ?? [])
					.map((path) => normalizeTargetKey(path))
					.filter((value): value is string => Boolean(value)),
			),
		[selectedIssueSet],
	);
	const issueSetScopedEvents = useMemo(() => {
		if (selectedIssueSetDrawingKeys.size === 0) {
			return events;
		}
		return events.filter((event) => {
			const targetKey = normalizeTargetKey(resolveEventTargetPath(event));
			return targetKey ? selectedIssueSetDrawingKeys.has(targetKey) : false;
		});
	}, [events, selectedIssueSetDrawingKeys]);
	const issueSetScopedSessions = useMemo(() => {
		if (selectedIssueSetDrawingKeys.size === 0) {
			return sessions;
		}
		return sessions.filter((session) => {
			const targetKey = normalizeTargetKey(session.drawingPath);
			return targetKey ? selectedIssueSetDrawingKeys.has(targetKey) : false;
		});
	}, [selectedIssueSetDrawingKeys, sessions]);
	const {
		filteredCollectorOptions,
		visibleCollectors,
		liveSessionCards,
		activeCadSessionCount,
		sessionTimelineRows,
	} = useMemo(
		() =>
			buildDashboardWatchdogViewModel({
				allProjectsMap: projectNameMap,
				collectors,
				selectedCollectorId,
				selectedProjectId,
				selectedWindowMs,
				watchdogEvents: issueSetScopedEvents,
				watchdogSessions: issueSetScopedSessions,
			}),
		[
			collectors,
			issueSetScopedEvents,
			issueSetScopedSessions,
			projectNameMap,
			selectedCollectorId,
			selectedProjectId,
			selectedWindowMs,
		],
	);
	const customerRelevantEvents = useMemo(
		() => issueSetScopedEvents.filter((event) => isAutoCadEvent(event)),
		[issueSetScopedEvents],
	);
	const routeEvents = showTechnicalPanels
		? issueSetScopedEvents
		: customerRelevantEvents;
	const operatorFeed = useMemo(
		() => presentWatchdogOperatorFeed(routeEvents, projectNameMap),
		[projectNameMap, routeEvents],
	);
	const allDaybookRows = useMemo(
		() =>
			buildDaybookRows({
				events: routeEvents,
				sessions: issueSetScopedSessions,
				collectors,
				projectNameMap,
			}),
		[collectors, issueSetScopedSessions, projectNameMap, routeEvents],
	);
	const selectedDrawingRow = useMemo(
		() =>
			selectedDrawingKey
				? (allDaybookRows.find(
						(row) => row.drawingKey === selectedDrawingKey,
					) ?? null)
				: null,
		[allDaybookRows, selectedDrawingKey],
	);
	const daybookRows = useMemo(() => {
		if (!selectedDrawingRow) {
			return allDaybookRows.slice(0, 10);
		}
		const visibleRows = allDaybookRows.slice(0, 10);
		if (
			visibleRows.some(
				(row) => row.drawingKey === selectedDrawingRow.drawingKey,
			)
		) {
			return visibleRows;
		}
		return [
			selectedDrawingRow,
			...allDaybookRows
				.filter((row) => row.drawingKey !== selectedDrawingRow.drawingKey)
				.slice(0, 9),
		];
	}, [allDaybookRows, selectedDrawingRow]);
	const operatorFeedRows = useMemo(
		() =>
			(selectedDrawingKey
				? operatorFeed.filter((event) => event.targetKey === selectedDrawingKey)
				: operatorFeed
			).slice(0, 10),
		[operatorFeed, selectedDrawingKey],
	);
	const scopedTechnicalEvents = useMemo(
		() =>
			(selectedDrawingKey
				? issueSetScopedEvents.filter(
						(event) =>
							normalizeTargetKey(resolveEventTargetPath(event)) ===
							selectedDrawingKey,
					)
				: issueSetScopedEvents
			).slice(0, 10),
		[issueSetScopedEvents, selectedDrawingKey],
	);
	const scopedLiveSessionCards = useMemo(
		() =>
			selectedDrawingKey
				? liveSessionCards.filter(
						(card) =>
							normalizeTargetKey(card.session.drawingPath) ===
							selectedDrawingKey,
					)
				: liveSessionCards,
		[liveSessionCards, selectedDrawingKey],
	);
	const scopedTimelineRows = useMemo(
		() =>
			selectedDrawingKey
				? sessionTimelineRows.filter(
						(row) =>
							normalizeTargetKey(row.session.drawingPath) ===
							selectedDrawingKey,
					)
				: sessionTimelineRows,
		[sessionTimelineRows, selectedDrawingKey],
	);
	const workstationRows = useMemo(
		() =>
			buildWorkstationRows({
				collectors: visibleCollectors,
				projectNameMap,
				sessions: issueSetScopedSessions,
			}),
		[issueSetScopedSessions, projectNameMap, visibleCollectors],
	);
	const projectRollupRows = useMemo<WatchdogProjectRollupRow[]>(
		() => buildProjectRollupRows({ daybookRows: allDaybookRows }).slice(0, 6),
		[allDaybookRows],
	);
	const totalTrackedDurationMs = useMemo(
		() =>
			allDaybookRows.reduce(
				(total, row) => total + Math.max(0, row.totalDurationMs),
				0,
			),
		[allDaybookRows],
	);
	const scopedProjectCount = projectRollupRows.filter(
		(row) => row.projectId,
	).length;
	const selectedWindowLabel =
		WINDOW_OPTIONS.find((option) => option.value === selectedWindowHours)
			?.label ?? `${selectedWindowHours} hours`;
	const cadCollectors = visibleCollectors.filter((collector) =>
		isAutoCadCollector(collector),
	);
	const cadCollectorsOnline = cadCollectors.filter(
		(collector) => collector.status === "online",
	).length;
	const trustState = getTrustState(errorMessage, visibleCollectors);
	const focusedDrawingCount = allDaybookRows.length;
	const visibleLiveSessionCount = selectedDrawingKey
		? scopedLiveSessionCards.length
		: activeCadSessionCount;
	const collectorAttentionCount = visibleCollectors.filter((collector) => {
		const runtime = readWatchdogCollectorRuntimeState(collector);
		return (
			collector.status !== "online" ||
			(isAutoCadCollector(collector) && !runtime.sourceAvailable) ||
			runtime.isPaused
		);
	}).length;
	const unassignedCadCount = allDaybookRows.filter(
		(row) => !row.projectId && row.sessionCount > 0,
	).length;
	const attentionRows = useMemo<WatchdogAttentionRow[]>(
		() =>
			buildAttentionRows({
				cadCollectorsOnline,
				collectorAttentionCount,
				unassignedCadCount,
				visibleLiveSessionCount,
			}),
		[
			cadCollectorsOnline,
			collectorAttentionCount,
			unassignedCadCount,
			visibleLiveSessionCount,
		],
	);
	const daybookTitle = selectedProject ? "Project drawings" : "Drawings";
	const rawDrawingParam = searchParams.get("drawing");
	const selectedIssueSetLabel = selectedIssueSet?.issueTag ?? null;
	const focusedDrawingLabel = selectedDrawingRow?.drawingLabel
		? selectedDrawingRow.drawingLabel
		: rawDrawingParam
			? basenameFromPath(rawDrawingParam)
			: null;
	const daybookDescription = focusedDrawingLabel
		? `Grouped by drawing. ${focusedDrawingLabel} gets one row with tracked time, session count, and the latest drawing-level summary.`
		: selectedProject
			? "Grouped by drawing for the selected project, so you can scan work volume without dropping into raw events."
			: "Grouped by drawing across the current view, with tracked time, sessions, and the last meaningful drawing update.";
	const actionsDescription = selectedDrawingRow
		? `Time-ordered user-facing drawing actions for ${selectedDrawingRow.drawingLabel}, like opened, saved, and closed drawing activity.`
		: focusedDrawingLabel
			? `Time-ordered user-facing drawing actions for ${focusedDrawingLabel}, like opened, saved, and closed drawing activity.`
			: "A chronological feed of the latest user-facing drawing actions across this scope, like opened, saved, and closed drawing activity.";
	const timelineDescription = selectedDrawingRow
		? `Window-relative session bars for ${selectedDrawingRow.drawingLabel}.`
		: focusedDrawingLabel
			? `Window-relative session bars for ${focusedDrawingLabel}.`
			: "Window-relative session bars for the current scope.";
	const technicalDescription = selectedDrawingRow
		? `Low-level CAD and filesystem collector events for ${selectedDrawingRow.drawingLabel}. Use this only when you need diagnostics.`
		: focusedDrawingLabel
			? `Low-level CAD and filesystem collector events for ${focusedDrawingLabel}. Use this only when you need diagnostics.`
			: "Low-level CAD and filesystem collector events for deeper diagnostics. This is the raw tracker/folder stream, not the cleaned operator view.";
	const firstViewportLoaded =
		hasLoadedOnce ||
		Boolean(overview) ||
		events.length > 0 ||
		sessions.length > 0 ||
		collectors.length > 0;
	const activityCount =
		activityView === "technical"
			? scopedTechnicalEvents.length
			: operatorFeedRows.length;
	const showLiveSessionsPanel =
		showTechnicalPanels || scopedLiveSessionCards.length > 0;
	const showRecentActivityPanel =
		showTechnicalPanels || operatorFeedRows.length > 0;
	const showSessionHistoryPanel =
		showTechnicalPanels || scopedTimelineRows.length > 0;
	const showFocusedDrawingPanel = Boolean(
		selectedDrawingRow || selectedDrawingKey,
	);
	const showInlineFocusedDrawing =
		!showTechnicalPanels && showFocusedDrawingPanel;
	const showWorkstationsPanel =
		showTechnicalPanels || (!selectedDrawingKey && workstationRows.length > 0);
	const showHotProjectsPanel =
		showTechnicalPanels ||
		(!selectedProject && !selectedDrawingKey && projectRollupRows.length > 1);
	const showCoveragePanel = showWorkstationsPanel || showHotProjectsPanel;
	const coverageDescription =
		coverageView === "projects"
			? "Recent drawing time grouped by project in the current scope."
			: "Tracking health and recent drawing coverage by workstation.";
	const coverageLead =
		attentionRows[0]?.detail ??
		(coverageView === "projects"
			? "Compare tracked drawing time, live work, and recent project activity in one place."
			: "Review tracker health and recent workstation activity without dropping into raw collector detail.");
	const coverageState = attentionRows.some(
		(row) => row.tone === "needs-attention",
	)
		? "needs-attention"
		: attentionRows.length > 0
			? "background"
			: "ready";
	const activityPanelTitle =
		activityView === "technical" && showTechnicalPanels
			? "Raw collector events"
			: "Latest actions";

	useEffect(() => {
		if (!showCoveragePanel) {
			return;
		}
		if (!showHotProjectsPanel) {
			setCoverageView("workstations");
			return;
		}
		if (!showWorkstationsPanel) {
			setCoverageView("projects");
			return;
		}
		if (!showTechnicalPanels && !selectedProject && !selectedDrawingKey) {
			setCoverageView("projects");
			return;
		}
		if (selectedProject || selectedDrawingKey) {
			setCoverageView("workstations");
		}
	}, [
		selectedDrawingKey,
		selectedProject,
		showTechnicalPanels,
		showCoveragePanel,
		showHotProjectsPanel,
		showWorkstationsPanel,
	]);

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<div className={styles.mainColumn}>
					<PageContextBand
						mode="hero"
						eyebrow="Drawing telemetry"
						summary={
							<Text size="sm" color="muted" block>
								Track live CAD work, project attribution, and the drawing
								actions that matter without bouncing through engineering-only
								tooling.
								{selectedIssueSetLabel
									? ` Package ${selectedIssueSetLabel} is scoped to ${
											selectedIssueSet?.selectedDrawingPaths.length ?? 0
										} drawing${
											(selectedIssueSet?.selectedDrawingPaths.length ?? 0) === 1
												? ""
												: "s"
										}.`
									: ""}
							</Text>
						}
						meta={
							<div className={styles.contextMeta}>
								<TrustStateBadge state={trustState} />
								<Badge color="default" variant="outline" size="sm">
									Window {selectedWindowLabel}
								</Badge>
								{selectedIssueSetLabel ? (
									<Badge color="warning" variant="soft" size="sm">
										Package {selectedIssueSetLabel}
									</Badge>
								) : null}
								{focusedDrawingLabel ? (
									<Badge color="primary" variant="soft" size="sm">
										Drawing {focusedDrawingLabel}
									</Badge>
								) : null}
								<Badge color="accent" variant="soft" size="sm">
									Updated {formatRelativeTime(lastLoadedAt)}
								</Badge>
							</div>
						}
						actions={
							<div className={styles.contextActions}>
								<Button
									variant="outline"
									size="sm"
									iconLeft={<RefreshCw size={14} />}
									onClick={() => void loadWatchdogSnapshot()}
									loading={refreshing}
								>
									{refreshing ? "Refreshing..." : "Refresh"}
								</Button>
								<Button
									variant="secondary"
									size="sm"
									iconRight={<ArrowUpRight size={14} />}
									onClick={() => navigate("/app/projects")}
								>
									Projects
								</Button>
								{selectedProject ? (
									<Button
										variant="ghost"
										size="sm"
										iconRight={<ArrowUpRight size={14} />}
										onClick={() =>
											navigate(`/app/projects/${selectedProject.id}`)
										}
									>
										Open project
									</Button>
								) : null}
								{selectedDrawingKey ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => updateFilters({ drawing: "" })}
									>
										Clear drawing focus
									</Button>
								) : null}
								{selectedIssueSetId ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => updateFilters({ issueSet: "" })}
									>
										Clear package scope
									</Button>
								) : null}
							</div>
						}
					>
						<div className={styles.contextFacts}>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>Live sessions</span>
								<strong className={styles.contextFactValue}>
									{visibleLiveSessionCount}
								</strong>
							</div>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>
									{selectedProject || selectedDrawingKey
										? "Drawings in view"
										: "Projects active"}
								</span>
								<strong className={styles.contextFactValue}>
									{selectedProject || selectedDrawingKey
										? focusedDrawingCount
										: scopedProjectCount}
								</strong>
							</div>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>Tracked time</span>
								<strong className={styles.contextFactValue}>
									{formatDuration(totalTrackedDurationMs)}
								</strong>
							</div>
						</div>
					</PageContextBand>

					{errorMessage ? (
						<Panel variant="outline" padding="md" className={styles.notice}>
							<Text size="sm" color="warning" block>
								{errorMessage}
							</Text>
						</Panel>
					) : null}

					{loading && !firstViewportLoaded ? (
						<div className={styles.skeletonGrid} aria-hidden="true">
							<SurfaceSkeleton tone="feature" height="tall" lines={3} />
							<SurfaceSkeleton tone="support" height="regular" lines={4} />
							<SurfaceSkeleton tone="support" height="regular" lines={4} />
						</div>
					) : (
						<>
							{showLiveSessionsPanel ? (
								<Panel variant="feature" padding="lg" className={styles.panel}>
									<div className={styles.panelHeader}>
										<div>
											<Text size="sm" weight="semibold" block>
												Live activity
											</Text>
											<Text size="xs" color="muted" block>
												Current drawing activity from the AutoCAD collectors
												that match this scope.
											</Text>
										</div>
									</div>

									<div className={styles.liveSessionGrid}>
										{scopedLiveSessionCards.length === 0 ? (
											<div className={styles.emptyState}>
												{selectedDrawingRow
													? "No live AutoCAD sessions matched the selected drawing."
													: "No live AutoCAD sessions matched the current filters."}
											</div>
										) : (
											scopedLiveSessionCards.slice(0, 6).map((card) => (
												<div
													key={card.session.sessionId}
													className={styles.sessionCard}
												>
													<div className={styles.sessionCardHeader}>
														<div>
															<div className={styles.rowTitle}>
																{card.collectorName}
															</div>
															<div className={styles.rowMeta}>
																{resolveProjectDisplayName(
																	card.session.projectId,
																	projectNameMap,
																)}{" "}
																• {card.session.workstationId}
															</div>
														</div>
														<div className={styles.sessionBadges}>
															<Badge
																color={card.collectorStatusTone}
																variant="soft"
																size="sm"
															>
																{card.collectorStatus}
															</Badge>
															<Badge
																color={card.trackingTone}
																variant="soft"
																size="sm"
															>
																{getOperatorSessionLabel(card.session.status)}
															</Badge>
														</div>
													</div>
													<div className={styles.sessionDrawing}>
														{card.drawingLabel}
													</div>
													<div className={styles.sessionMeta}>
														<span>
															Started{" "}
															{formatRelativeTime(card.session.startedAt)}
														</span>
														<span>
															{formatDuration(card.session.durationMs)}
														</span>
														{showTechnicalPanels ? (
															<span>
																{card.session.commandCount} command(s)
															</span>
														) : null}
														<span>
															Tracker {formatRelativeTime(card.trackerAt)}
														</span>
													</div>
												</div>
											))
										)}
									</div>
								</Panel>
							) : null}

							<Panel variant="support" padding="lg" className={styles.panel}>
								<div className={styles.panelHeader}>
									<div>
										<Text size="sm" weight="semibold" block>
											{daybookTitle}
										</Text>
										<Text size="xs" color="muted" block>
											{daybookDescription}
										</Text>
									</div>
									<Badge color="accent" variant="soft" size="sm">
										{focusedDrawingCount} drawing
										{focusedDrawingCount === 1 ? "" : "s"}
									</Badge>
								</div>

								{showInlineFocusedDrawing ? (
									selectedDrawingRow ? (
										<div className={styles.inlineFocusCard}>
											<div className={styles.inlineFocusHeader}>
												<div>
													<div className={styles.rowTitle}>
														{selectedDrawingRow.drawingLabel}
													</div>
													<div className={styles.rowMeta}>
														{selectedDrawingRow.projectLabel} •{" "}
														{selectedDrawingRow.workstationIds.join(", ") ||
															"Unknown workstation"}
													</div>
												</div>
												<div className={styles.daybookBadges}>
													<Badge
														color={
															selectedDrawingRow.status === "activity"
																? "default"
																: getSessionTone(selectedDrawingRow.status)
														}
														variant="soft"
														size="sm"
													>
														{getOperatorSessionLabel(selectedDrawingRow.status)}
													</Badge>
												</div>
											</div>
											<div className={styles.focusInspectorMeta}>
												<span>
													{selectedDrawingRow.sessionCount} session(s)
												</span>
												<span>
													{formatDuration(selectedDrawingRow.totalDurationMs)}
												</span>
												<span>
													Last activity{" "}
													{formatRelativeTime(
														selectedDrawingRow.lastActivityAt,
													)}
												</span>
											</div>
											<div className={styles.filterActions}>
												<Button
													variant="outline"
													size="sm"
													onClick={() => updateFilters({ drawing: "" })}
												>
													Clear drawing focus
												</Button>
												{selectedDrawingRow.projectId ? (
													<Button
														variant="ghost"
														size="sm"
														iconRight={<ArrowUpRight size={14} />}
														onClick={() =>
															navigate(
																`/app/projects/${selectedDrawingRow.projectId}`,
															)
														}
													>
														Open project
													</Button>
												) : null}
											</div>
										</div>
									) : selectedDrawingKey ? (
										<div className={styles.inlineFocusCard}>
											<div className={styles.emptyState}>
												The selected drawing is outside the current scope. Clear
												the drawing focus or widen your filters.
											</div>
										</div>
									) : null
								) : null}

								<div className={styles.rowList}>
									{daybookRows.length === 0 ? (
										<div className={styles.emptyState}>
											No drawing activity matched the current Watchdog scope.
										</div>
									) : (
										daybookRows.map((row) => (
											<div
												key={row.drawingKey}
												className={[
													styles.daybookRow,
													selectedDrawingKey === row.drawingKey
														? styles.daybookRowSelected
														: "",
												]
													.filter(Boolean)
													.join(" ")}
											>
												<div className={styles.daybookMain}>
													<div className={styles.daybookHeader}>
														<div>
															<div className={styles.rowTitle}>
																{row.drawingLabel}
															</div>
															<div className={styles.rowMeta}>
																{row.projectLabel} •{" "}
																{row.workstationIds.join(", ") ||
																	"Unknown workstation"}
															</div>
														</div>
														<div className={styles.daybookBadges}>
															<Badge
																color={
																	row.status === "activity"
																		? "default"
																		: getSessionTone(row.status)
																}
																variant="soft"
																size="sm"
															>
																{getOperatorSessionLabel(row.status)}
															</Badge>
														</div>
													</div>
													<div className={styles.daybookSummary}>
														{row.latestActionLabel}
													</div>
													<div className={styles.rowMeta}>
														<span>{row.sessionCount} session(s)</span>
														<span>{formatDuration(row.totalDurationMs)}</span>
														{showTechnicalPanels ? (
															<span>{row.totalCommands} command(s)</span>
														) : null}
														<span>
															Last activity{" "}
															{formatRelativeTime(row.lastActivityAt)}
														</span>
													</div>
													{showTechnicalPanels ? (
														<div className={styles.daybookTechnical}>
															{row.latestTechnicalLabel}
														</div>
													) : null}
												</div>
												<div className={styles.daybookActions}>
													<Button
														variant={
															selectedDrawingKey === row.drawingKey
																? "secondary"
																: "ghost"
														}
														size="sm"
														onClick={() =>
															updateFilters({ drawing: row.drawingKey })
														}
													>
														{selectedDrawingKey === row.drawingKey
															? "In view"
															: "Inspect drawing"}
													</Button>
													{row.projectId && selectedProjectId === "all" ? (
														<Button
															variant="ghost"
															size="sm"
															onClick={() =>
																updateFilters({
																	project: row.projectId || "all",
																})
															}
														>
															Focus project
														</Button>
													) : null}
													{row.projectId ? (
														<Button
															variant="ghost"
															size="sm"
															iconRight={<ArrowUpRight size={14} />}
															onClick={() =>
																navigate(`/app/projects/${row.projectId}`)
															}
														>
															Open project
														</Button>
													) : null}
												</div>
											</div>
										))
									)}
								</div>
							</Panel>

							{showRecentActivityPanel ? (
								<Panel variant="support" padding="lg" className={styles.panel}>
									<div className={styles.panelHeader}>
										<div>
											<Text size="sm" weight="semibold" block>
												{activityPanelTitle}
											</Text>
											<Text size="xs" color="muted" block>
												{activityView === "technical"
													? technicalDescription
													: actionsDescription}
											</Text>
										</div>
										<Badge color="accent" variant="soft" size="sm">
											{activityCount} visible
										</Badge>
									</div>

									{showTechnicalPanels ? (
										<div className={styles.activityTabs}>
											<button
												type="button"
												className={[
													styles.activityTab,
													activityView === "actions"
														? styles.activityTabActive
														: "",
												]
													.filter(Boolean)
													.join(" ")}
												onClick={() => setActivityView("actions")}
											>
												Latest actions
											</button>
											<button
												type="button"
												className={[
													styles.activityTab,
													activityView === "technical"
														? styles.activityTabActive
														: "",
												]
													.filter(Boolean)
													.join(" ")}
												onClick={() => setActivityView("technical")}
											>
												Raw collector events
											</button>
										</div>
									) : null}

									<div className={styles.rowList}>
										{activityView === "technical" && showTechnicalPanels ? (
											scopedTechnicalEvents.length === 0 ? (
												<div className={styles.emptyState}>
													{selectedDrawingRow
														? "No raw collector events are available for the selected drawing."
														: "No raw collector events are available in this scope."}
												</div>
											) : (
												scopedTechnicalEvents.map((event) => (
													<div
														key={event.eventId}
														className={styles.technicalRow}
													>
														<div>
															<div className={styles.technicalBadges}>
																<Badge
																	color={
																		event.sourceType === "autocad"
																			? "primary"
																			: "default"
																	}
																	variant="outline"
																	size="sm"
																>
																	{getWatchdogTechnicalSourceLabel(event)}
																</Badge>
																{readCommandName(event) ? (
																	<Badge
																		color="accent"
																		variant="soft"
																		size="sm"
																	>
																		{readCommandName(event)}
																	</Badge>
																) : null}
															</div>
															<div className={styles.rowTitle}>
																{formatWatchdogTechnicalLabel(event)}
															</div>
															<div className={styles.rowMeta}>
																{basenameFromPath(
																	event.drawingPath || event.path,
																)}
															</div>
															<div className={styles.rowMeta}>
																{projectNameMap.get(event.projectId || "")
																	?.name ||
																	event.projectId ||
																	event.workstationId}
															</div>
														</div>
														<div className={styles.eventAside}>
															<span>{formatRelativeTime(event.timestamp)}</span>
														</div>
													</div>
												))
											)
										) : operatorFeedRows.length === 0 ? (
											<div className={styles.emptyState}>
												{selectedDrawingRow
													? "No recent drawing actions matched the selected drawing."
													: "No recent drawing actions matched the current window."}
											</div>
										) : (
											operatorFeedRows.map((event) => (
												<div key={event.eventId} className={styles.eventRow}>
													<div className={styles.eventRowMain}>
														<div className={styles.eventRowHeader}>
															<TrustStateBadge
																state={event.tone}
																variant="outline"
																size="sm"
															/>
															<span className={styles.rowTitle}>
																{event.label}
															</span>
														</div>
														<div className={styles.rowDetail}>
															{event.detail}
														</div>
														<div className={styles.rowMeta}>
															{event.context}
														</div>
													</div>
													<div className={styles.eventAside}>
														<span>{formatRelativeTime(event.timestamp)}</span>
													</div>
												</div>
											))
										)}
									</div>
								</Panel>
							) : null}

							{showSessionHistoryPanel ? (
								<Panel variant="support" padding="lg" className={styles.panel}>
									<div className={styles.panelHeader}>
										<div>
											<Text size="sm" weight="semibold" block>
												Recent sessions
											</Text>
											<Text size="xs" color="muted" block>
												{timelineDescription}
											</Text>
										</div>
										<Badge color="default" variant="outline" size="sm">
											{selectedWindowLabel}
										</Badge>
									</div>

									<div className={styles.timelineList}>
										{scopedTimelineRows.length === 0 ? (
											<div className={styles.emptyState}>
												{selectedDrawingRow
													? "No session timeline data is available for the selected drawing."
													: "No session timeline data is available in the selected window."}
											</div>
										) : (
											scopedTimelineRows.map((row) => (
												<div
													key={row.session.sessionId}
													className={styles.timelineRow}
												>
													<div className={styles.timelineHeader}>
														<div>
															<div className={styles.rowTitle}>
																{row.drawingLabel}
															</div>
															<div className={styles.rowMeta}>
																{getTimelineMetaLabel(row)}
															</div>
														</div>
														<div className={styles.timelineHeaderMeta}>
															<Badge
																color={getSessionTone(row.session.status)}
																variant="soft"
																size="sm"
															>
																{getOperatorSessionLabel(row.session.status)}
															</Badge>
															<span>
																{formatDuration(row.session.durationMs)}
															</span>
														</div>
													</div>
													<div className={styles.timelineTrack}>
														<div
															className={styles.timelineBar}
															style={{
																left: `${row.leftPercent}%`,
																width: `${row.widthPercent}%`,
															}}
														/>
													</div>
													<div className={styles.rowMeta}>
														Started {formatRelativeTime(row.session.startedAt)}{" "}
														• {row.session.commandCount} command(s)
													</div>
												</div>
											))
										)}
									</div>
								</Panel>
							) : null}
						</>
					)}
				</div>

				<aside className={styles.rightRail}>
					{showTechnicalPanels && showFocusedDrawingPanel ? (
						<Panel variant="support" padding="lg" className={styles.panel}>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Focused drawing
									</Text>
									<Text size="xs" color="muted" block>
										Use the daybook to keep the page centered on one drawing
										when you need to validate activity closely.
									</Text>
								</div>
							</div>

							{selectedDrawingRow ? (
								<div className={styles.focusInspector}>
									<div>
										<div className={styles.rowTitle}>
											{selectedDrawingRow.drawingLabel}
										</div>
										<div className={styles.rowMeta}>
											{selectedDrawingRow.projectLabel} •{" "}
											{selectedDrawingRow.workstationIds.join(", ") ||
												"Unknown workstation"}
										</div>
									</div>
									<div className={styles.daybookBadges}>
										<Badge
											color={
												selectedDrawingRow.status === "activity"
													? "default"
													: getSessionTone(selectedDrawingRow.status)
											}
											variant="soft"
											size="sm"
										>
											{getOperatorSessionLabel(selectedDrawingRow.status)}
										</Badge>
										<Badge color="default" variant="outline" size="sm">
											{selectedDrawingRow.collectorNames.join(", ") ||
												"Collector pending"}
										</Badge>
									</div>
									<div className={styles.focusInspectorMeta}>
										<span>{selectedDrawingRow.sessionCount} session(s)</span>
										<span>
											{formatDuration(selectedDrawingRow.totalDurationMs)}
										</span>
										{showTechnicalPanels ? (
											<span>{selectedDrawingRow.totalCommands} command(s)</span>
										) : null}
										<span>
											Last activity{" "}
											{formatRelativeTime(selectedDrawingRow.lastActivityAt)}
										</span>
									</div>
									{showTechnicalPanels && selectedDrawingRow.targetPath ? (
										<div className={styles.focusInspectorPath}>
											{selectedDrawingRow.targetPath}
										</div>
									) : null}
									<div className={styles.filterActions}>
										<Button
											variant="outline"
											size="sm"
											onClick={() => updateFilters({ drawing: "" })}
										>
											Clear drawing focus
										</Button>
										{selectedDrawingRow.projectId ? (
											<Button
												variant="ghost"
												size="sm"
												iconRight={<ArrowUpRight size={14} />}
												onClick={() =>
													navigate(
														`/app/projects/${selectedDrawingRow.projectId}`,
													)
												}
											>
												Open project
											</Button>
										) : null}
									</div>
								</div>
							) : selectedDrawingKey ? (
								<div className={styles.emptyState}>
									The selected drawing is outside the current scope. Clear the
									drawing focus or widen your filters.
								</div>
							) : null}
						</Panel>
					) : null}

					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Scope
								</Text>
								<Text size="xs" color="muted" block>
									Project, collector, and time window for this Watchdog view.
								</Text>
							</div>
						</div>

						<div className={styles.filterGrid}>
							<label htmlFor="watchdog-project-filter" className={styles.field}>
								<span className={styles.fieldLabel}>Project</span>
								<select
									id="watchdog-project-filter"
									name="watchdog_project_filter"
									className={styles.select}
									value={selectedProjectId}
									onChange={(event) =>
										updateFilters({ project: event.target.value })
									}
								>
									<option value="all">All projects</option>
									{projects.map((project) => (
										<option key={project.id} value={project.id}>
											{project.name}
										</option>
									))}
								</select>
							</label>

							<label
								htmlFor="watchdog-collector-filter"
								className={styles.field}
							>
								<span className={styles.fieldLabel}>Collector</span>
								<select
									id="watchdog-collector-filter"
									name="watchdog_collector_filter"
									className={styles.select}
									value={selectedCollectorId}
									onChange={(event) =>
										updateFilters({ collector: event.target.value })
									}
								>
									<option value="all">All collectors</option>
									{filteredCollectorOptions.map((collector) => (
										<option
											key={collector.collectorId}
											value={collector.collectorId}
										>
											{collector.name}
										</option>
									))}
								</select>
							</label>

							<label htmlFor="watchdog-window-filter" className={styles.field}>
								<span className={styles.fieldLabel}>Window</span>
								<select
									id="watchdog-window-filter"
									name="watchdog_window_filter"
									className={styles.select}
									value={selectedWindowHours}
									onChange={(event) =>
										updateFilters({ window: event.target.value })
									}
								>
									{WINDOW_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>
						</div>

						<div className={styles.filterActions}>
							<Button
								variant="outline"
								size="sm"
								iconLeft={<TimerReset size={14} />}
								onClick={() =>
									setSearchParams(new URLSearchParams(), { replace: true })
								}
								disabled={
									selectedProjectId === "all" &&
									selectedCollectorId === "all" &&
									selectedWindowHours === "24" &&
									!selectedDrawingKey
								}
							>
								Clear filters
							</Button>
							{selectedProject ? (
								<Button
									variant="ghost"
									size="sm"
									iconRight={<ArrowUpRight size={14} />}
									onClick={() =>
										navigate(`/app/projects/${selectedProject.id}`)
									}
								>
									Open project
								</Button>
							) : null}
						</div>
					</Panel>

					{showCoveragePanel ? (
						<Panel variant="support" padding="lg" className={styles.panel}>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Coverage
									</Text>
									<Text size="xs" color="muted" block>
										{coverageDescription}
									</Text>
									<Text
										size="xs"
										color="muted"
										block
										className={styles.coverageLead}
									>
										{coverageLead}
									</Text>
								</div>
								<TrustStateBadge state={coverageState} size="sm" />
							</div>

							{showWorkstationsPanel && showHotProjectsPanel ? (
								<div className={styles.filterRow}>
									<button
										type="button"
										className={
											coverageView === "workstations"
												? `${styles.filterChip} ${styles.filterChipActive}`
												: styles.filterChip
										}
										onClick={() => setCoverageView("workstations")}
									>
										Workstations
									</button>
									<button
										type="button"
										className={
											coverageView === "projects"
												? `${styles.filterChip} ${styles.filterChipActive}`
												: styles.filterChip
										}
										onClick={() => setCoverageView("projects")}
									>
										Projects
									</button>
								</div>
							) : null}

							<div className={styles.rowList}>
								{coverageView === "projects" ? (
									projectRollupRows.length === 0 ? (
										<div className={styles.emptyState}>
											No project attribution has been recorded in this window.
										</div>
									) : (
										projectRollupRows.map((entry) => (
											<button
												key={entry.projectId ?? entry.projectLabel}
												type="button"
												className={styles.projectRow}
												onClick={() =>
													entry.projectId
														? updateFilters({ project: entry.projectId })
														: undefined
												}
												disabled={!entry.projectId}
											>
												<div>
													<div className={styles.rowTitle}>
														{entry.projectLabel}
													</div>
													<div className={styles.rowMeta}>
														{entry.drawingCount} drawing
														{entry.drawingCount === 1 ? "" : "s"} •{" "}
														{formatDuration(entry.totalDurationMs)} tracked •{" "}
														{entry.activeDrawingCount} live • Updated{" "}
														{formatRelativeTime(entry.lastActivityAt)}
													</div>
												</div>
												<div className={styles.projectRowAside}>
													{entry.projectId ? <ArrowUpRight size={14} /> : null}
												</div>
											</button>
										))
									)
								) : workstationRows.length === 0 ? (
									<div className={styles.emptyState}>
										No workstations matched the current scope.
									</div>
								) : (
									workstationRows.slice(0, 8).map((row) => {
										return (
											<div
												key={row.workstationId}
												className={styles.collectorRow}
											>
												<div className={styles.collectorHeader}>
													<div>
														<div className={styles.rowTitle}>
															{row.workstationId}
														</div>
														<div className={styles.rowMeta}>
															{row.roleLabels.join(" • ")}
														</div>
													</div>
													<Badge
														color={row.needsAttention ? "warning" : "success"}
														variant="soft"
														size="sm"
													>
														{row.needsAttention ? "Needs attention" : "Ready"}
													</Badge>
												</div>
												<div className={styles.rowMeta}>
													{row.activeDrawingName || "No active drawing"}
												</div>
												<div className={styles.collectorMetaStrip}>
													<span>
														{row.onlineCollectors}/{row.collectorCount} online
													</span>
													<span>{row.paused ? "Paused" : "Tracking"}</span>
													<span>
														Updated {formatRelativeTime(row.trackerUpdatedAt)}
													</span>
													{showTechnicalPanels ? (
														<span>{row.pendingCount} pending</span>
													) : null}
												</div>
												{row.projectLabels.length > 0 ? (
													<div className={styles.rowMeta}>
														{row.projectLabels.slice(0, 2).join(" • ")}
													</div>
												) : null}
											</div>
										);
									})
								)}
							</div>
						</Panel>
					) : null}
				</aside>
			</div>
		</PageFrame>
	);
}
