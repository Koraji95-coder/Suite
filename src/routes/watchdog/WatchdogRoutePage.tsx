import { ArrowUpRight, RefreshCw, TimerReset } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { logger } from "@/lib/errorLogger";
import {
	basenameFromPath,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
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
	presentWatchdogOperatorEvent,
	presentWatchdogOperatorFeed,
} from "./watchdogPresentation";

interface WatchdogProjectOption {
	id: string;
	name: string;
}

interface WatchdogDaybookRow {
	drawingKey: string;
	drawingLabel: string;
	targetPath: string | null;
	projectId: string | null;
	projectLabel: string;
	collectorNames: string[];
	workstationIds: string[];
	totalDurationMs: number;
	totalCommands: number;
	sessionCount: number;
	lastActivityAt: number;
	status: WatchdogSessionSummary["status"] | "activity";
	active: boolean;
	latestActionLabel: string;
	latestTechnicalLabel: string;
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

function formatGeneratedAt(value: number | null | undefined): string {
	if (!value || !Number.isFinite(value)) {
		return "—";
	}
	return new Date(value).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
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
		row.projectName || "Unassigned",
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

function getOperatorSessionLabel(
	status: WatchdogSessionSummary["status"] | "activity",
): string {
	switch (status) {
		case "live":
			return "Tracking";
		case "paused":
			return "Paused";
		case "completed":
			return "Completed";
		default:
			return "Recent activity";
	}
}

function readCommandName(event: WatchdogCollectorEvent): string | null {
	const value = event.metadata?.commandName;
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim().toUpperCase();
	return trimmed || null;
}

function resolveEventTargetPath(
	event: Pick<WatchdogCollectorEvent, "drawingPath" | "path">,
): string | null {
	return event.drawingPath || event.path || null;
}

function normalizeTargetKey(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const normalized = value.replace(/\\/g, "/").trim().toLowerCase();
	return normalized || null;
}

function getStatusRank(
	status: WatchdogSessionSummary["status"] | "activity",
): number {
	switch (status) {
		case "live":
			return 3;
		case "paused":
			return 2;
		case "completed":
			return 1;
		default:
			return 0;
	}
}

function buildDaybookRows(args: {
	events: WatchdogCollectorEvent[];
	sessions: WatchdogSessionSummary[];
	collectors: WatchdogCollector[];
	projectNameMap: ReadonlyMap<string, { name: string }>;
}): WatchdogDaybookRow[] {
	const { events, sessions, collectors, projectNameMap } = args;
	const collectorById = new Map(
		collectors.map((collector) => [collector.collectorId, collector] as const),
	);
	const rows = new Map<
		string,
		WatchdogDaybookRow & {
			collectorSet: Set<string>;
			workstationSet: Set<string>;
			latestActionAt: number;
			latestTechnicalAt: number;
		}
	>();

	const ensureRow = (
		key: string,
		options: {
			drawingLabel: string;
			targetPath: string | null;
			projectId: string | null;
			workstationId: string | null;
			collectorName: string | null;
			lastActivityAt?: number;
		},
	) => {
		const projectLabel = options.projectId
			? (projectNameMap.get(options.projectId)?.name ?? options.projectId)
			: "Workspace";
		let row = rows.get(key);
		if (row) {
			if (!row.projectId && options.projectId) {
				row.projectId = options.projectId;
				row.projectLabel = projectLabel;
			}
			if (!row.targetPath && options.targetPath) {
				row.targetPath = options.targetPath;
			}
			if (options.collectorName) {
				row.collectorSet.add(options.collectorName);
			}
			if (options.workstationId) {
				row.workstationSet.add(options.workstationId);
			}
			if ((options.lastActivityAt ?? 0) > row.lastActivityAt) {
				row.lastActivityAt = options.lastActivityAt ?? row.lastActivityAt;
			}
			return row;
		}
		row = {
			drawingKey: key,
			drawingLabel: options.drawingLabel,
			targetPath: options.targetPath,
			projectId: options.projectId,
			projectLabel,
			collectorNames: [],
			workstationIds: [],
			totalDurationMs: 0,
			totalCommands: 0,
			sessionCount: 0,
			lastActivityAt: options.lastActivityAt ?? 0,
			status: "activity",
			active: false,
			latestActionLabel: "Recent collector event",
			latestTechnicalLabel: "No technical event in window",
			collectorSet: new Set(
				options.collectorName ? [options.collectorName] : [],
			),
			workstationSet: new Set(
				options.workstationId ? [options.workstationId] : [],
			),
			latestActionAt: 0,
			latestTechnicalAt: 0,
		};
		rows.set(key, row);
		return row;
	};

	for (const session of sessions) {
		const targetPath = session.drawingPath || `session:${session.sessionId}`;
		const key =
			normalizeTargetKey(targetPath) ?? `session:${session.sessionId}`;
		const collectorName =
			collectorById.get(session.collectorId)?.name ?? session.collectorId;
		const row = ensureRow(key, {
			drawingLabel: basenameFromPath(session.drawingPath),
			targetPath: session.drawingPath || null,
			projectId: session.projectId ?? null,
			workstationId: session.workstationId,
			collectorName,
			lastActivityAt:
				session.lastActivityAt ?? session.latestEventAt ?? session.startedAt,
		});
		row.totalDurationMs += Math.max(0, Number(session.durationMs || 0));
		row.totalCommands += Math.max(0, Number(session.commandCount || 0));
		row.sessionCount += 1;
		row.active = row.active || session.active;
		if (getStatusRank(session.status) > getStatusRank(row.status)) {
			row.status = session.status;
		}
	}

	for (const event of events) {
		const targetPath = resolveEventTargetPath(event);
		const key = normalizeTargetKey(targetPath);
		if (!key || !targetPath) {
			continue;
		}
		const collectorName =
			collectorById.get(event.collectorId)?.name ?? event.collectorId;
		const row = ensureRow(key, {
			drawingLabel: basenameFromPath(targetPath),
			targetPath,
			projectId: event.projectId ?? null,
			workstationId: event.workstationId,
			collectorName,
			lastActivityAt: event.timestamp,
		});
		const presented = presentWatchdogOperatorEvent(event, projectNameMap);
		if (presented && event.timestamp >= row.latestActionAt) {
			row.latestActionAt = event.timestamp;
			row.latestActionLabel = presented.label;
		}
		if (event.timestamp >= row.latestTechnicalAt) {
			row.latestTechnicalAt = event.timestamp;
			row.latestTechnicalLabel = formatWatchdogTechnicalLabel(event);
		}
	}

	return Array.from(rows.values())
		.map((row) => ({
			drawingKey: row.drawingKey,
			drawingLabel: row.drawingLabel,
			targetPath: row.targetPath,
			projectId: row.projectId,
			projectLabel: row.projectLabel,
			collectorNames: Array.from(row.collectorSet),
			workstationIds: Array.from(row.workstationSet),
			totalDurationMs: row.totalDurationMs,
			totalCommands: row.totalCommands,
			sessionCount: row.sessionCount,
			lastActivityAt: row.lastActivityAt,
			status: row.status,
			active: row.active,
			latestActionLabel: row.latestActionLabel,
			latestTechnicalLabel: row.latestTechnicalLabel,
		}))
		.sort((left, right) => right.lastActivityAt - left.lastActivityAt);
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

	useRegisterPageHeader({
		title: "Watchdog",
		subtitle:
			"Collector health, drawing activity, and project-attributed AutoCAD sessions.",
	});

	const selectedProjectId = searchParams.get("project") || "all";
	const selectedCollectorId = searchParams.get("collector") || "all";
	const selectedWindowHours = searchParams.get("window") || "24";
	const selectedDrawingKey = normalizeTargetKey(searchParams.get("drawing"));
	const selectedWindowMs =
		Math.max(1, Number.parseInt(selectedWindowHours, 10) || 24) *
		60 *
		60 *
		1000;

	const [projects, setProjects] = useState<WatchdogProjectOption[]>([]);
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
				limit: 18,
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

	const projectNameMap = useMemo(
		() =>
			new Map(projects.map((project) => [project.id, { name: project.name }])),
		[projects],
	);
	const selectedProject =
		selectedProjectId !== "all"
			? projects.find((project) => project.id === selectedProjectId) || null
			: null;
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
				watchdogEvents: events,
				watchdogSessions: sessions,
			}),
		[
			collectors,
			events,
			projectNameMap,
			selectedCollectorId,
			selectedProjectId,
			selectedWindowMs,
			sessions,
		],
	);
	const operatorFeed = useMemo(
		() => presentWatchdogOperatorFeed(events, projectNameMap),
		[events, projectNameMap],
	);
	const allDaybookRows = useMemo(
		() =>
			buildDaybookRows({
				events,
				sessions,
				collectors,
				projectNameMap,
			}),
		[collectors, events, projectNameMap, sessions],
	);
	const selectedDrawingRow = useMemo(
		() =>
			selectedDrawingKey
				? (allDaybookRows.find((row) => row.drawingKey === selectedDrawingKey) ??
					null)
				: null,
		[allDaybookRows, selectedDrawingKey],
	);
	const daybookRows = useMemo(() => {
		if (!selectedDrawingRow) {
			return allDaybookRows.slice(0, 10);
		}
		const visibleRows = allDaybookRows.slice(0, 10);
		if (visibleRows.some((row) => row.drawingKey === selectedDrawingRow.drawingKey)) {
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
				? events.filter(
						(event) =>
							normalizeTargetKey(resolveEventTargetPath(event)) ===
							selectedDrawingKey,
					)
				: events
			).slice(0, 10),
		[events, selectedDrawingKey],
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
	const hotProjects = (overview?.projects.top ?? []).slice(0, 6);
	const selectedWindowLabel =
		WINDOW_OPTIONS.find((option) => option.value === selectedWindowHours)
			?.label ?? `${selectedWindowHours} hours`;
	const collectorsOnline = visibleCollectors.filter(
		(collector) => collector.status === "online",
	).length;
	const trustState = getTrustState(errorMessage, visibleCollectors);
	const focusedDrawingCount = allDaybookRows.length;
	const daybookTitle = selectedProject ? "Project daybook" : "Drawing daybook";
	const focusedDrawingLabel =
		selectedDrawingRow?.drawingLabel ||
		basenameFromPath(searchParams.get("drawing"));
	const daybookDescription = focusedDrawingLabel
		? `Pinned on ${focusedDrawingLabel}, while the rest of the route tightens around that drawing.`
		: selectedProject
			? "Recent drawing work for the selected project, grouped into the same surface you use to validate live AutoCAD activity."
			: "Recent drawing work across the current Watchdog scope, with tighter project drill-downs and the latest meaningful action.";
	const operatorFeedDescription = selectedDrawingRow
		? `Cleaned actions for ${selectedDrawingRow.drawingLabel}.`
		: focusedDrawingLabel
			? `Cleaned actions for ${focusedDrawingLabel}.`
		: "Cleaned event labels for the drawing actions you actually care about.";
	const timelineDescription = selectedDrawingRow
		? `Window-relative session bars for ${selectedDrawingRow.drawingLabel}.`
		: focusedDrawingLabel
			? `Window-relative session bars for ${focusedDrawingLabel}.`
		: "Window-relative session bars for the current scope.";
	const technicalDescription = selectedDrawingRow
		? `Raw collector detail scoped to ${selectedDrawingRow.drawingLabel}.`
		: focusedDrawingLabel
			? `Raw collector detail scoped to ${focusedDrawingLabel}.`
		: "Raw event names and collector detail for deeper diagnostics.";
	const visibleLiveSessionCount = selectedDrawingKey
		? scopedLiveSessionCards.length
		: activeCadSessionCount;
	const firstViewportLoaded =
		hasLoadedOnce ||
		Boolean(overview) ||
		events.length > 0 ||
		sessions.length > 0 ||
		collectors.length > 0;

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<div className={styles.mainColumn}>
					<PageContextBand
						mode="hero"
						eyebrow="Drawing telemetry"
						summary={
							<Text size="sm" color="muted" block>
								Watch local collectors, live AutoCAD sessions, project
								attribution, and the drawing actions that matter without
								bouncing through the dashboard.
							</Text>
						}
						meta={
							<div className={styles.contextMeta}>
								<TrustStateBadge state={trustState} />
								<Badge color="default" variant="outline" size="sm">
									Window {selectedWindowLabel}
								</Badge>
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
									Project Manager
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
							</div>
						}
					>
						<div className={styles.contextStats}>
							<div className={styles.contextStatCard}>
								<span className={styles.contextStatLabel}>
									Collectors online
								</span>
								<strong className={styles.contextStatValue}>
									{collectorsOnline}/
									{visibleCollectors.length || collectors.length || 0}
								</strong>
							</div>
							<div className={styles.contextStatCard}>
								<span className={styles.contextStatLabel}>Live sessions</span>
								<strong className={styles.contextStatValue}>
									{visibleLiveSessionCount}
								</strong>
							</div>
							<div className={styles.contextStatCard}>
								<span className={styles.contextStatLabel}>
									Events in window
								</span>
								<strong className={styles.contextStatValue}>
									{overview?.events.inWindow ?? events.length}
								</strong>
							</div>
							<div className={styles.contextStatCard}>
								<span className={styles.contextStatLabel}>Project focus</span>
								<strong className={styles.contextStatValue}>
									{selectedProject?.name || "All projects"}
								</strong>
							</div>
							<div className={styles.contextStatCard}>
								<span className={styles.contextStatLabel}>
									Drawings in scope
								</span>
								<strong className={styles.contextStatValue}>
									{focusedDrawingCount}
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
							<Panel variant="feature" padding="lg" className={styles.panel}>
								<div className={styles.panelHeader}>
									<div>
										<Text size="sm" weight="semibold" block>
											Live CAD sessions
										</Text>
										<Text size="xs" color="muted" block>
											Current drawing activity from the AutoCAD collectors that
											match this scope.
										</Text>
									</div>
									<Badge color="primary" variant="soft" size="sm">
										{scopedLiveSessionCards.length} live
									</Badge>
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
															{card.session.projectId
																? (projectNameMap.get(card.session.projectId)
																		?.name ?? card.session.projectId)
																: "Workspace"}{" "}
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
														Started {formatRelativeTime(card.session.startedAt)}
													</span>
													<span>{formatDuration(card.session.durationMs)}</span>
													<span>{card.session.commandCount} command(s)</span>
													<span>
														Tracker {formatRelativeTime(card.trackerAt)}
													</span>
												</div>
											</div>
										))
									)}
								</div>
							</Panel>

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
														<span>{row.totalCommands} command(s)</span>
														<span>
															Last activity{" "}
															{formatRelativeTime(row.lastActivityAt)}
														</span>
													</div>
													<div className={styles.daybookTechnical}>
														{row.latestTechnicalLabel}
													</div>
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
															? "Focused"
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

							<Panel variant="support" padding="lg" className={styles.panel}>
								<div className={styles.panelHeader}>
									<div>
										<Text size="sm" weight="semibold" block>
											Operator feed
										</Text>
										<Text size="xs" color="muted" block>
											{operatorFeedDescription}
										</Text>
									</div>
									<Badge color="accent" variant="soft" size="sm">
										{operatorFeedRows.length} visible
									</Badge>
								</div>

								<div className={styles.rowList}>
									{operatorFeedRows.length === 0 ? (
										<div className={styles.emptyState}>
											{selectedDrawingRow
												? "No user-facing drawing actions matched the selected drawing."
												: "No user-facing drawing actions matched the current window."}
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
													<div className={styles.rowDetail}>{event.detail}</div>
													<div className={styles.rowMeta}>{event.context}</div>
												</div>
												<div className={styles.eventAside}>
													<span>{formatRelativeTime(event.timestamp)}</span>
												</div>
											</div>
										))
									)}
								</div>
							</Panel>

							<Panel variant="support" padding="lg" className={styles.panel}>
								<div className={styles.panelHeader}>
									<div>
										<Text size="sm" weight="semibold" block>
											Session timeline
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
													Started {formatRelativeTime(row.session.startedAt)} •{" "}
													{row.session.commandCount} command(s)
												</div>
											</div>
										))
									)}
								</div>
							</Panel>
						</>
					)}
				</div>

				<aside className={styles.rightRail}>
					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Drawing focus
								</Text>
								<Text size="xs" color="muted" block>
									Use the daybook to tighten the page around one drawing when
									you need to validate real activity.
								</Text>
							</div>
							{selectedDrawingRow ? (
								<Badge color="primary" variant="soft" size="sm">
									Focused
								</Badge>
							) : null}
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
									<span>{selectedDrawingRow.totalCommands} command(s)</span>
									<span>
										Last activity{" "}
										{formatRelativeTime(selectedDrawingRow.lastActivityAt)}
									</span>
								</div>
								<div className={styles.daybookSummary}>
									{selectedDrawingRow.latestActionLabel}
								</div>
								<div className={styles.daybookTechnical}>
									{selectedDrawingRow.latestTechnicalLabel}
								</div>
								{selectedDrawingRow.targetPath ? (
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
						) : (
							<div className={styles.emptyState}>
								Pick a drawing from the daybook to scope the feed, timeline, and
								technical stream.
							</div>
						)}
					</Panel>

					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Scope filters
								</Text>
								<Text size="xs" color="muted" block>
									Keep one scoped Watchdog view for projects, collectors, and
									time.
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

					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Collectors
								</Text>
								<Text size="xs" color="muted" block>
									Runtime health, active drawings, and collector heartbeat
									status.
								</Text>
							</div>
							<Badge color="success" variant="soft" size="sm">
								{collectorsOnline} online
							</Badge>
						</div>

						<div className={styles.rowList}>
							{visibleCollectors.length === 0 ? (
								<div className={styles.emptyState}>
									No collectors matched the current scope.
								</div>
							) : (
								visibleCollectors.slice(0, 8).map((collector) => {
									const runtime = readWatchdogCollectorRuntimeState(collector);
									return (
										<div
											key={collector.collectorId}
											className={styles.collectorRow}
										>
											<div className={styles.collectorHeader}>
												<div>
													<div className={styles.rowTitle}>
														{collector.name}
													</div>
													<div className={styles.rowMeta}>
														{collector.workstationId} •{" "}
														{collector.collectorType}
													</div>
												</div>
												<Badge
													color={
														collector.status === "online"
															? "success"
															: "warning"
													}
													variant="soft"
													size="sm"
												>
													{collector.status}
												</Badge>
											</div>
											<div className={styles.rowMeta}>
												{runtime.activeDrawingName ||
													basenameFromPath(runtime.activeDrawingPath) ||
													"No active drawing"}
											</div>
											<div className={styles.collectorMetaStrip}>
												<span>{runtime.isPaused ? "Paused" : "Tracking"}</span>
												<span>{runtime.pendingCount} pending</span>
												<span>
													Tracker {formatRelativeTime(runtime.trackerUpdatedAt)}
												</span>
											</div>
										</div>
									);
								})
							)}
						</div>
					</Panel>

					<Panel variant="support" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									High-activity projects
								</Text>
								<Text size="xs" color="muted" block>
									Projects with the most attributed Watchdog activity in this
									window.
								</Text>
							</div>
						</div>

						<div className={styles.rowList}>
							{hotProjects.length === 0 ? (
								<div className={styles.emptyState}>
									No project attribution has been recorded in this window.
								</div>
							) : (
								hotProjects.map((entry) => (
									<button
										key={entry.projectId}
										type="button"
										className={styles.projectRow}
										onClick={() => updateFilters({ project: entry.projectId })}
									>
										<div>
											<div className={styles.rowTitle}>
												{projectNameMap.get(entry.projectId)?.name ||
													entry.projectId}
											</div>
											<div className={styles.rowMeta}>{entry.projectId}</div>
										</div>
										<div className={styles.projectRowAside}>
											<span>{entry.eventCount} event(s)</span>
											<ArrowUpRight size={14} />
										</div>
									</button>
								))
							)}
						</div>
					</Panel>

					<Panel variant="sunken" padding="lg" className={styles.panel}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Technical stream
								</Text>
								<Text size="xs" color="muted" block>
									{technicalDescription}
								</Text>
							</div>
							<Badge color="default" variant="outline" size="sm">
								{formatGeneratedAt(overview?.generatedAt)}
							</Badge>
						</div>

						<div className={styles.rowList}>
							{scopedTechnicalEvents.length === 0 ? (
								<div className={styles.emptyState}>
									{selectedDrawingRow
										? "No raw events are available for the selected drawing."
										: "No raw events are available in this scope."}
								</div>
							) : (
								scopedTechnicalEvents.map((event) => (
									<div key={event.eventId} className={styles.technicalRow}>
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
													<Badge color="accent" variant="soft" size="sm">
														{readCommandName(event)}
													</Badge>
												) : null}
											</div>
											<div className={styles.rowTitle}>
												{formatWatchdogTechnicalLabel(event)}
											</div>
											<div className={styles.rowMeta}>
												{basenameFromPath(event.drawingPath || event.path)}
											</div>
											<div className={styles.rowMeta}>
												{projectNameMap.get(event.projectId || "")?.name ||
													event.projectId ||
													event.workstationId}
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
				</aside>
			</div>
		</PageFrame>
	);
}
