import { logger } from "@/lib/logger";
import {
	projectSetupBackendService,
	projectSetupCompanionService,
} from "@/features/project-setup";
import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
} from "@/lib/fetchWithTimeout";
import { supabase } from "@/supabase/client";

export interface WatchdogConfig {
	roots: string[];
	includeGlobs: string[];
	excludeGlobs: string[];
	heartbeatMs: number;
	enabled: boolean;
}

export type WatchdogEventType = "added" | "removed" | "modified";

export interface WatchdogEvent {
	eventId: number;
	type: WatchdogEventType;
	root: string;
	path: string;
	relativePath?: string;
	timestamp: number;
	sizeBytes?: number;
	mtimeMs?: number;
}

export interface HeartbeatResponse {
	ok: boolean;
	events: WatchdogEvent[];
	scanMs: number;
	filesScanned: number;
	foldersScanned: number;
	truncated: boolean;
	warnings: string[];
	lastHeartbeatAt: number;
}

export interface WatchdogStatusResponse {
	ok: boolean;
	configured: boolean;
	config: WatchdogConfig;
	lastScan: Omit<HeartbeatResponse, "ok" | "events"> | null;
	nextEventId: number;
	healthy: boolean;
}

export interface WatchdogConfigResponse {
	ok: boolean;
	config: WatchdogConfig;
	initialScan: Omit<HeartbeatResponse, "ok" | "events">;
	nextEventId: number;
}

export interface WatchdogPickRootResponse {
	ok: boolean;
	cancelled: boolean;
	path: string | null;
}

export interface WatchdogCollector {
	collectorId: string;
	name: string;
	collectorType: string;
	workstationId: string;
	capabilities: string[];
	metadata: Record<string, unknown>;
	status: string;
	createdAt: number;
	updatedAt: number;
	lastHeartbeatAt: number;
	lastEventAt: number;
	eventCount: number;
	lastSequence: number;
}

export interface WatchdogCollectorRegistrationRequest {
	collectorId?: string;
	name?: string;
	collectorType?: string;
	workstationId?: string;
	capabilities?: string[];
	metadata?: Record<string, unknown>;
	status?: string;
}

export interface WatchdogCollectorHeartbeatRequest {
	collectorId: string;
	status?: string;
	sequence?: number;
	metadata?: Record<string, unknown>;
}

export interface WatchdogCollectorEventPayload {
	eventKey?: string;
	eventType: string;
	sourceType?: string;
	timestamp?: number;
	projectId?: string | null;
	sessionId?: string | null;
	path?: string | null;
	drawingPath?: string | null;
	workstationId?: string | null;
	sizeBytes?: number;
	mtimeMs?: number;
	durationMs?: number;
	metadata?: Record<string, unknown>;
}

export interface WatchdogCollectorEventsRequest {
	collectorId: string;
	events: WatchdogCollectorEventPayload[];
}

export interface WatchdogCollectorResponse {
	ok: boolean;
	collector: WatchdogCollector;
}

export interface WatchdogCollectorEventsResponse {
	ok: boolean;
	accepted: number;
	rejected: number;
	duplicates?: number;
	collector: WatchdogCollector;
	nextEventId: number;
}

export interface WatchdogCollectorsListResponse {
	ok: boolean;
	collectors: WatchdogCollector[];
	count: number;
}

export interface WatchdogCollectorEvent {
	eventId: number;
	collectorId: string;
	collectorType: string;
	workstationId: string;
	eventKey?: string;
	eventType: string;
	sourceType: string;
	timestamp: number;
	projectId?: string | null;
	sessionId?: string | null;
	path?: string | null;
	drawingPath?: string | null;
	sizeBytes?: number;
	mtimeMs?: number;
	durationMs?: number;
	metadata: Record<string, unknown>;
}

export interface WatchdogEventsResponse {
	ok: boolean;
	events: WatchdogCollectorEvent[];
	count: number;
	afterEventId: number;
	lastEventId: number;
	nextEventId: number;
}

export interface WatchdogOverviewProjectCount {
	projectId: string;
	eventCount: number;
}

export interface WatchdogTrendBucket {
	bucketStartMs: number;
	eventCount: number;
}

export interface WatchdogProjectRule {
	projectId: string;
	roots: string[];
	includeGlobs: string[];
	excludeGlobs: string[];
	drawingPatterns: string[];
	metadata: Record<string, unknown>;
	updatedAt: number;
}

export interface WatchdogProjectRuleResponse {
	ok: boolean;
	rule: WatchdogProjectRule;
}

export interface WatchdogOverviewResponse {
	ok: boolean;
	generatedAt: number;
	timeWindowMs: number;
	projectId?: string | null;
	collectors: {
		total: number;
		online: number;
		offline: number;
	};
	events: {
		retained: number;
		inWindow: number;
		latestEventAt: number;
		byType: Record<string, number>;
		bySourceType: Record<string, number>;
		latest: WatchdogCollectorEvent[];
	};
	projects: {
		top: WatchdogOverviewProjectCount[];
	};
	trendBuckets: WatchdogTrendBucket[];
}

export interface WatchdogSessionSummary {
	sessionId: string;
	collectorId: string;
	collectorType: string;
	workstationId: string;
	projectId?: string | null;
	drawingPath?: string | null;
	status: "live" | "paused" | "completed";
	active: boolean;
	startedAt: number;
	endedAt?: number | null;
	latestEventAt: number;
	lastActivityAt?: number | null;
	lastEventType?: string | null;
	eventCount: number;
	commandCount: number;
	idleCount: number;
	activationCount: number;
	durationMs: number;
	idleDurationMs?: number;
	durationSource?: string | null;
	sourceAvailable: boolean;
	pendingCount: number;
	trackerUpdatedAt?: number | null;
}

export interface WatchdogSessionsResponse {
	ok: boolean;
	generatedAt: number;
	timeWindowMs: number;
	projectId?: string | null;
	collectorId?: string | null;
	count: number;
	sessions: WatchdogSessionSummary[];
}

export interface WatchdogDashboardSnapshotResponse {
	ok: boolean;
	generatedAt: number;
	timeWindowMs: number;
	projectId?: string | null;
	collectorId?: string | null;
	collectors: WatchdogCollectorsListResponse;
	overview: WatchdogOverviewResponse;
	events: WatchdogEventsResponse;
	sessions: WatchdogSessionsResponse;
}

export interface WatchdogProjectRulesSyncResponse {
	ok: boolean;
	rules: WatchdogProjectRule[];
	count: number;
	deletedProjectIds: string[];
}

export interface WatchdogDrawingActivitySyncCursor {
	syncName: string;
	lastEventId: number;
	metadata: Record<string, unknown>;
	updatedAt: number;
}

export interface WatchdogDrawingActivitySyncResponse {
	ok: boolean;
	synced: number;
	skipped: number;
	rows?: Record<string, unknown>[];
	cursor?: WatchdogDrawingActivitySyncCursor;
}

function buildQueryString(
	query: Record<string, string | number | boolean | null | undefined>,
): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		params.set(key, String(value));
	}
	const serialized = params.toString();
	return serialized ? `?${serialized}` : "";
}

const dashboardSnapshotInFlight = new Map<
	string,
	Promise<WatchdogDashboardSnapshotResponse>
>();

export type WatchdogFolderPickerAvailability =
	| "unknown"
	| "available"
	| "unavailable";

const WATCHDOG_FOLDER_PICKER_BACKEND_MESSAGE =
	"Folder picker is unavailable in this environment.";

export const WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE =
	"Folder browsing requires Suite Runtime Control on this workstation. Make sure it is running, then try again. You can still paste the Windows path manually.";

let watchdogFolderPickerAvailability: WatchdogFolderPickerAvailability =
	"unknown";

export function getWatchdogFolderPickerAvailability(): WatchdogFolderPickerAvailability {
	return watchdogFolderPickerAvailability;
}

export function isWatchdogFolderPickerUnavailableError(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message : String(error ?? "").trim();
	return (
		message.includes(WATCHDOG_FOLDER_PICKER_BACKEND_MESSAGE) ||
		message.includes(WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE)
	);
}

class WatchdogService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl = (
			import.meta.env.VITE_WATCHDOG_BASE_URL ||
			""
		)
			.trim()
			.replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY || "";
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn("Unable to resolve Supabase session", "WatchdogService", {
					error: error.message || "Unknown auth error",
				});
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.error(
				"Failed to resolve Supabase session",
				"WatchdogService",
				error,
			);
			return null;
		}
	}

	private async buildHeaders(options?: {
		includeContentType?: boolean;
	}): Promise<Record<string, string>> {
		const includeContentType = options?.includeContentType ?? true;
		const headers: Record<string, string> = {};
		if (includeContentType) {
			headers["Content-Type"] = "application/json";
		}

		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
			return headers;
		}

		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
			return headers;
		}

		logger.warn(
			"No bearer token or API key available for watchdog requests.",
			"WatchdogService",
		);
		return headers;
	}

	private async requestJson<T>(
		path: string,
		options?: {
			method?: "GET" | "POST" | "PUT" | "DELETE";
			body?: unknown;
			timeoutMs?: number;
		},
	): Promise<T> {
		const method = options?.method || "GET";
		const headers = await this.buildHeaders({
			includeContentType: method !== "GET",
		});

		try {
			const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
				method,
				headers,
				credentials: "include",
				body: method === "GET" ? undefined : JSON.stringify(options?.body ?? {}),
				timeoutMs: options?.timeoutMs ?? 20_000,
				requestName: "Watchdog request",
				throwOnHttpError: true,
			});

			return (await response.json()) as T;
		} catch (error) {
			if (error instanceof FetchRequestError && error.kind === "http") {
				if (error.status === 404) {
					throw new Error(
						"Watchdog route is unavailable. Restart the backend so it matches the current repo routes.",
					);
				}
				if (error.status === 401 || error.status === 403) {
					throw new Error(
						"Watchdog request was rejected. Sign in again or verify backend auth state.",
					);
				}
			}
			throw new Error(mapFetchErrorMessage(error, "Watchdog request failed."));
		}
	}

	async configure(config: WatchdogConfig): Promise<WatchdogConfigResponse> {
		return this.requestJson<WatchdogConfigResponse>("/api/watchdog/config", {
			method: "PUT",
			body: config,
			timeoutMs: 20_000,
		});
	}

	async heartbeat(): Promise<HeartbeatResponse> {
		return this.requestJson<HeartbeatResponse>("/api/watchdog/heartbeat", {
			method: "POST",
			body: {},
			timeoutMs: 25_000,
		});
	}

	async status(): Promise<WatchdogStatusResponse> {
		return this.requestJson<WatchdogStatusResponse>("/api/watchdog/status", {
			timeoutMs: 12_000,
		});
	}

	async pickRoot(
		initialPath?: string | null,
	): Promise<WatchdogPickRootResponse> {
		try {
			const ticket = await projectSetupBackendService.issueTicket({
				action: "pick-root",
			});
			const bridgeResult = await projectSetupCompanionService.pickRoot(ticket, {
				initialPath: initialPath ?? null,
				title: "Select Watchdog Root Folder",
			});
			if (bridgeResult.success && bridgeResult.data) {
				watchdogFolderPickerAvailability = "available";
				return {
					ok: true,
					cancelled: Boolean(bridgeResult.data.cancelled),
					path: bridgeResult.data.path ?? null,
				};
			}
			if (bridgeResult.message) {
				throw new Error(bridgeResult.message);
			}
			throw new Error(WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE);
		} catch (error) {
			if (isWatchdogFolderPickerUnavailableError(error)) {
				watchdogFolderPickerAvailability = "unavailable";
				throw new Error(WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE);
			}
			throw error;
		}
	}

	async registerCollector(
		payload: WatchdogCollectorRegistrationRequest,
	): Promise<WatchdogCollectorResponse> {
		return this.requestJson<WatchdogCollectorResponse>(
			"/api/watchdog/collectors/register",
			{
				method: "POST",
				body: payload,
			},
		);
	}

	async collectorHeartbeat(
		payload: WatchdogCollectorHeartbeatRequest,
	): Promise<WatchdogCollectorResponse> {
		return this.requestJson<WatchdogCollectorResponse>(
			"/api/watchdog/collectors/heartbeat",
			{
				method: "POST",
				body: payload,
			},
		);
	}

	async ingestCollectorEvents(
		payload: WatchdogCollectorEventsRequest,
	): Promise<WatchdogCollectorEventsResponse> {
		return this.requestJson<WatchdogCollectorEventsResponse>(
			"/api/watchdog/collectors/events",
			{
				method: "POST",
				body: payload,
				timeoutMs: 30_000,
			},
		);
	}

	async listCollectors(): Promise<WatchdogCollectorsListResponse> {
		return this.requestJson<WatchdogCollectorsListResponse>(
			"/api/watchdog/collectors",
		);
	}

	async listEvents(options?: {
		limit?: number;
		afterEventId?: number;
		collectorId?: string;
		projectId?: string;
		eventType?: string;
		sinceMs?: number;
		untilMs?: number;
	}): Promise<WatchdogEventsResponse> {
		const query = buildQueryString({
			limit: options?.limit,
			afterEventId: options?.afterEventId,
			collectorId: options?.collectorId,
			projectId: options?.projectId,
			eventType: options?.eventType,
			sinceMs: options?.sinceMs,
			untilMs: options?.untilMs,
		});
		return this.requestJson<WatchdogEventsResponse>(`/api/watchdog/events${query}`);
	}

	async getOverview(options?: {
		projectId?: string;
		timeWindowMs?: number;
	}): Promise<WatchdogOverviewResponse> {
		const query = buildQueryString({
			projectId: options?.projectId,
			timeWindowMs: options?.timeWindowMs,
		});
		return this.requestJson<WatchdogOverviewResponse>(
			`/api/watchdog/overview${query}`,
		);
	}

	async getDashboardSnapshot(options?: {
		projectId?: string;
		collectorId?: string;
		timeWindowMs?: number;
		eventsLimit?: number;
		sessionsLimit?: number;
	}): Promise<WatchdogDashboardSnapshotResponse> {
		const query = buildQueryString({
			projectId: options?.projectId,
			collectorId: options?.collectorId,
			timeWindowMs: options?.timeWindowMs,
			eventsLimit: options?.eventsLimit,
			sessionsLimit: options?.sessionsLimit,
		});
		const cacheKey = query || "default";
		const existingRequest = dashboardSnapshotInFlight.get(cacheKey);
		if (existingRequest) {
			return existingRequest;
		}

		const request = this.requestJson<WatchdogDashboardSnapshotResponse>(
			`/api/watchdog/dashboard${query}`,
		).finally(() => {
			dashboardSnapshotInFlight.delete(cacheKey);
		});
		dashboardSnapshotInFlight.set(cacheKey, request);
		return request;
	}

	async getProjectOverview(
		projectId: string,
		options?: { timeWindowMs?: number },
	): Promise<WatchdogOverviewResponse> {
		const query = buildQueryString({
			timeWindowMs: options?.timeWindowMs,
		});
		return this.requestJson<WatchdogOverviewResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/overview${query}`,
		);
	}

	async listSessions(options?: {
		limit?: number;
		collectorId?: string;
		projectId?: string;
		timeWindowMs?: number;
		activeOnly?: boolean;
	}): Promise<WatchdogSessionsResponse> {
		const query = buildQueryString({
			limit: options?.limit,
			collectorId: options?.collectorId,
			projectId: options?.projectId,
			timeWindowMs: options?.timeWindowMs,
			activeOnly: options?.activeOnly,
		});
		return this.requestJson<WatchdogSessionsResponse>(
			`/api/watchdog/sessions${query}`,
		);
	}

	async getProjectSessions(
		projectId: string,
		options?: {
			limit?: number;
			collectorId?: string;
			timeWindowMs?: number;
			activeOnly?: boolean;
		},
	): Promise<WatchdogSessionsResponse> {
		const query = buildQueryString({
			limit: options?.limit,
			collectorId: options?.collectorId,
			timeWindowMs: options?.timeWindowMs,
			activeOnly: options?.activeOnly,
		});
		return this.requestJson<WatchdogSessionsResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/sessions${query}`,
		);
	}

	async getProjectEvents(
		projectId: string,
		options?: {
			limit?: number;
			afterEventId?: number;
			collectorId?: string;
			eventType?: string;
			sinceMs?: number;
			untilMs?: number;
		},
	): Promise<WatchdogEventsResponse> {
		const query = buildQueryString({
			limit: options?.limit,
			afterEventId: options?.afterEventId,
			collectorId: options?.collectorId,
			eventType: options?.eventType,
			sinceMs: options?.sinceMs,
			untilMs: options?.untilMs,
		});
		return this.requestJson<WatchdogEventsResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/events${query}`,
		);
	}

	async getProjectRule(projectId: string): Promise<WatchdogProjectRuleResponse> {
		return this.requestJson<WatchdogProjectRuleResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/rules`,
		);
	}

	async putProjectRule(
		projectId: string,
		rule: Omit<WatchdogProjectRule, "projectId" | "updatedAt">,
	): Promise<WatchdogProjectRuleResponse> {
		return this.requestJson<WatchdogProjectRuleResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/rules`,
			{
				method: "PUT",
				body: rule,
			},
		);
	}

	async deleteProjectRule(projectId: string): Promise<WatchdogProjectRuleResponse> {
		return this.requestJson<WatchdogProjectRuleResponse>(
			`/api/watchdog/projects/${encodeURIComponent(projectId)}/rules`,
			{
				method: "DELETE",
			},
		);
	}

	async syncProjectRules(
		rules: WatchdogProjectRule[],
	): Promise<WatchdogProjectRulesSyncResponse> {
		return this.requestJson<WatchdogProjectRulesSyncResponse>(
			"/api/watchdog/project-rules/sync",
			{
				method: "POST",
				body: { rules },
			},
		);
	}

	async syncDrawingActivity(
		limit?: number,
	): Promise<WatchdogDrawingActivitySyncResponse> {
		return this.requestJson<WatchdogDrawingActivitySyncResponse>(
			"/api/watchdog/drawing-activity/sync",
			{
				method: "POST",
				body: { limit },
				timeoutMs: 30_000,
			},
		);
	}
}

export const watchdogService = new WatchdogService();
