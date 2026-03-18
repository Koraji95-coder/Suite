export type AppDiagnosticSeverity = "info" | "warning" | "error";
export type AppDiagnosticSource = "logger" | "fetch" | "runtime";

export interface AppDiagnostic {
	id: string;
	timestamp: string;
	source: AppDiagnosticSource;
	severity: AppDiagnosticSeverity;
	title: string;
	message: string;
	context?: string;
	details?: string;
	occurrences: number;
}

type AppDiagnosticListener = (entries: AppDiagnostic[]) => void;

const MAX_DIAGNOSTICS = 160;
const DEDUPE_WINDOW_MS = 5_000;

const diagnostics: AppDiagnostic[] = [];
const listeners = new Set<AppDiagnosticListener>();

function emit() {
	const snapshot = diagnostics.slice();
	for (const listener of listeners) {
		try {
			listener(snapshot);
		} catch {
			// Ignore listener failures so diagnostics stay available.
		}
	}
}

function nextDiagnosticId() {
	return `diag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function findRecentDuplicate(
	source: AppDiagnosticSource,
	severity: AppDiagnosticSeverity,
	title: string,
	message: string,
	context?: string,
) {
	const now = Date.now();
	return diagnostics.find((entry) => {
		const ageMs = now - Date.parse(entry.timestamp);
		return (
			ageMs <= DEDUPE_WINDOW_MS &&
			entry.source === source &&
			entry.severity === severity &&
			entry.title === title &&
			entry.message === message &&
			(entry.context || "") === (context || "")
		);
	});
}

export function recordAppDiagnostic(input: {
	source: AppDiagnosticSource;
	severity: AppDiagnosticSeverity;
	title: string;
	message: string;
	context?: string;
	details?: string;
}) {
	const title = String(input.title || "").trim();
	const message = String(input.message || "").trim();
	if (!title || !message) {
		return;
	}

	const duplicate = findRecentDuplicate(
		input.source,
		input.severity,
		title,
		message,
		input.context,
	);
	if (duplicate) {
		duplicate.occurrences += 1;
		duplicate.timestamp = new Date().toISOString();
		if (input.details) {
			duplicate.details = String(input.details).trim();
		}
		emit();
		return;
	}

	diagnostics.unshift({
		id: nextDiagnosticId(),
		timestamp: new Date().toISOString(),
		source: input.source,
		severity: input.severity,
		title,
		message,
		context: input.context ? String(input.context).trim() : undefined,
		details: input.details ? String(input.details).trim() : undefined,
		occurrences: 1,
	});

	if (diagnostics.length > MAX_DIAGNOSTICS) {
		diagnostics.length = MAX_DIAGNOSTICS;
	}
	emit();
}

export function getAppDiagnostics(): AppDiagnostic[] {
	return diagnostics.slice();
}

export function clearAppDiagnostics() {
	diagnostics.length = 0;
	emit();
}

export function subscribeAppDiagnostics(listener: AppDiagnosticListener) {
	listeners.add(listener);
	listener(getAppDiagnostics());
	return () => {
		listeners.delete(listener);
	};
}
