import { basenameFromPath, isAutoCadCollector, readWatchdogCollectorRuntimeState } from "@/lib/watchdogTelemetry";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import {
	formatWatchdogTechnicalLabel,
	presentWatchdogOperatorEvent,
} from "./watchdogPresentation";

export interface WatchdogDaybookRow {
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

export interface WatchdogAttentionRow {
	key: string;
	label: string;
	detail: string;
	tone: "ready" | "background" | "needs-attention" | "unavailable";
}

export interface WatchdogWorkstationRow {
	workstationId: string;
	collectorCount: number;
	onlineCollectors: number;
	activeDrawingName: string | null;
	projectLabels: string[];
	pendingCount: number;
	paused: boolean;
	needsAttention: boolean;
	trackerUpdatedAt: number | null;
	roleLabels: string[];
}

export interface WatchdogProjectRollupRow {
	projectId: string | null;
	projectLabel: string;
	drawingCount: number;
	activeDrawingCount: number;
	totalDurationMs: number;
	totalCommands: number;
	lastActivityAt: number;
}

export function normalizeTargetKey(
	value: string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}
	const normalized = value.replace(/\\/g, "/").trim().toLowerCase();
	return normalized || null;
}

export function resolveProjectDisplayName(
	projectId: string | null | undefined,
	projectNameMap: ReadonlyMap<string, { name: string }>,
): string {
	if (!projectId) {
		return "Unassigned activity";
	}
	return projectNameMap.get(projectId)?.name ?? "Tracked project";
}

export function getOperatorSessionLabel(
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

export function readCommandName(
	event: WatchdogCollectorEvent,
): string | null {
	const value = event.metadata?.commandName;
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim().toUpperCase();
	return trimmed || null;
}

export function resolveEventTargetPath(
	event: Pick<WatchdogCollectorEvent, "drawingPath" | "path">,
): string | null {
	return event.drawingPath || event.path || null;
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

function formatCollectorRole(collector: WatchdogCollector): string {
	if (isAutoCadCollector(collector)) {
		return "CAD tracker";
	}
	if (collector.collectorType === "filesystem") {
		return "Filesystem watcher";
	}
	return "Collector";
}

export function buildDaybookRows(args: {
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
			? resolveProjectDisplayName(options.projectId, projectNameMap)
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

export function buildWorkstationRows(args: {
	collectors: WatchdogCollector[];
	projectNameMap: ReadonlyMap<string, { name: string }>;
	sessions: WatchdogSessionSummary[];
}): WatchdogWorkstationRow[] {
	const { collectors, projectNameMap, sessions } = args;
	const rows = new Map<
		string,
		WatchdogWorkstationRow & {
			projectSet: Set<string>;
			roleSet: Set<string>;
		}
	>();

	for (const collector of collectors) {
		const runtime = readWatchdogCollectorRuntimeState(collector);
		const key = collector.workstationId || collector.collectorId;
		const existing = rows.get(key);
		const currentProjectId = sessions.find(
			(session) =>
				session.collectorId === collector.collectorId &&
				Boolean(session.projectId) &&
				session.active,
		)?.projectId;
		if (existing) {
			existing.collectorCount += 1;
			if (collector.status === "online") {
				existing.onlineCollectors += 1;
			}
			existing.pendingCount += runtime.pendingCount;
			existing.paused = existing.paused || runtime.isPaused;
			existing.needsAttention =
				existing.needsAttention ||
				collector.status !== "online" ||
				(isAutoCadCollector(collector) && !runtime.sourceAvailable) ||
				runtime.isPaused;
			if (!existing.activeDrawingName && runtime.activeDrawingName) {
				existing.activeDrawingName = runtime.activeDrawingName;
			}
			if ((runtime.trackerUpdatedAt ?? 0) > (existing.trackerUpdatedAt ?? 0)) {
				existing.trackerUpdatedAt = runtime.trackerUpdatedAt;
			}
			if (currentProjectId) {
				existing.projectSet.add(
					resolveProjectDisplayName(currentProjectId, projectNameMap),
				);
			}
			existing.roleSet.add(formatCollectorRole(collector));
			continue;
		}

		rows.set(key, {
			workstationId: key,
			collectorCount: 1,
			onlineCollectors: collector.status === "online" ? 1 : 0,
			activeDrawingName: runtime.activeDrawingName,
			projectLabels: [],
			pendingCount: runtime.pendingCount,
			paused: runtime.isPaused,
			needsAttention:
				collector.status !== "online" ||
				(isAutoCadCollector(collector) && !runtime.sourceAvailable) ||
				runtime.isPaused,
			trackerUpdatedAt: runtime.trackerUpdatedAt,
			roleLabels: [],
			projectSet: new Set(
				currentProjectId
					? [resolveProjectDisplayName(currentProjectId, projectNameMap)]
					: [],
			),
			roleSet: new Set([formatCollectorRole(collector)]),
		});
	}

	return Array.from(rows.values())
		.map((row) => ({
			workstationId: row.workstationId,
			collectorCount: row.collectorCount,
			onlineCollectors: row.onlineCollectors,
			activeDrawingName: row.activeDrawingName,
			projectLabels: Array.from(row.projectSet),
			pendingCount: row.pendingCount,
			paused: row.paused,
			needsAttention: row.needsAttention,
			trackerUpdatedAt: row.trackerUpdatedAt,
			roleLabels: Array.from(row.roleSet),
		}))
		.sort((left, right) => {
			if (left.needsAttention !== right.needsAttention) {
				return left.needsAttention ? -1 : 1;
			}
			return left.workstationId.localeCompare(right.workstationId);
		});
}

export function buildAttentionRows(args: {
	cadCollectorsOnline: number;
	collectorAttentionCount: number;
	unassignedCadCount: number;
	visibleLiveSessionCount: number;
}): WatchdogAttentionRow[] {
	const {
		cadCollectorsOnline,
		collectorAttentionCount,
		unassignedCadCount,
		visibleLiveSessionCount,
	} = args;
	const rows: WatchdogAttentionRow[] = [];
	if (collectorAttentionCount > 0) {
		rows.push({
			key: "collectors",
			label: "Collector health needs attention",
			detail: `${collectorAttentionCount} collector${collectorAttentionCount === 1 ? "" : "s"} need a check.`,
			tone: "needs-attention",
		});
	}
	if (unassignedCadCount > 0) {
		rows.push({
			key: "unassigned",
			label: "Unassigned drawing activity",
			detail: `${unassignedCadCount} drawing${unassignedCadCount === 1 ? "" : "s"} are not linked to a project yet.`,
			tone: "background",
		});
	}
	if (visibleLiveSessionCount === 0 && cadCollectorsOnline > 0) {
		rows.push({
			key: "idle",
			label: "No live CAD sessions right now",
			detail:
				"Collectors are online, but there is no active drawing session in this scope.",
			tone: "background",
		});
	}
	return rows.slice(0, 3);
}

export function buildProjectRollupRows(args: {
	daybookRows: WatchdogDaybookRow[];
}): WatchdogProjectRollupRow[] {
	const rows = new Map<string, WatchdogProjectRollupRow>();

	for (const row of args.daybookRows) {
		const key = row.projectId ?? "__unassigned__";
		const existing = rows.get(key);
		if (existing) {
			existing.drawingCount += 1;
			existing.activeDrawingCount += row.active ? 1 : 0;
			existing.totalDurationMs += row.totalDurationMs;
			existing.totalCommands += row.totalCommands;
			if (row.lastActivityAt > existing.lastActivityAt) {
				existing.lastActivityAt = row.lastActivityAt;
			}
			continue;
		}

		rows.set(key, {
			projectId: row.projectId,
			projectLabel: row.projectLabel,
			drawingCount: 1,
			activeDrawingCount: row.active ? 1 : 0,
			totalDurationMs: row.totalDurationMs,
			totalCommands: row.totalCommands,
			lastActivityAt: row.lastActivityAt,
		});
	}

	return Array.from(rows.values()).sort((left, right) => {
		if (right.lastActivityAt !== left.lastActivityAt) {
			return right.lastActivityAt - left.lastActivityAt;
		}
		return right.totalDurationMs - left.totalDurationMs;
	});
}
