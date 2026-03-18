import {
	fetchWithTimeout,
	mapFetchErrorCode,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	BackendStatus,
	CoordinatesConfig,
	ExecutionResult,
	OpenExportFolderResult,
	WebSocketTicketResponse,
} from "./coordinatesGrabberTransportTypes";

export class CoordinatesGrabberHttpClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private missingAuthWarningShown = false;

	constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
	}

	public getBaseUrl(): string {
		return this.baseUrl;
	}

	public getWebSocketUrl(ticket: string): string {
		const wsBaseUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
		const separator = wsBaseUrl.includes("?") ? "&" : "?";
		return `${wsBaseUrl}${separator}ticket=${encodeURIComponent(ticket)}`;
	}

	public async getHeaders(options?: {
		includeContentType?: boolean;
		context?: string;
	}): Promise<Record<string, string>> {
		const includeContentType = options?.includeContentType ?? true;
		const context = options?.context || "request";
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
			logger.debug(
				`Using API-key fallback auth for ${context}`,
				"CoordinatesGrabber",
			);
			return headers;
		}

		if (!this.missingAuthWarningShown) {
			this.missingAuthWarningShown = true;
			logger.warn(
				"No bearer token or API key available for backend auth. AutoCAD features will remain offline until auth is available.",
				"CoordinatesGrabber",
			);
		}

		return headers;
	}

	public async requestWebSocketTicket(): Promise<string> {
		const endpoint = `${this.baseUrl}/api/autocad/ws-ticket`;
		const headers = await this.getHeaders({ context: "websocket-ticket" });
		const response = await fetchWithTimeout(endpoint, {
			method: "POST",
			headers,
			timeoutMs: 15_000,
			requestName: "WebSocket ticket request",
		});

		if (!response.ok) {
			const message = await this.parseErrorMessage(
				response,
				`WebSocket ticket request failed (${response.status})`,
			);
			throw new Error(message);
		}

		const payload = (await response.json()) as WebSocketTicketResponse;
		const ticket = (payload.ticket || "").trim();
		if (!ticket) {
			throw new Error("WebSocket ticket response did not include a ticket");
		}

		logger.debug("Received websocket ticket", "CoordinatesGrabber", {
			ttlSeconds: payload.ttl_seconds ?? null,
			expiresAt: payload.expires_at ?? null,
		});
		return ticket;
	}

	public async checkStatus(): Promise<BackendStatus> {
		try {
			const headers = await this.getHeaders({ context: "status" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/status`, {
				method: "GET",
				headers,
				timeoutMs: 15_000,
				requestName: "AutoCAD status request",
			});
			if (!response.ok) {
				const message = await this.parseErrorMessage(
					response,
					`Status check failed (${response.status})`,
				);
				throw new Error(message);
			}
			const data = await response.json();

			if (data.backend_id !== "coordinates-grabber-api") {
				logger.warn("Response from unknown service", "CoordinatesGrabber", {
					url: this.baseUrl,
				});
				return { connected: false, autocad_running: false };
			}

			return data;
		} catch (err) {
			logger.error("Status check failed", "CoordinatesGrabber", {
				baseUrl: this.baseUrl,
				error: err,
			});
			return {
				connected: false,
				autocad_running: false,
			};
		}
	}

	public async execute(
		config: CoordinatesConfig,
		options?: { runId?: string },
	): Promise<ExecutionResult> {
		try {
			const headers = await this.getHeaders({ context: "execute" });
			if (options?.runId) headers["X-Run-Id"] = options.runId;
			const response = await fetchWithTimeout(`${this.baseUrl}/api/execute`, {
				method: "POST",
				headers,
				body: JSON.stringify(config),
				timeoutMs: 120_000,
				requestName: "Coordinates execute request",
			});

			if (!response.ok) {
				if (response.status === 501) {
					return {
						success: false,
						message:
							"The Python backend does not support /api/execute. Ensure api_server.py is running on " +
							this.baseUrl,
						error_details: `Another service may be running on ${this.baseUrl} instead of the Coordinates Grabber API`,
					};
				}
				const body = (await response.json().catch(() => null)) as {
					message?: string;
					error_details?: string;
				} | null;
				if (body && typeof body.message === "string") {
					return {
						success: false,
						message: body.message,
						error_details: body.error_details,
					};
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.json();
		} catch (err) {
			const message = mapFetchErrorMessage(err, "Unknown error");
			const errorCode = mapFetchErrorCode(err, "UNKNOWN_ERROR");
			logger.error("Execution failed", "CoordinatesGrabber", err);
			if (errorCode === "NETWORK_ERROR") {
				return {
					success: false,
					message: `Cannot reach backend at ${this.baseUrl}. Is api_server.py running?`,
					error_details: "Start the Python API server: python api_server.py",
				};
			}
			return {
				success: false,
				message: `Backend error: ${message}`,
				error_details: message,
			};
		}
	}

	public async listLayers(): Promise<string[]> {
		try {
			const headers = await this.getHeaders({ context: "layers" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/layers`, {
				method: "GET",
				headers,
				timeoutMs: 20_000,
				requestName: "Layer request",
			});

			if (!response.ok) {
				const message = await this.parseErrorMessage(
					response,
					`Layer request failed (${response.status})`,
				);
				throw new Error(message);
			}
			const data = await response.json();
			return data.layers || [];
		} catch (err) {
			logger.error("Failed to list layers", "CoordinatesGrabber", err);
			return [];
		}
	}

	public async getSelectionCount(): Promise<number> {
		try {
			const headers = await this.getHeaders({ context: "selection-count" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/selection-count`, {
				method: "GET",
				headers,
				timeoutMs: 20_000,
				requestName: "Selection count request",
			});

			if (!response.ok) {
				const message = await this.parseErrorMessage(
					response,
					`Selection count failed (${response.status})`,
				);
				throw new Error(message);
			}
			const data = await response.json();
			return data.count || 0;
		} catch (err) {
			logger.error("Failed to get selection count", "CoordinatesGrabber", err);
			return 0;
		}
	}

	public async triggerSelection(): Promise<void> {
		try {
			const headers = await this.getHeaders({ context: "trigger-selection" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/trigger-selection`, {
				method: "POST",
				headers,
				timeoutMs: 20_000,
				requestName: "Trigger selection request",
			});

			if (!response.ok) {
				const message = await this.parseErrorMessage(
					response,
					`Trigger selection failed (${response.status})`,
				);
				throw new Error(message);
			}
		} catch (err) {
			logger.error("Failed to trigger selection", "CoordinatesGrabber", err);
		}
	}

	public async downloadResultFile(path: string): Promise<Blob> {
		const headers = await this.getHeaders({
			includeContentType: false,
			context: "download-result",
		});
		const response = await fetchWithTimeout(
			`${this.baseUrl}/api/download-result?path=${encodeURIComponent(path)}`,
			{
				method: "GET",
				headers,
				timeoutMs: 60_000,
				requestName: "Download result request",
			},
		);
		if (!response.ok) {
			const message = await this.parseErrorMessage(
				response,
				`Download failed (${response.status})`,
			);
			throw new Error(message);
		}
		return await response.blob();
	}

	public async openExportFolder(path: string): Promise<OpenExportFolderResult> {
		const headers = await this.getHeaders({ context: "open-export-folder" });
		const response = await fetchWithTimeout(`${this.baseUrl}/api/open-export-folder`, {
			method: "POST",
			headers,
			body: JSON.stringify({ path }),
			timeoutMs: 20_000,
			requestName: "Open export folder request",
		});

		const body = (await response
			.json()
			.catch(() => null)) as OpenExportFolderResult | null;
		if (!response.ok) {
			throw new Error(
				body?.message || `Open folder failed (${response.status})`,
			);
		}
		return (
			body || {
				success: true,
				message: "Opened export folder",
			}
		);
	}

	private async parseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		return parseResponseErrorMessage(response, fallback);
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for backend auth",
					"CoordinatesGrabber",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (err) {
			logger.error(
				"Unexpected error while reading Supabase session",
				"CoordinatesGrabber",
				err,
			);
			return null;
		}
	}
}

