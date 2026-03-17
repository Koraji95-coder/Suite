import {
	fetchWithTimeout,
	mapFetchErrorCode,
	mapFetchErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	EtapCleanupRunRequest,
	EtapCleanupRunResponse,
	TerminalCadRuntimeStatus,
	TerminalCadStatusResponse,
	TerminalCadDrawRequest,
	TerminalCadDrawResponse,
	TerminalLabelSyncRequest,
	TerminalLabelSyncResponse,
	TerminalScanRequest,
	TerminalScanResponse,
} from "./conduitTerminalTypes";

type TerminalLabelSyncMode = "legacy" | "bridge" | "auto";

export function resolveTerminalLabelSyncEndpointPath(options?: {
	mode?: TerminalLabelSyncMode;
	providerConfigured?: string;
	dotnetSenderReady?: boolean;
}): string {
	const rawMode =
		typeof options?.mode === "string" ? options.mode.trim().toLowerCase() : "";
	const mode: TerminalLabelSyncMode =
		rawMode === "bridge" || rawMode === "auto" ? rawMode : "legacy";
	if (mode === "bridge") {
		return "/api/conduit-route/bridge/terminal-labels/sync";
	}
	if (mode === "legacy") {
		return "/api/conduit-route/terminal-labels/sync";
	}

	const providerConfigured =
		typeof options?.providerConfigured === "string"
			? options.providerConfigured.trim().toLowerCase()
			: "";
	const dotnetSenderReady =
		typeof options?.dotnetSenderReady === "boolean"
			? options.dotnetSenderReady
			: true;
	if (
		dotnetSenderReady &&
		(providerConfigured === "dotnet" ||
			providerConfigured === "dotnet_fallback_com")
	) {
		return "/api/conduit-route/bridge/terminal-labels/sync";
	}
	return "/api/conduit-route/terminal-labels/sync";
}

class ConduitTerminalService {
	private baseUrl: string;
	private apiKey: string;
	private missingAuthWarningShown = false;
	private terminalLabelSyncMode: TerminalLabelSyncMode;

	constructor() {
		this.baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
		this.terminalLabelSyncMode = this.normalizeTerminalLabelSyncMode(
			import.meta.env.VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE,
		);
	}

	private normalizeTerminalLabelSyncMode(rawValue: unknown): TerminalLabelSyncMode {
		const value =
			typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
		if (value === "bridge" || value === "auto") {
			return value;
		}
		return "legacy";
	}

	private resolveTerminalLabelSyncEndpoint(options?: {
		mode?: TerminalLabelSyncMode;
		providerConfigured?: string;
		dotnetSenderReady?: boolean;
	}): string {
		return resolveTerminalLabelSyncEndpointPath({
			mode: this.normalizeTerminalLabelSyncMode(
				options?.mode ?? this.terminalLabelSyncMode,
			),
			providerConfigured: options?.providerConfigured,
			dotnetSenderReady: options?.dotnetSenderReady,
		});
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
			const response = await fetchWithTimeout(`${this.baseUrl}/api/status`, {
				method: "GET",
				headers,
				timeoutMs: 15_000,
				requestName: "AutoCAD status request",
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
			const message = mapFetchErrorMessage(err, "AutoCAD status request failed");
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
			const response = await fetchWithTimeout(
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
					timeoutMs: 45_000,
					requestName: "Terminal scan request",
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
			const message = mapFetchErrorMessage(err, "Terminal scan request failed");
			logger.error(
				"Terminal scan request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message,
			};
		}
	}

	async runEtapCleanup(
		request: EtapCleanupRunRequest = {},
	): Promise<EtapCleanupRunResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const timeoutMs = Math.max(
				1000,
				Math.min(600000, Math.trunc(request.timeoutMs ?? 90000)),
			);
			const response = await fetchWithTimeout(`${this.baseUrl}/api/etap/cleanup/run`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					command: request.command ?? "ETAPFIX",
					pluginDllPath: request.pluginDllPath || undefined,
					waitForCompletion: request.waitForCompletion ?? true,
					timeoutMs,
					saveDrawing: request.saveDrawing ?? false,
				}),
				timeoutMs: timeoutMs + 10_000,
				requestName: "ETAP cleanup request",
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
		} catch (err) {
			const message = mapFetchErrorMessage(err, "ETAP cleanup request failed");
			logger.error("ETAP cleanup request failed", "ConduitTerminalService", err);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
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
			const response = await fetchWithTimeout(
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
					timeoutMs: 120_000,
					requestName: "Terminal route draw request",
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
			const message = mapFetchErrorMessage(
				err,
				"Terminal route draw request failed",
			);
			logger.error(
				"Terminal route draw request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message,
			};
		}
	}

	async syncTerminalLabels(
		request: TerminalLabelSyncRequest,
		options?: {
			mode?: TerminalLabelSyncMode;
			providerConfigured?: string;
			dotnetSenderReady?: boolean;
		},
	): Promise<TerminalLabelSyncResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const endpoint = this.resolveTerminalLabelSyncEndpoint(options);
			const response = await fetchWithTimeout(
				`${this.baseUrl}${endpoint}`,
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
					timeoutMs: 60_000,
					requestName: "Terminal label sync request",
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
			const message = mapFetchErrorMessage(
				err,
				"Terminal label sync request failed",
			);
			logger.error(
				"Terminal label sync request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message,
			};
		}
	}
}

export const conduitTerminalService = new ConduitTerminalService();
