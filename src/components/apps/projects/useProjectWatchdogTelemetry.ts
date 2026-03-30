import { useEffect, useMemo, useState } from "react";
import {
	isAutoCadCollector,
	isAutoCadEvent,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import {
	loadSharedProjectWatchdogRule,
	syncSharedDrawingActivityFromLocalRuntime,
} from "@/services/projectWatchdogService";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogProjectRule,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

type ProjectDrawingWorkSegmentRow =
	Database["public"]["Tables"]["project_drawing_work_segments"]["Row"];

export interface ProjectTrackedDrawingSegment {
	id: string;
	workDate: string;
	startedAt: string;
	endedAt: string;
	trackedMs: number;
	idleMs: number;
	commandCount: number;
	workstationId: string;
	sourceSessionId: string;
	syncKey: string;
	status: WatchdogSessionSummary["status"] | "logged";
	isLive: boolean;
}

export interface ProjectTrackedDrawingDayGroup {
	workDate: string;
	trackedMs: number;
	idleMs: number;
	segmentCount: number;
	lastWorkedAt: string | null;
	segments: ProjectTrackedDrawingSegment[];
}

export interface ProjectTrackedDrawingSummary {
	drawingPath: string;
	drawingName: string;
	lifetimeTrackedMs: number;
	todayTrackedMs: number;
	lastWorkedAt: string | null;
	daysWorkedCount: number;
	liveTrackedMs: number;
	liveStatus: WatchdogSessionSummary["status"] | null;
	dateGroups: ProjectTrackedDrawingDayGroup[];
}

export interface ProjectWatchdogTelemetry {
	loading: boolean;
	error: string | null;
	overview: WatchdogOverviewResponse | null;
	recentEvents: WatchdogCollectorEvent[];
	recentAutoCadEvents: WatchdogCollectorEvent[];
	sessions: WatchdogSessionSummary[];
	liveSessions: WatchdogSessionSummary[];
	autoCadCollectors: WatchdogCollector[];
	liveAutoCadCollectors: WatchdogCollector[];
	activeCadSessionCount: number;
	onlineCollectorCount: number;
	latestAutoCadEvent: WatchdogCollectorEvent | null;
	latestSession: WatchdogSessionSummary | null;
	totalCommandsInWindow: number;
	latestTrackerUpdatedAt: number | null;
	rule: WatchdogProjectRule | null;
	ruleConfigured: boolean;
	ruleUpdatedAt: number | null;
	trackedDrawings: ProjectTrackedDrawingSummary[];
}

function toLocalDateKey(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function isoFromTimestamp(timestampMs: number): string {
	return new Date(timestampMs).toISOString();
}

function pickLaterIso(
	currentValue: string | null,
	nextValue: string | null,
): string | null {
	if (!nextValue) {
		return currentValue;
	}
	if (!currentValue) {
		return nextValue;
	}
	return nextValue > currentValue ? nextValue : currentValue;
}

function buildTrackedDrawingSummaries(
	rows: ProjectDrawingWorkSegmentRow[],
	liveSessions: WatchdogSessionSummary[],
): ProjectTrackedDrawingSummary[] {
	const todayKey = toLocalDateKey();
	const drawingMap = new Map<
		string,
		ProjectTrackedDrawingSummary & {
			_dayMap: Map<string, ProjectTrackedDrawingDayGroup>;
		}
	>();

	const ensureDrawing = (
		drawingPath: string,
		drawingName: string | null | undefined,
	) => {
		const key = drawingPath.trim().toLowerCase();
		let current = drawingMap.get(key);
		if (current) {
			return current;
		}
		current = {
			drawingPath,
			drawingName:
				drawingName?.trim() || drawingPath.split(/[\\/]/).pop() || "Unknown",
			lifetimeTrackedMs: 0,
			todayTrackedMs: 0,
			lastWorkedAt: null,
			daysWorkedCount: 0,
			liveTrackedMs: 0,
			liveStatus: null,
			dateGroups: [],
			_dayMap: new Map(),
		};
		drawingMap.set(key, current);
		return current;
	};

	for (const row of rows) {
		const drawing = ensureDrawing(row.drawing_path, row.drawing_name);
		const trackedMs = Math.max(0, Number(row.tracked_ms || 0));
		const idleMs = Math.max(0, Number(row.idle_ms || 0));
		const workDate = row.work_date;
		const endedAt = row.segment_ended_at;
		const existingGroup = drawing._dayMap.get(workDate);
		const group =
			existingGroup ??
			(() => {
				const created: ProjectTrackedDrawingDayGroup = {
					workDate,
					trackedMs: 0,
					idleMs: 0,
					segmentCount: 0,
					lastWorkedAt: null,
					segments: [],
				};
				drawing._dayMap.set(workDate, created);
				return created;
			})();

		group.trackedMs += trackedMs;
		group.idleMs += idleMs;
		group.segmentCount += 1;
		group.lastWorkedAt = pickLaterIso(group.lastWorkedAt, endedAt);
		group.segments.push({
			id: row.id,
			workDate,
			startedAt: row.segment_started_at,
			endedAt,
			trackedMs,
			idleMs,
			commandCount: Math.max(0, Number(row.command_count || 0)),
			workstationId: row.workstation_id,
			sourceSessionId: row.source_session_id,
			syncKey: row.sync_key,
			status: "logged",
			isLive: false,
		});

		drawing.lifetimeTrackedMs += trackedMs;
		if (workDate === todayKey) {
			drawing.todayTrackedMs += trackedMs;
		}
		drawing.lastWorkedAt = pickLaterIso(drawing.lastWorkedAt, endedAt);
	}

	for (const session of liveSessions) {
		const drawingPath = String(session.drawingPath ?? "").trim();
		if (!drawingPath) continue;
		const drawing = ensureDrawing(drawingPath, null);
		const workDate = todayKey;
		const trackedMs = Math.max(0, Number(session.durationMs || 0));
		const idleMs = Math.max(0, Number(session.idleDurationMs || 0));
		const existingGroup = drawing._dayMap.get(workDate);
		const group =
			existingGroup ??
			(() => {
				const created: ProjectTrackedDrawingDayGroup = {
					workDate,
					trackedMs: 0,
					idleMs: 0,
					segmentCount: 0,
					lastWorkedAt: null,
					segments: [],
				};
				drawing._dayMap.set(workDate, created);
				return created;
			})();
		const endedAtIso = isoFromTimestamp(
			session.lastActivityAt ?? session.latestEventAt ?? Date.now(),
		);
		const startedAtIso = isoFromTimestamp(session.startedAt);

		group.trackedMs += trackedMs;
		group.idleMs += idleMs;
		group.segmentCount += 1;
		group.lastWorkedAt = pickLaterIso(group.lastWorkedAt, endedAtIso);
		group.segments.unshift({
			id: `live:${session.sessionId}`,
			workDate,
			startedAt: startedAtIso,
			endedAt: endedAtIso,
			trackedMs,
			idleMs,
			commandCount: Math.max(0, Number(session.commandCount || 0)),
			workstationId: session.workstationId,
			sourceSessionId: session.sessionId,
			syncKey: `live:${session.sessionId}`,
			status: session.status,
			isLive: true,
		});

		drawing.lifetimeTrackedMs += trackedMs;
		drawing.todayTrackedMs += trackedMs;
		drawing.liveTrackedMs += trackedMs;
		drawing.liveStatus =
			drawing.liveStatus === "live" ? drawing.liveStatus : session.status;
		drawing.lastWorkedAt = pickLaterIso(drawing.lastWorkedAt, endedAtIso);
	}

	return Array.from(drawingMap.values())
		.map((drawing) => {
			const dateGroups = Array.from(drawing._dayMap.values())
				.map((group) => ({
					...group,
					segments: [...group.segments].sort((left, right) =>
						right.endedAt.localeCompare(left.endedAt),
					),
				}))
				.sort((left, right) => right.workDate.localeCompare(left.workDate));
			return {
				drawingPath: drawing.drawingPath,
				drawingName: drawing.drawingName,
				lifetimeTrackedMs: drawing.lifetimeTrackedMs,
				todayTrackedMs: drawing.todayTrackedMs,
				lastWorkedAt: drawing.lastWorkedAt,
				daysWorkedCount: dateGroups.length,
				liveTrackedMs: drawing.liveTrackedMs,
				liveStatus: drawing.liveStatus,
				dateGroups,
			};
		})
		.sort((left, right) =>
			(right.lastWorkedAt || "").localeCompare(left.lastWorkedAt || ""),
		);
}

async function loadProjectDrawingSegments(
	projectId: string,
): Promise<ProjectDrawingWorkSegmentRow[]> {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();
	if (userError) {
		throw userError;
	}
	if (!user) {
		return [];
	}
	const { data, error } = await supabase
		.from("project_drawing_work_segments")
		.select("*")
		.eq("project_id", projectId)
		.eq("user_id", user.id)
		.order("segment_ended_at", { ascending: false });
	if (error) {
		throw error;
	}
	return (data ?? []) as ProjectDrawingWorkSegmentRow[];
}

export function useProjectWatchdogTelemetry(
	projectId: string,
	timeWindowMs: number = DEFAULT_WINDOW_MS,
): ProjectWatchdogTelemetry {
	const [overview, setOverview] = useState<WatchdogOverviewResponse | null>(
		null,
	);
	const [recentEvents, setRecentEvents] = useState<WatchdogCollectorEvent[]>(
		[],
	);
	const [sessions, setSessions] = useState<WatchdogSessionSummary[]>([]);
	const [allCollectors, setAllCollectors] = useState<WatchdogCollector[]>([]);
	const [rule, setRule] = useState<WatchdogProjectRule | null>(null);
	const [trackedDrawings, setTrackedDrawings] = useState<
		ProjectTrackedDrawingSummary[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			if (!projectId.trim()) {
				setOverview(null);
				setRecentEvents([]);
				setSessions([]);
				setAllCollectors([]);
				setRule(null);
				setTrackedDrawings([]);
				setLoading(false);
				setError(null);
				return;
			}

			setLoading(true);
			setError(null);

			const [
				overviewResult,
				eventsResult,
				sessionsResult,
				collectorsResult,
				ruleResult,
			] = await Promise.allSettled([
				watchdogService.getProjectOverview(projectId, {
					timeWindowMs,
				}),
				watchdogService.getProjectEvents(projectId, {
					limit: 6,
					sinceMs: Date.now() - timeWindowMs,
				}),
				watchdogService.getProjectSessions(projectId, {
					limit: 6,
					timeWindowMs,
				}),
				watchdogService.listCollectors(),
				loadSharedProjectWatchdogRule(projectId),
			]);

			let segmentRows: ProjectDrawingWorkSegmentRow[] = [];
			try {
				await syncSharedDrawingActivityFromLocalRuntime();
			} catch {
				// Live local time still merges in below, so sync failure should not break telemetry.
			}
			try {
				segmentRows = await loadProjectDrawingSegments(projectId);
			} catch (segmentError) {
				logger.warn(
					"Tracked drawing segment load failed.",
					"useProjectWatchdogTelemetry",
					segmentError,
				);
			}

			if (cancelled) {
				return;
			}

			if (overviewResult.status === "fulfilled") {
				setOverview(overviewResult.value);
			} else {
				setOverview(null);
				setError(
					overviewResult.reason instanceof Error
						? overviewResult.reason.message
						: "Project telemetry is unavailable.",
				);
			}

			const resolvedSessions =
				sessionsResult.status === "fulfilled"
					? (sessionsResult.value.sessions ?? [])
					: [];

			setRecentEvents(
				eventsResult.status === "fulfilled"
					? (eventsResult.value.events ?? [])
					: [],
			);
			setSessions(resolvedSessions);
			setAllCollectors(
				collectorsResult.status === "fulfilled"
					? (collectorsResult.value.collectors ?? [])
					: [],
			);
			setRule(
				ruleResult.status === "fulfilled" ? (ruleResult.value ?? null) : null,
			);
			setTrackedDrawings(
				buildTrackedDrawingSummaries(
					segmentRows,
					resolvedSessions.filter(
						(session) => session.active || session.status !== "completed",
					),
				),
			);
			setLoading(false);
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [projectId, timeWindowMs]);

	const projectCollectorIds = useMemo(() => {
		const ids = new Set<string>();
		for (const event of recentEvents) {
			ids.add(event.collectorId);
		}
		for (const session of sessions) {
			ids.add(session.collectorId);
		}
		return ids;
	}, [recentEvents, sessions]);

	const recentAutoCadEvents = useMemo(
		() =>
			recentEvents
				.filter((event) => isAutoCadEvent(event))
				.sort((left, right) => right.timestamp - left.timestamp),
		[recentEvents],
	);

	const autoCadCollectors = useMemo(() => {
		if (projectCollectorIds.size === 0) {
			return [];
		}
		return allCollectors.filter(
			(collector) =>
				projectCollectorIds.has(collector.collectorId) &&
				isAutoCadCollector(collector),
		);
	}, [allCollectors, projectCollectorIds]);

	const liveAutoCadCollectors = useMemo(
		() =>
			autoCadCollectors.filter((collector) => {
				const runtime = readWatchdogCollectorRuntimeState(collector);
				return Boolean(
					runtime.sourceAvailable ||
						runtime.currentSessionId ||
						runtime.activeDrawingPath,
				);
			}),
		[autoCadCollectors],
	);

	const liveSessions = useMemo(
		() =>
			sessions.filter(
				(session) => session.active || session.status !== "completed",
			),
		[sessions],
	);

	const activeCadSessionCount = useMemo(
		() => liveSessions.filter((session) => session.active).length,
		[liveSessions],
	);

	const latestTrackerUpdatedAt = useMemo(() => {
		let latest: number | null = null;
		for (const collector of liveAutoCadCollectors) {
			const trackerUpdatedAt =
				readWatchdogCollectorRuntimeState(collector).trackerUpdatedAt ??
				collector.lastHeartbeatAt;
			if (!latest || trackerUpdatedAt > latest) {
				latest = trackerUpdatedAt;
			}
		}
		return latest;
	}, [liveAutoCadCollectors]);

	const latestSession = useMemo(() => sessions[0] ?? null, [sessions]);

	const totalCommandsInWindow = useMemo(
		() =>
			sessions.reduce(
				(total, session) => total + Math.max(0, session.commandCount || 0),
				0,
			),
		[sessions],
	);

	const ruleConfigured = useMemo(() => {
		if (!rule) {
			return false;
		}
		return Boolean(
			rule.roots.length ||
				rule.includeGlobs.length ||
				rule.excludeGlobs.length ||
				rule.drawingPatterns.length,
		);
	}, [rule]);

	return {
		loading,
		error,
		overview,
		recentEvents,
		recentAutoCadEvents,
		sessions,
		liveSessions,
		autoCadCollectors,
		liveAutoCadCollectors,
		activeCadSessionCount,
		onlineCollectorCount: overview?.collectors.online ?? 0,
		latestAutoCadEvent: recentAutoCadEvents[0] ?? null,
		latestSession,
		totalCommandsInWindow,
		latestTrackerUpdatedAt,
		rule,
		ruleConfigured,
		ruleUpdatedAt: rule?.updatedAt ?? null,
		trackedDrawings,
	};
}
