import { useEffect, useMemo, useState } from "react";
import {
	isAutoCadCollector,
	isAutoCadEvent,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogProjectRule,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
}

export function useProjectWatchdogTelemetry(
	projectId: string,
	timeWindowMs: number = DEFAULT_WINDOW_MS,
): ProjectWatchdogTelemetry {
	const [overview, setOverview] = useState<WatchdogOverviewResponse | null>(null);
	const [recentEvents, setRecentEvents] = useState<WatchdogCollectorEvent[]>([]);
	const [sessions, setSessions] = useState<WatchdogSessionSummary[]>([]);
	const [allCollectors, setAllCollectors] = useState<WatchdogCollector[]>([]);
	const [rule, setRule] = useState<WatchdogProjectRule | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			setLoading(true);
			setError(null);

			const [overviewResult, eventsResult, sessionsResult, collectorsResult, ruleResult] =
				await Promise.allSettled([
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
					watchdogService.getProjectRule(projectId),
				]);

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

			setRecentEvents(
				eventsResult.status === "fulfilled" ? eventsResult.value.events ?? [] : [],
			);
			setSessions(
				sessionsResult.status === "fulfilled"
					? sessionsResult.value.sessions ?? []
					: [],
			);
			setAllCollectors(
				collectorsResult.status === "fulfilled"
					? collectorsResult.value.collectors ?? []
					: [],
			);
			setRule(ruleResult.status === "fulfilled" ? ruleResult.value.rule ?? null : null);
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
		return ids;
	}, [recentEvents]);

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
	};
}
