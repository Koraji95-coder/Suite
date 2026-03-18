import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
} from "@/services/watchdogService";

export interface WatchdogCollectorRuntimeState {
	sourceAvailable: boolean;
	isPaused: boolean;
	activeDrawingPath: string | null;
	activeDrawingName: string | null;
	currentSessionId: string | null;
	trackerUpdatedAt: number | null;
	lastActivityAt: number | null;
	pendingCount: number;
}

function readNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function readText(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

export function isAutoCadCollector(collector: WatchdogCollector): boolean {
	if (collector.collectorType === "autocad_state") {
		return true;
	}
	return collector.capabilities.some((capability) =>
		["autocad", "drawing_sessions", "commands"].includes(capability),
	);
}

export function isAutoCadEvent(event: WatchdogCollectorEvent): boolean {
	if (event.collectorType === "autocad_state" || event.sourceType === "autocad") {
		return true;
	}
	return (
		event.eventType.startsWith("drawing_") ||
		event.eventType.startsWith("idle_") ||
		event.eventType === "command_executed"
	);
}

export function readWatchdogCollectorRuntimeState(
	collector: WatchdogCollector,
): WatchdogCollectorRuntimeState {
	const metadata = collector.metadata || {};
	return {
		sourceAvailable: Boolean(metadata.sourceAvailable),
		isPaused: Boolean(metadata.isPaused),
		activeDrawingPath: readText(metadata.activeDrawingPath),
		activeDrawingName: readText(metadata.activeDrawingName),
		currentSessionId: readText(metadata.currentSessionId),
		trackerUpdatedAt: readNumber(metadata.trackerUpdatedAt),
		lastActivityAt: readNumber(metadata.lastActivityAt),
		pendingCount: Math.max(0, readNumber(metadata.pendingCount) ?? 0),
	};
}

export function summarizeWatchdogTarget(
	event: Pick<
		WatchdogCollectorEvent,
		"drawingPath" | "path" | "projectId" | "sourceType"
	>,
): string {
	return (
		event.drawingPath ||
		event.path ||
		(event.projectId ? `Project ${event.projectId}` : null) ||
		event.sourceType ||
		"Collector event"
	);
}

export function basenameFromPath(pathValue: string | null | undefined): string {
	if (!pathValue) {
		return "Unknown";
	}
	const normalized = pathValue.replace(/\\/g, "/");
	const lastSegment = normalized.split("/").pop()?.trim();
	return lastSegment || pathValue;
}
