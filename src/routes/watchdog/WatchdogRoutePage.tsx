import {
	Activity,
	ArrowUpRight,
	Building2,
	Monitor,
	RefreshCw,
	TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useNotification } from "@/auth/NotificationContext";
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
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import {
	isAutoCadCollector,
	isAutoCadEvent,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/features/project-workflow/issueSetService";
import { getCurrentSupabaseUserId } from "@/services/projectWorkflowClientSupport";
import { openRuntimeControlShell } from "@/services/runtimeControlService";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";
import { supabase } from "@/supabase/client";
import styles from "./WatchdogRoutePage.module.css";
import { presentWatchdogOperatorFeed } from "./watchdogPresentation";
import {
	buildAttentionRows,
	buildDaybookRows,
	buildProjectRollupRows,
	buildWorkstationRows,
	getOperatorSessionLabel,
	normalizeTargetKey,
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
		.join(" â€¢ ");
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
	let userId: string | null = null;
	try {
		userId = await getCurrentSupabaseUserId();
	} catch (error) {
		logger.warn(
			"WatchdogRoutePage",
			"Unable to resolve project options for Watchdog.",
			{ error },
		);
		return [];
	}
	if (!userId) {
		return [];
	}

	const { data, error: projectError } = await supabase
		.from("projects")
		.select("id, name")
		.eq("user_id", userId)
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
	const notification = useNotification();
	const [coverageView, setCoverageView] = useState<"workstations" | "projects">(
		"workstations",
	);
	const [openingRuntimeControl, setOpeningRuntimeControl] = useState(false);

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
	const daybookRows = useMemo(() => allDaybookRows.slice(0, 10), [allDaybookRows]);
	const operatorFeedRows = useMemo(() => operatorFeed.slice(0, 10), [operatorFeed]);
	const scopedLiveSessionCards = liveSessionCards;
	const scopedTimelineRows = sessionTimelineRows;
	const selectedWindowLabel =
		WINDOW_OPTIONS.find((option) => option.value === selectedWindowHours)
			?.label ?? `${selectedWindowHours} hours`;
	const cadCollectors = visibleCollectors.filter((collector) =>
		isAutoCadCollector(collector),
	);
	const coverageCollectors = showTechnicalPanels
		? visibleCollectors
		: cadCollectors;
	const workstationRows = useMemo(
		() =>
			buildWorkstationRows({
				collectors: coverageCollectors,
				projectNameMap,
				sessions: issueSetScopedSessions,
			}),
		[coverageCollectors, issueSetScopedSessions, projectNameMap],
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
	const cadCollectorsOnline = cadCollectors.filter(
		(collector) => collector.status === "online",
	).length;
	const trustState = getTrustState(errorMessage, visibleCollectors);
	const focusedDrawingCount = allDaybookRows.length;
	const visibleLiveSessionCount = activeCadSessionCount;
	const collectorAttentionCount = coverageCollectors.filter((collector) => {
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
	const daybookTitle = selectedProject
		? "Project drawing list"
		: "Drawing list";
	const selectedIssueSetLabel = selectedIssueSet?.issueTag ?? null;
	const selectedProjectLabel = selectedProject?.name ?? "All projects";
	const daybookDescription = selectedProject
		? "Tracked time, sessions, and the latest update for each drawing in the selected project."
		: "Tracked time, sessions, and the latest update for each drawing in this scope.";
	const actionsDescription = "Recent drawing activity in this scope.";
	const timelineDescription = "Session timing in this scope.";
	const firstViewportLoaded =
		hasLoadedOnce ||
		Boolean(overview) ||
		events.length > 0 ||
		sessions.length > 0 ||
		collectors.length > 0;
	const activityCount = operatorFeedRows.length;
	const showLiveSessionsPanel =
		showTechnicalPanels || scopedLiveSessionCards.length > 0;
	const showRecentActivityPanel =
		showTechnicalPanels || operatorFeedRows.length > 0;
	const showSessionHistoryPanel =
		showTechnicalPanels || scopedTimelineRows.length > 0;
	const showWorkstationsPanel =
		showTechnicalPanels || workstationRows.length > 0;
	const showHotProjectsPanel =
		showTechnicalPanels || (!selectedProject && projectRollupRows.length > 1);
	const showCoveragePanel = showWorkstationsPanel || showHotProjectsPanel;
	const coverageDescription =
		coverageView === "projects"
			? "Project coverage for the current scope."
			: "Workstation coverage for the current scope.";
	const coverageLead = "Check tracker health, project links, and live activity.";
	const coverageState = attentionRows.some(
		(row) => row.tone === "needs-attention",
	)
		? "needs-attention"
		: attentionRows.length > 0
			? "background"
			: "ready";
	const activityPanelTitle = "Recent activity";

	const handleOpenRuntimeControl = useCallback(async () => {
		if (openingRuntimeControl) {
			return;
		}
		setOpeningRuntimeControl(true);
		try {
			await openRuntimeControlShell();
			notification.success(
				"Opening Runtime Control",
				"Suite Runtime Control is starting so you can verify the CAD tracker.",
			);
		} catch (error) {
			const message =
				error instanceof Error && error.message
					? error.message
					: "Runtime Control could not be opened right now.";
			logger.warn(
				"WatchdogRoutePage",
				"Failed to open Runtime Control from coverage panel.",
				{ error },
			);
			notification.warning("Runtime Control did not open", message);
		} finally {
			setOpeningRuntimeControl(false);
		}
	}, [notification, openingRuntimeControl]);

	const handleOpenProjectSetup = useCallback(() => {
		if (selectedProject) {
			navigate(buildProjectDetailHref(selectedProject.id, "setup"));
			return;
		}
		navigate("/app/projects");
	}, [navigate, selectedProject]);

	const getCoverageAction = useCallback(
		(row: WatchdogAttentionRow) => {
			switch (row.actionKey) {
				case "runtime-control":
					return {
						label: row.actionLabel || "Open Runtime Control",
						onClick: handleOpenRuntimeControl,
						disabled: openingRuntimeControl,
					};
				case "project-setup":
					return {
						label:
							selectedProject && row.actionLabel
								? row.actionLabel
								: selectedProject
									? "Open project setup"
									: "Open project list",
						onClick: handleOpenProjectSetup,
						disabled: false,
					};
				case "project-list":
					return {
						label: row.actionLabel || "Open project list",
						onClick: () => navigate("/app/projects"),
						disabled: false,
					};
				default:
					return null;
			}
		},
		[
			handleOpenProjectSetup,
			handleOpenRuntimeControl,
			navigate,
			openingRuntimeControl,
			selectedProject,
		],
	);

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
								Follow live CAD work, project coverage, and recent drawing
								activity without digging through diagnostics.
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
									{selectedProject ? "Drawings in view" : "Projects active"}
								</span>
								<strong className={styles.contextFactValue}>
									{selectedProject ? focusedDrawingCount : scopedProjectCount}
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
											Live CAD sessions
										</Text>
										<Text size="xs" color="muted" block>
											Drawings that are active right now in this scope.
										</Text>
									</div>
								</div>

									<div className={styles.liveSessionGrid}>
										{scopedLiveSessionCards.length === 0 ? (
											<div className={styles.emptyState}>
												No drawing is active in this scope right now.
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
																â€¢ {card.session.workstationId}
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

								<div className={styles.rowList}>
									{daybookRows.length === 0 ? (
										<div className={styles.emptyState}>
											No drawing activity matched the current Watchdog scope.
										</div>
									) : (
										daybookRows.map((row) => (
											<div
												key={row.drawingKey}
												className={styles.daybookRow}
											>
												<div className={styles.daybookMain}>
													<div className={styles.daybookHeader}>
														<div>
															<div className={styles.rowTitle}>
																{row.drawingLabel}
															</div>
															<div className={styles.rowMeta}>
																{row.projectLabel} â€¢{" "}
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
											{actionsDescription}
										</Text>
									</div>
									<Badge color="accent" variant="soft" size="sm">
										{activityCount} visible
									</Badge>
								</div>

								<div className={styles.rowList}>
									{operatorFeedRows.length === 0 ? (
										<div className={styles.emptyState}>
											No recent drawing activity matched this time range.
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
												No session history is available in this time range.
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
														â€¢ {row.session.commandCount} command(s)
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
					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Scope
								</Text>
								<Text size="xs" color="muted" block>
									Project, package, and time range for this view.
								</Text>
							</div>
						</div>

						<div className={styles.scopeSummary}>
							<div className={styles.scopeChip}>
								<span className={styles.scopeChipLabel}>Project</span>
								<strong className={styles.scopeChipValue}>
									{selectedProjectLabel}
								</strong>
							</div>
							<div className={styles.scopeChip}>
								<span className={styles.scopeChipLabel}>Package</span>
								<strong className={styles.scopeChipValue}>
									{selectedIssueSetLabel ? `IFC ${selectedIssueSetLabel}` : "All"}
								</strong>
							</div>
							<div className={styles.scopeChip}>
								<span className={styles.scopeChipLabel}>Window</span>
								<strong className={styles.scopeChipValue}>
									{selectedWindowLabel}
								</strong>
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

							<label
								htmlFor="watchdog-window-filter"
								className={`${styles.field} ${styles.fieldWide}`}
							>
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
								Reset scope
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

							{attentionRows.length > 0 ? (
								<div className={styles.coverageAlertList}>
									{attentionRows.map((row) => {
										const action = getCoverageAction(row);
										return (
											<div
												key={row.key}
												className={styles.coverageAlert}
												data-tone={row.tone}
											>
												<div className={styles.coverageAlertHeader}>
													<Activity className={styles.coverageAlertIcon} size={14} />
													<span>{row.label}</span>
												</div>
												<p className={styles.coverageAlertDetail}>{row.detail}</p>
												{action ? (
													<div className={styles.coverageAlertActions}>
														<Button
															variant="ghost"
															size="sm"
															onClick={action.onClick}
															disabled={action.disabled}
														>
															{action.label}
														</Button>
													</div>
												) : null}
											</div>
										);
									})}
								</div>
							) : null}

							<div className={styles.coverageFactStrip}>
								<div className={styles.coverageFact}>
									<span className={styles.coverageFactLabel}>Projects</span>
									<strong className={styles.coverageFactValue}>
										{projectRollupRows.filter((row) => row.projectId).length}
									</strong>
								</div>
								<div className={styles.coverageFact}>
									<span className={styles.coverageFactLabel}>Workstations</span>
									<strong className={styles.coverageFactValue}>
										{workstationRows.length}
									</strong>
								</div>
								<div className={styles.coverageFact}>
									<span className={styles.coverageFactLabel}>Live</span>
									<strong className={styles.coverageFactValue}>
										{visibleLiveSessionCount}
									</strong>
								</div>
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
										<Monitor size={14} />
										<span>Workstations</span>
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
										<Building2 size={14} />
										<span>Projects</span>
									</button>
								</div>
							) : null}

							<div className={styles.rowList}>
								{coverageView === "projects" ? (
									projectRollupRows.length === 0 ? (
										<div className={styles.emptyState}>
											No project attribution has been recorded in this time range.
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
												<div className={styles.coverageRowMain}>
													<div className={styles.coverageRowHeader}>
														<div className={styles.coverageIconShell}>
															<Building2 size={16} />
														</div>
														<div className={styles.rowTitle}>
															{entry.projectLabel}
														</div>
													</div>
													<div className={styles.rowMeta}>
														{entry.drawingCount} drawing
														{entry.drawingCount === 1 ? "" : "s"} â€¢{" "}
														{formatDuration(entry.totalDurationMs)} tracked â€¢{" "}
														{entry.activeDrawingCount} live
													</div>
													<div className={styles.rowMeta}>
														Updated {formatRelativeTime(entry.lastActivityAt)}
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
										No workstations matched this scope.
									</div>
								) : (
									workstationRows.slice(0, 6).map((row) => {
										return (
											<div
												key={row.workstationId}
												className={styles.collectorRow}
											>
												<div className={styles.collectorHeader}>
													<div className={styles.coverageRowMain}>
														<div className={styles.coverageRowHeader}>
															<div className={styles.coverageIconShell}>
																<Monitor size={16} />
															</div>
															<div className={styles.rowTitle}>
																{row.workstationId}
															</div>
														</div>
														<div className={styles.rowMeta}>
															{row.roleLabels.join(" â€¢ ")}
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
														{row.projectLabels.slice(0, 2).join(" â€¢ ")}
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
