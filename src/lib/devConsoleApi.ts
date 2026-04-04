import {
	clearAppDiagnostics,
	getAppDiagnostics,
	type AppDiagnostic,
} from "@/lib/appDiagnostics";
import { LogLevel, logger } from "@/lib/logger";

type SuiteLogEntry = ReturnType<typeof logger.getHistory>[number];

export interface SuiteLogsConsoleApi {
	levels: readonly LogLevel[];
	get: (level?: LogLevel | string | null) => SuiteLogEntry[];
	clear: () => void;
	export: (level?: LogLevel | string | null) => string;
}

export interface SuiteDiagnosticsConsoleApi {
	get: () => AppDiagnostic[];
	clear: () => void;
	export: () => string;
}

declare global {
	interface Window {
		__suiteLogs?: SuiteLogsConsoleApi;
		__suiteDiagnostics?: SuiteDiagnosticsConsoleApi;
	}
}

const LOG_LEVELS = [
	LogLevel.DEBUG,
	LogLevel.INFO,
	LogLevel.WARN,
	LogLevel.ERROR,
] as const;

function normalizeLogLevel(
	level?: LogLevel | string | null,
): LogLevel | undefined {
	if (level === undefined || level === null) {
		return undefined;
	}

	const normalized = String(level).trim().toUpperCase();
	if (!normalized) {
		return undefined;
	}

	const match = LOG_LEVELS.find((candidate) => candidate === normalized);
	if (match) {
		return match;
	}

	throw new Error(
		`Unknown Suite log level '${level}'. Use one of: ${LOG_LEVELS.join(", ")}.`,
	);
}

function exportJson(value: unknown) {
	return JSON.stringify(value, null, 2);
}

function createSuiteLogsConsoleApi(): SuiteLogsConsoleApi {
	return {
		levels: LOG_LEVELS,
		get(level) {
			const normalizedLevel = normalizeLogLevel(level);
			return logger.getHistory(normalizedLevel);
		},
		clear() {
			logger.clearHistory();
		},
		export(level) {
			const normalizedLevel = normalizeLogLevel(level);
			return exportJson(logger.getHistory(normalizedLevel));
		},
	};
}

function createSuiteDiagnosticsConsoleApi(): SuiteDiagnosticsConsoleApi {
	return {
		get() {
			return getAppDiagnostics();
		},
		clear() {
			clearAppDiagnostics();
		},
		export() {
			return exportJson(getAppDiagnostics());
		},
	};
}

export function installSuiteDevConsoleApis(options: { enabled?: boolean } = {}) {
	const enabled = options.enabled ?? import.meta.env.DEV;
	if (!enabled || typeof window === "undefined") {
		return;
	}

	window.__suiteLogs = createSuiteLogsConsoleApi();
	window.__suiteDiagnostics = createSuiteDiagnosticsConsoleApi();
}
