import {
	fetchWithTimeout,
	mapFetchErrorCode,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	ConduitRouteBackcheckRequest,
	ConduitRouteBackcheckResponse,
	ConduitObstacleScanRequest,
	ConduitObstacleScanResponse,
	ConduitRouteComputeRequest,
	ConduitRouteComputeResponse,
} from "./conduitRouteTypes";

class ConduitRouteService {
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
				return `conduit-${crypto.randomUUID()}`;
			}
		} catch {
			// Ignore and use timestamp fallback.
		}
		return `conduit-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for conduit route auth",
					"ConduitRouteService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (err) {
			logger.error(
				"Unexpected error while reading Supabase session for conduit route auth",
				"ConduitRouteService",
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
				"No bearer token or API key available for conduit route compute auth.",
				"ConduitRouteService",
			);
		}

		return headers;
	}

	private async parseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		return parseResponseErrorMessage(response, fallback);
	}

	async computeRoute(
		request: ConduitRouteComputeRequest,
	): Promise<ConduitRouteComputeResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/conduit-route/route/compute`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						start: request.start,
						end: request.end,
						mode: request.mode,
						clearance: request.clearance,
						obstacles: request.obstacles ?? [],
						obstacleSource: request.obstacleSource ?? "client",
						obstacleScan: request.obstacleScan,
						canvasWidth: request.canvasWidth,
						canvasHeight: request.canvasHeight,
						gridStep: request.gridStep,
						tagText: request.tagText,
					}),
					timeoutMs: 60_000,
					requestName: "Conduit route compute request",
				},
			);

			const payload = (await response
				.clone()
				.json()
				.catch(() => null)) as ConduitRouteComputeResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Route compute failed (${response.status})`,
						)),
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
				message: "Route compute returned an unexpected payload.",
			};
		} catch (err) {
			logger.error("Route compute request failed", "ConduitRouteService", err);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message: mapFetchErrorMessage(err, "Route compute request failed"),
			};
		}
	}

	async listLayers(): Promise<string[]> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetchWithTimeout(`${this.baseUrl}/api/layers`, {
				method: "GET",
				headers,
				timeoutMs: 20_000,
				requestName: "Conduit route layer request",
			});

			if (!response.ok) {
				logger.warn(
					`Layer request failed (${response.status})`,
					"ConduitRouteService",
				);
				return [];
			}

			const payload = (await response.json().catch(() => null)) as {
				layers?: string[];
			} | null;
			return Array.isArray(payload?.layers)
				? payload.layers.filter(
						(layer): layer is string =>
							typeof layer === "string" && layer.trim().length > 0,
					)
				: [];
		} catch (err) {
			logger.error("Failed to list layers", "ConduitRouteService", err);
			return [];
		}
	}

	async scanObstacles(
		request: ConduitObstacleScanRequest = {},
	): Promise<ConduitObstacleScanResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/conduit-route/obstacles/scan`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						selectionOnly: request.selectionOnly ?? false,
						includeModelspace: request.includeModelspace ?? true,
						maxEntities: request.maxEntities ?? 50000,
						canvasWidth: request.canvasWidth,
						canvasHeight: request.canvasHeight,
						layerNames: request.layerNames ?? [],
						layerTypeOverrides: request.layerTypeOverrides ?? {},
						layerPreset: request.layerPreset ?? "",
					}),
					timeoutMs: 45_000,
					requestName: "Conduit obstacle scan request",
				},
			);

			const payload = (await response
				.clone()
				.json()
				.catch(() => null)) as ConduitObstacleScanResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Obstacle scan failed (${response.status})`,
						)),
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
				message: "Obstacle scan returned an unexpected payload.",
			};
		} catch (err) {
			logger.error("Obstacle scan request failed", "ConduitRouteService", err);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message: mapFetchErrorMessage(err, "Obstacle scan request failed"),
			};
		}
	}

	async backcheckRoutes(
		request: ConduitRouteBackcheckRequest,
	): Promise<ConduitRouteBackcheckResponse> {
		try {
			const requestId = this.createRequestId();
			const headers = await this.getHeaders(requestId);
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/conduit-route/backcheck`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						routes: request.routes,
						obstacles: request.obstacles ?? [],
						obstacleSource: request.obstacleSource ?? "client",
						clearance: request.clearance ?? 18,
					}),
					timeoutMs: 45_000,
					requestName: "Conduit route backcheck request",
				},
			);

			const payload = (await response
				.clone()
				.json()
				.catch(() => null)) as ConduitRouteBackcheckResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Route backcheck failed (${response.status})`,
						)),
					requestId: payload?.requestId,
					warnings: payload?.warnings,
					meta: payload?.meta,
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Route backcheck returned an unexpected payload.",
			};
		} catch (err) {
			logger.error("Route backcheck request failed", "ConduitRouteService", err);
			return {
				success: false,
				code: mapFetchErrorCode(err, "NETWORK_ERROR"),
				message: mapFetchErrorMessage(err, "Route backcheck request failed"),
			};
		}
	}
}

export const conduitRouteService = new ConduitRouteService();
