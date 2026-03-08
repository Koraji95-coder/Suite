import { logger } from "@/lib/logger";
import { fetchWithTimeout, mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
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

class WatchdogService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
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
			method?: "GET" | "POST" | "PUT";
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
			throw new Error(
				mapFetchErrorMessage(error, "Watchdog request failed."),
			);
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
		return this.requestJson<WatchdogPickRootResponse>(
			"/api/watchdog/pick-root",
			{
				method: "POST",
				body: {
					initialPath: initialPath ?? null,
				},
				timeoutMs: 120_000,
			},
		);
	}
}

export const watchdogService = new WatchdogService();
