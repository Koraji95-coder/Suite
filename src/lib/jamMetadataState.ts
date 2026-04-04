import { APP_NAME } from "@/appMeta";
import type { AppDiagnostic } from "@/lib/appDiagnostics";

const BUILT_FRONTEND_MODE = "built_frontend";
const MAX_RECENT_DIAGNOSTICS = 3;
const MAX_QUERY_VALUE_LENGTH = 120;
const MAX_STRING_LENGTH = 180;
const ROUTE_QUERY_ALLOWLIST = new Set([
	"drawing",
	"drawingId",
	"fileId",
	"issueSetId",
	"mode",
	"projectId",
	"recipeId",
	"snapshotId",
	"tab",
	"view",
]);

type SuiteJamRouteContext = {
	origin?: string;
	pathname: string;
	routeFamily: string;
	query?: Record<string, string>;
	hasHash: boolean;
};

type SuiteJamAuthContext = {
	isAuthenticated: boolean;
	loading: boolean;
	profileHydrating: boolean;
	userId?: string;
	email?: string;
	displayName?: string;
	sessionAuthMethod?: string;
};

type SuiteJamDiagnosticsContext = {
	actionableCount: number;
	bySeverity: Record<"info" | "warning" | "error", number>;
	recent?: Array<{
		timestamp: string;
		source: AppDiagnostic["source"];
		severity: AppDiagnostic["severity"];
		title: string;
		message: string;
		context?: string;
		occurrences: number;
	}>;
};

type SuiteJamMetadataState = {
	route: SuiteJamRouteContext;
	auth: SuiteJamAuthContext;
	diagnostics: SuiteJamDiagnosticsContext;
};

function compactString(
	value: string | null | undefined,
	maxLength = MAX_STRING_LENGTH,
) {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}

	return normalized.length > maxLength
		? `${normalized.slice(0, maxLength - 3)}...`
		: normalized;
}

function inferRouteFamily(pathname: string) {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) {
		return "root";
	}
	return segments.slice(0, 2).join("/");
}

function sanitizeRouteQuery(search: string | null | undefined) {
	if (!search) {
		return undefined;
	}

	const params = new URLSearchParams(search);
	const sanitizedQuery: Record<string, string> = {};
	for (const [key, value] of params.entries()) {
		if (!ROUTE_QUERY_ALLOWLIST.has(key)) {
			continue;
		}

		const compacted = compactString(value, MAX_QUERY_VALUE_LENGTH);
		if (compacted) {
			sanitizedQuery[key] = compacted;
		}
	}

	if (Object.keys(sanitizedQuery).length === 0) {
		return undefined;
	}

	return sanitizedQuery;
}

function summarizeDiagnostics(
	entries: AppDiagnostic[],
): SuiteJamDiagnosticsContext {
	const bySeverity = {
		info: 0,
		warning: 0,
		error: 0,
	} as const satisfies Record<"info" | "warning" | "error", number>;

	const mutableCounts = { ...bySeverity };
	for (const entry of entries) {
		mutableCounts[entry.severity] += 1;
	}

	const recent = entries.slice(0, MAX_RECENT_DIAGNOSTICS).map((entry) => ({
		context: compactString(entry.context),
		message: compactString(entry.message) ?? entry.message,
		occurrences: entry.occurrences,
		severity: entry.severity,
		source: entry.source,
		timestamp: entry.timestamp,
		title: compactString(entry.title) ?? entry.title,
	}));

	return {
		actionableCount: mutableCounts.warning + mutableCounts.error,
		bySeverity: mutableCounts,
		...(recent.length > 0 ? { recent } : {}),
	};
}

function createInitialState(): SuiteJamMetadataState {
	const pathname =
		typeof window !== "undefined" ? window.location.pathname || "/" : "/";

	return {
		auth: {
			isAuthenticated: false,
			loading: true,
			profileHydrating: false,
		},
		diagnostics: summarizeDiagnostics([]),
		route: {
			hasHash:
				typeof window !== "undefined" ? Boolean(window.location.hash) : false,
			origin:
				typeof window !== "undefined" ? window.location.origin : undefined,
			pathname,
			query:
				typeof window !== "undefined"
					? sanitizeRouteQuery(window.location.search)
					: undefined,
			routeFamily: inferRouteFamily(pathname),
		},
	};
}

let state = createInitialState();

export function resetSuiteJamMetadataState() {
	state = createInitialState();
}

export function updateSuiteJamRouteContext(location: {
	pathname: string;
	search?: string;
	hash?: string;
}) {
	const pathname = compactString(location.pathname, MAX_STRING_LENGTH) ?? "/";
	state = {
		...state,
		route: {
			hasHash: Boolean(location.hash),
			origin:
				typeof window !== "undefined" ? window.location.origin : undefined,
			pathname,
			query: sanitizeRouteQuery(location.search),
			routeFamily: inferRouteFamily(pathname),
		},
	};
}

export function updateSuiteJamAuthContext(input: {
	isAuthenticated: boolean;
	loading: boolean;
	profileHydrating: boolean;
	userId?: string | null;
	email?: string | null;
	displayName?: string | null;
	sessionAuthMethod?: string | null;
}) {
	state = {
		...state,
		auth: {
			displayName: compactString(input.displayName),
			email: compactString(input.email),
			isAuthenticated: input.isAuthenticated,
			loading: input.loading,
			profileHydrating: input.profileHydrating,
			sessionAuthMethod: compactString(input.sessionAuthMethod),
			userId: compactString(input.userId),
		},
	};
}

export function updateSuiteJamDiagnostics(entries: AppDiagnostic[]) {
	state = {
		...state,
		diagnostics: summarizeDiagnostics(entries),
	};
}

export function buildSuiteJamMetadataSnapshot() {
	return {
		app: {
			frontendMode: import.meta.env.DEV ? "vite_dev" : BUILT_FRONTEND_MODE,
			name: APP_NAME,
			viteMode: import.meta.env.MODE,
		},
		auth: state.auth,
		diagnostics: state.diagnostics,
		route: state.route,
	};
}
