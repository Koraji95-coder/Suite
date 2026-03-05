import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
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

	private async getHeaders(): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
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
			// Keep fallback message when body parse fails.
		}
		return fallback;
	}

	async computeRoute(
		request: ConduitRouteComputeRequest,
	): Promise<ConduitRouteComputeResponse> {
		try {
			const headers = await this.getHeaders();
			const response = await fetch(
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
				},
			);

			const payload = (await response
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
				code: "NETWORK_ERROR",
				message:
					err instanceof Error ? err.message : "Route compute request failed",
			};
		}
	}

	async listLayers(): Promise<string[]> {
		try {
			const headers = await this.getHeaders();
			const response = await fetch(`${this.baseUrl}/api/layers`, {
				method: "GET",
				headers,
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
			const headers = await this.getHeaders();
			const response = await fetch(
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
					}),
				},
			);

			const payload = (await response
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
				code: "NETWORK_ERROR",
				message:
					err instanceof Error ? err.message : "Obstacle scan request failed",
			};
		}
	}
}

export const conduitRouteService = new ConduitRouteService();
