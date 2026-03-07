import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";

export type EtapCleanupCommand =
	| "ETAPFIX"
	| "ETAPTEXT"
	| "ETAPBLOCKS"
	| "ETAPLAYERFIX"
	| "ETAPOVERLAP"
	| "ETAPIMPORT";

export interface EtapCleanupRunRequest {
	command: EtapCleanupCommand;
	pluginDllPath?: string;
	waitForCompletion: boolean;
	timeoutMs: number;
	saveDrawing: boolean;
}

export interface EtapCleanupRunResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: {
		drawing?: {
			name?: string;
		};
		command?: string;
		commandScript?: string;
		pluginDllPath?: string | null;
		saveDrawing?: boolean;
		waitForCompletion?: boolean;
	};
	meta?: Record<string, unknown>;
	warnings?: string[];
}

export interface EtapAutoCadStatus {
	connected: boolean;
	autocadRunning: boolean;
	drawingOpen: boolean;
	drawingName: string;
	error: string;
	providerConfigured: string;
	providerPath: string;
}

export interface EtapAutoCadStatusResponse {
	success: boolean;
	message?: string;
	status: EtapAutoCadStatus;
	httpStatus?: number;
}

function coerceRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

class EtapCleanupService {
	private baseUrl: string;
	private apiKey: string;
	private missingAuthWarningShown = false;

	constructor() {
		this.baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
	}

	private createRequestId(): string {
		try {
			if (
				typeof crypto !== "undefined" &&
				typeof crypto.randomUUID === "function"
			) {
				return `etap-cleanup-${crypto.randomUUID()}`;
			}
		} catch {
			// Ignore and use timestamp fallback.
		}
		return `etap-cleanup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for ETAP cleanup auth",
					"EtapCleanupService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (err) {
			logger.error(
				"Unexpected error while reading Supabase session for ETAP cleanup auth",
				"EtapCleanupService",
				err,
			);
			return null;
		}
	}

	private async getHeaders(requestId: string): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": requestId,
		};

		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
			return headers;
		}

		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
			return headers;
		}

		if (!this.missingAuthWarningShown) {
			this.missingAuthWarningShown = true;
			logger.warn(
				"No bearer token or API key available for ETAP cleanup auth.",
				"EtapCleanupService",
			);
		}
		return headers;
	}

	private async parseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const payload = (await response.json()) as {
				error?: string;
				message?: string;
			} | null;
			const candidate = payload?.error || payload?.message;
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim();
			}
		} catch {
			// Ignore parse errors and keep fallback.
		}
		return fallback;
	}

	async getAutoCadStatus(): Promise<EtapAutoCadStatusResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetch(`${this.baseUrl}/api/status`, {
				method: "GET",
				headers,
			});

			const payload = coerceRecord(await response.json().catch(() => ({})));
			const providerRaw = coerceRecord(payload.conduit_route_provider);
			const status: EtapAutoCadStatus = {
				connected: Boolean(payload.connected),
				autocadRunning: Boolean(payload.autocad_running),
				drawingOpen: Boolean(payload.drawing_open),
				drawingName:
					typeof payload.drawing_name === "string" ? payload.drawing_name : "",
				error: typeof payload.error === "string" ? payload.error : "",
				providerConfigured:
					typeof providerRaw.configured === "string"
						? providerRaw.configured
						: "",
				providerPath:
					typeof providerRaw.configured === "string"
						? providerRaw.configured
						: "",
			};

			return {
				success: response.ok && status.autocadRunning,
				message:
					typeof payload.message === "string" ? payload.message : undefined,
				status,
				httpStatus: response.status,
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "AutoCAD status request failed.";
			return {
				success: false,
				message,
				status: {
					connected: false,
					autocadRunning: false,
					drawingOpen: false,
					drawingName: "",
					error: message,
					providerConfigured: "",
					providerPath: "",
				},
			};
		}
	}

	async runCleanup(
		request: EtapCleanupRunRequest,
	): Promise<EtapCleanupRunResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const timeoutMs = Math.max(
				1000,
				Math.min(600000, request.timeoutMs || 90000),
			);
			const response = await fetch(`${this.baseUrl}/api/etap/cleanup/run`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					command: request.command,
					pluginDllPath: request.pluginDllPath || undefined,
					waitForCompletion: request.waitForCompletion,
					timeoutMs,
					saveDrawing: request.saveDrawing,
				}),
			});

			const payload = (await response
				.json()
				.catch(() => null)) as EtapCleanupRunResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`ETAP cleanup failed (${response.status})`,
						)),
					data: payload?.data,
					meta: payload?.meta,
					warnings: payload?.warnings,
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "ETAP cleanup returned an unexpected payload.",
			};
		} catch (error) {
			logger.error("ETAP cleanup request failed", "EtapCleanupService", error);
			return {
				success: false,
				code: "NETWORK_ERROR",
				message:
					error instanceof Error
						? error.message
						: "ETAP cleanup request failed.",
			};
		}
	}
}

export const etapCleanupService = new EtapCleanupService();
