export type DashboardPerfStatus = "ok" | "error" | "cancelled";

export interface DashboardPerfMeasurement {
	name: string;
	token: string;
	status: DashboardPerfStatus;
	startTimeMs: number;
	endTimeMs: number;
	durationMs: number;
	recordedAt: string;
	detail: Record<string, unknown>;
}

export interface DashboardPerfStore {
	latest: Record<string, DashboardPerfMeasurement>;
	history: DashboardPerfMeasurement[];
}

const DASHBOARD_PERF_HISTORY_LIMIT = 40;

let perfSequence = 0;

declare global {
	interface Window {
		__suiteDashboardPerf?: DashboardPerfStore;
	}
}

function getPerformanceApi(): Performance | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.performance ?? null;
}

function getDashboardPerfStore(): DashboardPerfStore | null {
	if (typeof window === "undefined") {
		return null;
	}
	if (!window.__suiteDashboardPerf) {
		window.__suiteDashboardPerf = {
			history: [],
			latest: {},
		};
	}
	return window.__suiteDashboardPerf;
}

function recordDashboardPerf(
	measurement: DashboardPerfMeasurement,
): DashboardPerfMeasurement {
	const store = getDashboardPerfStore();
	if (!store) {
		return measurement;
	}

	store.latest[measurement.name] = measurement;
	store.history = [...store.history, measurement].slice(
		-DASHBOARD_PERF_HISTORY_LIMIT,
	);

	return measurement;
}

function getLastPerformanceEntry(
	entries: PerformanceEntryList,
): PerformanceEntry | undefined {
	return entries.length > 0 ? entries[entries.length - 1] : undefined;
}

export function startDashboardPerfSpan(
	name: string,
	detail: Record<string, unknown> = {},
) {
	const performanceApi = getPerformanceApi();
	const token = `${name}:${++perfSequence}`;
	const startMark = `${token}:start`;
	const startTimeMs = performanceApi?.now() ?? 0;
	let completed = false;

	performanceApi?.mark(startMark);

	const finalize = (
		status: DashboardPerfStatus,
		extraDetail: Record<string, unknown> = {},
	): DashboardPerfMeasurement | null => {
		if (completed) {
			return null;
		}
		completed = true;

		const endMark = `${token}:end`;
		performanceApi?.mark(endMark);

		const startEntry = performanceApi
			? getLastPerformanceEntry(performanceApi.getEntriesByName(startMark, "mark"))
			: undefined;
		const endEntry = performanceApi
			? getLastPerformanceEntry(performanceApi.getEntriesByName(endMark, "mark"))
			: undefined;
		const resolvedStartTimeMs = startEntry?.startTime ?? startTimeMs;
		const resolvedEndTimeMs = endEntry?.startTime ?? performanceApi?.now() ?? 0;
		const durationMs = Math.max(
			0,
			resolvedEndTimeMs - resolvedStartTimeMs,
		);

		performanceApi?.clearMarks(startMark);
		performanceApi?.clearMarks(endMark);

		return recordDashboardPerf({
			detail: { ...detail, ...extraDetail },
			durationMs,
			endTimeMs: resolvedEndTimeMs,
			name,
			recordedAt: new Date().toISOString(),
			startTimeMs: resolvedStartTimeMs,
			status,
			token,
		});
	};

	return {
		cancel: (extraDetail?: Record<string, unknown>) =>
			finalize("cancelled", extraDetail),
		fail: (extraDetail?: Record<string, unknown>) =>
			finalize("error", extraDetail),
		finish: (extraDetail?: Record<string, unknown>) =>
			finalize("ok", extraDetail),
	};
}
