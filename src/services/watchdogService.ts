import { logger } from "@/lib/logger";
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

	private async parseError(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const payload = (await response.json()) as
				| { error?: string; message?: string }
				| undefined;
			const message = payload?.error || payload?.message;
			if (typeof message === "string" && message.trim().length > 0) {
				return message.trim();
			}
		} catch {
			// Ignore parse errors and keep fallback.
		}
		return fallback;
	}

	private async requestJson<T>(
		path: string,
		options?: {
			method?: "GET" | "POST" | "PUT";
			body?: unknown;
		},
	): Promise<T> {
		const method = options?.method || "GET";
		const headers = await this.buildHeaders({
			includeContentType: method !== "GET",
		});

		const response = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers,
			credentials: "include",
			body: method === "GET" ? undefined : JSON.stringify(options?.body ?? {}),
		});

		if (!response.ok) {
			const message = await this.parseError(
				response,
				`Watchdog request failed (${response.status})`,
			);
			throw new Error(message);
		}

		return (await response.json()) as T;
	}

	async configure(config: WatchdogConfig): Promise<WatchdogConfigResponse> {
		return this.requestJson<WatchdogConfigResponse>("/api/watchdog/config", {
			method: "PUT",
			body: config,
		});
	}

	async heartbeat(): Promise<HeartbeatResponse> {
		return this.requestJson<HeartbeatResponse>("/api/watchdog/heartbeat", {
			method: "POST",
			body: {},
		});
	}

	async status(): Promise<WatchdogStatusResponse> {
		return this.requestJson<WatchdogStatusResponse>("/api/watchdog/status");
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
			},
		);
	}
}

export const watchdogService = new WatchdogService();
