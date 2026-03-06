import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	TerminalCadRuntimeStatus,
	TerminalCadStatusResponse,
	TerminalCadDrawRequest,
	TerminalCadDrawResponse,
	TerminalLabelSyncRequest,
	TerminalLabelSyncResponse,
	TerminalScanRequest,
	TerminalScanResponse,
} from "./conduitTerminalTypes";

class ConduitTerminalService {
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
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
				return `terminal-${crypto.randomUUID()}`;
			}
		} catch {
			// Ignore and use timestamp fallback.
		}
		return `terminal-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for terminal scan auth",
					"ConduitTerminalService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (err) {
			logger.error(
				"Unexpected error while reading Supabase session for terminal scan auth",
				"ConduitTerminalService",
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
				"No bearer token or API key available for conduit terminal scan auth.",
				"ConduitTerminalService",
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
			// Ignore parse failure and keep fallback.
		}
		return fallback;
	}

	private normalizeCadRuntimeStatus(payload: unknown): TerminalCadRuntimeStatus | null {
		if (!payload || typeof payload !== "object") {
			return null;
		}
		const raw = payload as Record<string, unknown>;
		return {
			connected: Boolean(raw.connected),
			autocad_running: Boolean(raw.autocad_running),
			drawing_open: Boolean(raw.drawing_open),
			drawing_name:
				typeof raw.drawing_name === "string" ? raw.drawing_name : undefined,
			error:
				typeof raw.error === "string" || raw.error === null
					? (raw.error as string | null)
					: null,
			backend_id: typeof raw.backend_id === "string" ? raw.backend_id : undefined,
			backend_version:
				typeof raw.backend_version === "string"
					? raw.backend_version
					: undefined,
			conduit_route_provider:
				raw.conduit_route_provider &&
				typeof raw.conduit_route_provider === "object"
					? (raw.conduit_route_provider as TerminalCadRuntimeStatus["conduit_route_provider"])
					: undefined,
		};
	}

	async getAutoCadStatus(): Promise<TerminalCadStatusResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetch(`${this.baseUrl}/api/status`, {
				method: "GET",
				headers,
			});

			const payload = await response.json().catch(() => null);
			const status = this.normalizeCadRuntimeStatus(payload);
			if (!status) {
				return {
					success: false,
					httpStatus: response.status,
					message: "AutoCAD status returned an unexpected payload.",
				};
			}

			const healthy = Boolean(status.autocad_running && status.drawing_open);
			return {
				success: healthy,
				status,
				httpStatus: response.status,
				message:
					typeof status.error === "string" && status.error.trim().length > 0
						? status.error
						: healthy
							? "AutoCAD drawing is ready."
							: `AutoCAD status check reported ${response.status}.`,
			};
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "AutoCAD status request failed";
			logger.error("AutoCAD status request failed", "ConduitTerminalService", err);
			return {
				success: false,
				message,
			};
		}
	}

	async scanTerminalStrips(
		request: TerminalScanRequest = {},
	): Promise<TerminalScanResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetch(
				`${this.baseUrl}/api/conduit-route/terminal-scan`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						selectionOnly: request.selectionOnly ?? false,
						includeModelspace: request.includeModelspace ?? true,
						maxEntities: request.maxEntities ?? 50000,
						terminalProfile: request.terminalProfile ?? undefined,
					}),
				},
			);

			const payload = (await response
				.json()
				.catch(() => null)) as TerminalScanResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Terminal scan failed (${response.status})`,
						)),
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Terminal scan returned an unexpected payload.",
			};
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Terminal scan request failed";
			logger.error(
				"Terminal scan request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: "NETWORK_ERROR",
				message,
			};
		}
	}

	async drawTerminalRoutes(
		request: TerminalCadDrawRequest,
	): Promise<TerminalCadDrawResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetch(
				`${this.baseUrl}/api/conduit-route/terminal-routes/draw`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						operation: request.operation,
						sessionId: request.sessionId,
						clientRouteId: request.clientRouteId,
						route: request.route,
						defaultLayerName: request.defaultLayerName ?? "SUITE_WIRE_AUTO",
						annotateRefs: request.annotateRefs ?? true,
						textHeight: request.textHeight ?? 0.125,
					}),
				},
			);

			const payload = (await response
				.json()
				.catch(() => null)) as TerminalCadDrawResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Terminal route draw failed (${response.status})`,
						)),
					meta: payload?.meta,
					warnings: payload?.warnings,
					data: payload?.data,
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Terminal route draw returned an unexpected payload.",
			};
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Terminal route draw request failed";
			logger.error(
				"Terminal route draw request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: "NETWORK_ERROR",
				message,
			};
		}
	}

	async syncTerminalLabels(
		request: TerminalLabelSyncRequest,
	): Promise<TerminalLabelSyncResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetch(
				`${this.baseUrl}/api/conduit-route/terminal-labels/sync`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						selectionOnly: request.selectionOnly ?? false,
						includeModelspace: request.includeModelspace ?? true,
						maxEntities: request.maxEntities ?? 50000,
						terminalProfile: request.terminalProfile ?? undefined,
						strips: request.strips ?? [],
					}),
				},
			);

			const payload = (await response
				.json()
				.catch(() => null)) as TerminalLabelSyncResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Terminal label sync failed (${response.status})`,
						)),
					meta: payload?.meta,
					warnings: payload?.warnings,
					data: payload?.data,
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Terminal label sync returned an unexpected payload.",
			};
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Terminal label sync request failed";
			logger.error(
				"Terminal label sync request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: "NETWORK_ERROR",
				message,
			};
		}
	}
}

export const conduitTerminalService = new ConduitTerminalService();
