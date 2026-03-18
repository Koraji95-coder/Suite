import {
	basenameFromPath,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";

type SessionTone = "primary" | "warning" | "accent";
type CollectorTone = "success" | "warning";

export interface DashboardLiveAutoCadSessionCard {
	session: WatchdogSessionSummary;
	collectorName: string;
	collectorStatus: string;
	collectorStatusTone: CollectorTone;
	trackingLabel: string;
	trackingTone: SessionTone;
	drawingLabel: string;
	trackerAt: number | null;
}

export interface DashboardSessionTimelineRow {
	sequence: number;
	session: WatchdogSessionSummary;
	collectorName: string;
	trackerAt: number | null;
	leftPercent: number;
	widthPercent: number;
	projectName: string | null;
	drawingLabel: string;
	statusTone: SessionTone;
}

export interface DashboardWatchdogViewModel {
	filteredCollectorOptions: WatchdogCollector[];
	visibleCollectors: WatchdogCollector[];
	liveSessionCards: DashboardLiveAutoCadSessionCard[];
	activeCadSessionCount: number;
	sessionTimelineRows: DashboardSessionTimelineRow[];
}

interface BuildDashboardWatchdogViewModelArgs {
	allProjectsMap: ReadonlyMap<string, { name: string }>;
	collectors: WatchdogCollector[];
	selectedCollectorId: string;
	selectedProjectId: string;
	selectedWindowMs: number;
	watchdogEvents: WatchdogCollectorEvent[];
	watchdogSessions: WatchdogSessionSummary[];
	nowMs?: number;
}

function clampPercentage(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function getCollectorStatusTone(status: string | null | undefined): CollectorTone {
	return status === "online" ? "success" : "warning";
}

function getSessionStatusTone(
	status: WatchdogSessionSummary["status"],
): SessionTone {
	switch (status) {
		case "live":
			return "primary";
		case "paused":
			return "warning";
		default:
			return "accent";
	}
}

function getTrackingLabel(status: WatchdogSessionSummary["status"]): string {
	switch (status) {
		case "paused":
			return "Paused";
		case "completed":
			return "Idle";
		default:
			return "Live";
	}
}

function getVisibleCollectorIds(
	selectedProjectId: string,
	watchdogEvents: WatchdogCollectorEvent[],
	watchdogSessions: WatchdogSessionSummary[],
): Set<string> | null {
	if (selectedProjectId === "all") {
		return null;
	}

	const ids = new Set<string>();
	for (const event of watchdogEvents) {
		if (event.projectId === selectedProjectId) {
			ids.add(event.collectorId);
		}
	}
	for (const session of watchdogSessions) {
		if (session.projectId === selectedProjectId) {
			ids.add(session.collectorId);
		}
	}

	return ids;
}

function buildLiveSessionCards(
	sessions: WatchdogSessionSummary[],
	collectorById: ReadonlyMap<string, WatchdogCollector>,
): DashboardLiveAutoCadSessionCard[] {
	return sessions
		.filter((session) => session.active || session.status !== "completed")
		.map((session) => {
			const collector = collectorById.get(session.collectorId) ?? null;
			const runtime = collector
				? readWatchdogCollectorRuntimeState(collector)
				: null;

			return {
				session,
				collectorName: collector?.name || session.collectorId,
				collectorStatus: collector?.status || "unknown",
				collectorStatusTone: getCollectorStatusTone(collector?.status),
				trackingLabel: getTrackingLabel(session.status),
				trackingTone: getSessionStatusTone(session.status),
				drawingLabel: session.drawingPath
					? basenameFromPath(
							session.drawingPath ||
								runtime?.activeDrawingName ||
								runtime?.activeDrawingPath,
						)
					: "No active drawing",
				trackerAt:
					session.trackerUpdatedAt ||
					runtime?.trackerUpdatedAt ||
					collector?.lastHeartbeatAt ||
					session.latestEventAt,
			};
		});
}

function buildSessionTimelineRows(
	sessions: WatchdogSessionSummary[],
	collectorById: ReadonlyMap<string, WatchdogCollector>,
	allProjectsMap: ReadonlyMap<string, { name: string }>,
	selectedWindowMs: number,
	nowMs?: number,
): DashboardSessionTimelineRow[] {
	const windowEnd = nowMs ?? Date.now();
	const windowStart = windowEnd - selectedWindowMs;
	const safeWindow = Math.max(1, selectedWindowMs);

	return sessions.slice(0, 8).map((session, index) => {
		const collector = collectorById.get(session.collectorId) ?? null;
		const trackerAt =
			session.trackerUpdatedAt ??
			collector?.lastHeartbeatAt ??
			session.latestEventAt;
		const rawEnd =
			session.endedAt ??
			Math.max(
				session.latestEventAt,
				session.startedAt + Math.max(0, session.durationMs),
			);
		const boundedStart = Math.max(windowStart, session.startedAt);
		const boundedEnd = Math.min(windowEnd, Math.max(boundedStart, rawEnd));

		return {
			sequence: index + 1,
			session,
			collectorName: collector?.name || session.collectorId,
			trackerAt,
			leftPercent: clampPercentage(
				((boundedStart - windowStart) / safeWindow) * 100,
			),
			widthPercent: Math.max(
				2,
				clampPercentage(((boundedEnd - boundedStart) / safeWindow) * 100),
			),
			projectName: session.projectId
				? allProjectsMap.get(session.projectId)?.name ?? session.projectId
				: null,
			drawingLabel: basenameFromPath(session.drawingPath),
			statusTone: getSessionStatusTone(session.status),
		}
	});
}

export function buildDashboardWatchdogViewModel({
	allProjectsMap,
	collectors,
	selectedCollectorId,
	selectedProjectId,
	selectedWindowMs,
	watchdogEvents,
	watchdogSessions,
	nowMs,
}: BuildDashboardWatchdogViewModelArgs): DashboardWatchdogViewModel {
	const collectorById = new Map(
		collectors.map((collector) => [collector.collectorId, collector] as const),
	);
	const visibleCollectorIds = getVisibleCollectorIds(
		selectedProjectId,
		watchdogEvents,
		watchdogSessions,
	);

	const filteredCollectorOptions = collectors.filter((collector) => {
		if (selectedProjectId === "all") {
			return true;
		}
		return Boolean(visibleCollectorIds?.has(collector.collectorId));
	});

	const visibleCollectors = collectors.filter((collector) => {
		if (
			selectedCollectorId !== "all" &&
			collector.collectorId !== selectedCollectorId
		) {
			return false;
		}
		if (selectedProjectId === "all") {
			return true;
		}
		if (!visibleCollectorIds || visibleCollectorIds.size === 0) {
			return false;
		}
		return visibleCollectorIds.has(collector.collectorId);
	});

	const liveSessionCards = buildLiveSessionCards(watchdogSessions, collectorById);

	return {
		filteredCollectorOptions,
		visibleCollectors,
		liveSessionCards,
		activeCadSessionCount: liveSessionCards.filter((card) => card.session.active)
			.length,
		sessionTimelineRows: buildSessionTimelineRows(
			watchdogSessions,
			collectorById,
			allProjectsMap,
			selectedWindowMs,
			nowMs,
		),
	};
}
