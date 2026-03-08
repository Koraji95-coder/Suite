/**
 * Coordinates Grabber Service
 *
 * Handles communication with the Python AutoCAD backend application.
 * Supports configuration management, execution, and progress tracking.
 */

import {
	fetchWithTimeout,
	mapFetchErrorCode,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";

export interface CoordinatesConfig {
	mode: "polylines" | "blocks" | "layer_search";
	precision: number;
	prefix: string;
	initial_number: number;
	block_name_filter: string;
	layer_search_name: string;
	layer_search_names?: string[];
	layer_search_use_selection: boolean;
	layer_search_include_modelspace: boolean;
	layer_search_use_corners: boolean;
	ref_dwg_path: string;
	ref_layer_name: string;
	ref_scale: number;
	ref_rotation_deg: number;
	excel_path: string;
	replace_previous: boolean;
	auto_increment: boolean;
	// Table options
	show_segment: boolean;
	show_elevation: boolean;
	show_distance: boolean;
	show_distance_3d: boolean;
	show_bearing: boolean;
	show_azimuth: boolean;
}

export interface ExecutionResultPoint {
	id: string;
	east: number;
	north: number;
	elevation: number;
	layer: string;
}

export interface ExecutionResult {
	success: boolean;
	message: string;
	run_id?: string;
	excel_path?: string;
	points_created?: number;
	blocks_inserted?: number;
	block_errors?: string[] | null;
	duration_seconds?: number;
	error_details?: string;
	points?: ExecutionResultPoint[];
}

export interface GroundGridPlotConductor {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface GroundGridPlotPlacement {
	type: "ROD" | "TEE" | "CROSS" | "GROUND_ROD_WITH_TEST_WELL";
	grid_x: number;
	grid_y: number;
	autocad_x: number;
	autocad_y: number;
	rotation_deg: number;
}

export interface GroundGridPlotConfig {
	origin_x_feet: number;
	origin_x_inches: number;
	origin_y_feet: number;
	origin_y_inches: number;
	block_scale: number;
	layer_name: string;
	grid_max_y: number;
}

export interface GroundGridPlotRequest {
	conductors: GroundGridPlotConductor[];
	placements: GroundGridPlotPlacement[];
	config: GroundGridPlotConfig;
}

export interface GroundGridPlotResult {
	success: boolean;
	message: string;
	lines_drawn: number;
	blocks_inserted: number;
	layer_name: string;
	test_well_block_name?: string;
	error_details?: string;
}

export interface OpenExportFolderResult {
	success: boolean;
	message: string;
}

export interface ProgressUpdate {
	stage: string;
	progress: number; // 0-100
	current_item?: string;
	message?: string;
}

export interface BackendStatus {
	connected: boolean;
	autocad_running: boolean;
	drawing_open?: boolean;
	drawing_name?: string | null;
	error?: string | null;
	last_config?: CoordinatesConfig;
	last_execution_time?: string;
}

export interface WebSocketConnectedEvent {
	type: "connected";
	backend_id: string;
	backend_version: string;
	timestamp: number;
}

export interface WebSocketStatusEvent {
	type: "status";
	backend_id: string;
	backend_version: string;
	connected: boolean;
	autocad_running: boolean;
	drawing_open: boolean;
	drawing_name?: string | null;
	error?: string | null;
	checks?: Record<string, boolean>;
	timestamp: number;
}

export interface ServiceDisconnectedEvent {
	type: "service-disconnected";
	message: string;
	timestamp: string;
}

export interface WebSocketProgressEvent {
	type: "progress";
	run_id?: string | null;
	stage: string;
	progress: number;
	current_item?: string;
	message?: string;
}

export interface WebSocketCompleteEvent {
	type: "complete";
	run_id?: string | null;
	message?: string;
	result?: ExecutionResult;
	timestamp?: number;
}

export interface WebSocketErrorEvent {
	type: "error";
	run_id?: string | null;
	message: string;
	code?: string;
	error_details?: string;
	timestamp?: number;
}

export type WebSocketMessage =
	| ServiceDisconnectedEvent
	| WebSocketConnectedEvent
	| WebSocketStatusEvent
	| WebSocketProgressEvent
	| WebSocketCompleteEvent
	| WebSocketErrorEvent;

interface WebSocketTicketResponse {
	ok?: boolean;
	ticket?: string;
	expires_at?: number;
	ttl_seconds?: number;
	error?: string;
	message?: string;
	code?: string;
}

/**
 * Singleton service for coordinating with the Python AutoCAD backend.
 *
 * Can operate in three modes:
 * 1. WebSocket (real-time, bidirectional)
 * 2. HTTP (REST API calls)
 * 3. Local IPC (if running on same machine via localhost)
 */
class CoordinatesGrabberService {
	private baseUrl: string = "http://localhost:5000"; // Python backend URL
	private websocket: WebSocket | null = null;
	private reconnectAttempts: number = 0;
	private maxReconnectAttempts: number = 5;
	private reconnectDelay: number = 2000; // ms
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private connectingPromise: Promise<void> | null = null;
	private listeners: Map<string, Set<(data: WebSocketMessage) => void>> =
		new Map();
	private apiKey: string;
	private shouldReconnect: boolean = true;
	private wsConnectStartedAt: number | null = null;
	private wsOpenedAt: number | null = null;
	private authInvalid: boolean = false;
	private wsConnectionSequence: number = 0;
	private missingAuthWarningShown: boolean = false;

	private isStaleConnection(connectionId: number): boolean {
		return connectionId !== this.wsConnectionSequence;
	}

	constructor() {
		// Initialize with localhost for development
		// In production, this would be configured via environment variables
		this.baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
		const key = import.meta.env.VITE_API_KEY;
		if (!key) {
			logger.warn(
				"[CoordinatesGrabberService] VITE_API_KEY is not set. " +
					"Bearer auth will be required for backend requests.",
				"CoordinatesGrabber",
			);
		}
		this.apiKey = key ?? "";
	}

	/**
	 * Parse error payloads without throwing on invalid JSON.
	 */
	private async parseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		return parseResponseErrorMessage(response, fallback);
	}

	/**
	 * Read Supabase access token for authenticated backend requests.
	 */
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

	/**
	 * Build auth headers: bearer token preferred, API-key fallback for local/dev.
	 */
	private async getHeaders(options?: {
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

	private getWebSocketUrl(ticket: string): string {
		const wsBaseUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
		const separator = wsBaseUrl.includes("?") ? "&" : "?";
		return `${wsBaseUrl}${separator}ticket=${encodeURIComponent(ticket)}`;
	}

	private async requestWebSocketTicket(): Promise<string> {
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

	private handleAuthInvalid(message?: string): void {
		if (this.authInvalid) return;

		this.authInvalid = true;
		this.shouldReconnect = false;
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		const errorMessage =
			typeof message === "string" && message.trim()
				? message
				: "WebSocket authentication failed: invalid credentials.";

		this.emit("error", {
			type: "error",
			message: errorMessage,
			code: "AUTH_INVALID",
			error_details: errorMessage,
			timestamp: Date.now(),
		});

		this.emit("service-disconnected", {
			type: "service-disconnected",
			message:
				"WebSocket authentication failed (AUTH_INVALID). Re-authenticate and retry connection.",
			timestamp: new Date().toISOString(),
		});

		try {
			this.websocket?.close();
		} catch {
			// Ignore close errors while transitioning to auth-invalid terminal state.
		}
	}

	/**
	 * Connect to the Python backend via WebSocket for real-time updates
	 */
	public connectWebSocket(): Promise<void> {
		if (this.authInvalid) {
			return Promise.reject(
				new Error(
					"WebSocket authentication is blocked after AUTH_INVALID. Call disconnect() after correcting keys, then reconnect.",
				),
			);
		}

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		this.shouldReconnect = true;
		if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}

		if (this.connectingPromise) {
			return this.connectingPromise;
		}

		this.connectingPromise = new Promise((resolve, reject) => {
			const connectionId = ++this.wsConnectionSequence;
			this.wsConnectStartedAt = Date.now();

			this.requestWebSocketTicket()
				.then((ticket) => {
					if (this.isStaleConnection(connectionId) || !this.shouldReconnect) {
						this.connectingPromise = null;
						reject(new Error("WebSocket connection canceled"));
						return;
					}

					const wsUrl = this.getWebSocketUrl(ticket);
					this.websocket = new WebSocket(wsUrl);

					this.websocket.onopen = () => {
						if (this.isStaleConnection(connectionId)) {
							try {
								this.websocket?.close();
							} catch {
								// Ignore close errors while canceling stale connection.
							}
							return;
						}
						this.wsOpenedAt = Date.now();
						this.reconnectAttempts = 0;
						this.connectingPromise = null;
						logger.debug("WebSocket connected", "CoordinatesGrabber", {
							connectionId,
							connectMs:
								this.wsConnectStartedAt !== null
									? Date.now() - this.wsConnectStartedAt
									: null,
						});
						resolve();
					};

					this.websocket.onmessage = (event) => {
						if (this.isStaleConnection(connectionId)) return;
						try {
							const data = JSON.parse(event.data) as
								| WebSocketMessage
								| { type?: string; code?: string; message?: string };
							if (
								data &&
								data.type === "error" &&
								data.code === "AUTH_INVALID"
							) {
								logger.error(
									"WebSocket authentication failed (AUTH_INVALID). Disabling reconnect until reset.",
									"CoordinatesGrabber",
									{
										connectionId,
										message: data.message || "",
									},
								);
								this.handleAuthInvalid(data.message);
								return;
							}
							if (typeof data.type === "string" && data.type.length > 0) {
								this.emit(data.type, data as WebSocketMessage);
							}
						} catch (err) {
							logger.error(
								"Failed to parse WebSocket message",
								"CoordinatesGrabber",
								err,
							);
						}
					};

					this.websocket.onerror = (error) => {
						if (this.isStaleConnection(connectionId)) return;
						logger.error("WebSocket connection error", "CoordinatesGrabber", {
							connectionId,
							error,
						});
						this.connectingPromise = null;
						reject(error);
					};

					this.websocket.onclose = (event) => {
						if (this.isStaleConnection(connectionId)) return;
						const openForMs = this.wsOpenedAt
							? Date.now() - this.wsOpenedAt
							: 0;
						const connectForMs = this.wsConnectStartedAt
							? Date.now() - this.wsConnectStartedAt
							: 0;
						logger.debug("WebSocket disconnected", "CoordinatesGrabber", {
							connectionId,
							code: event.code,
							reason: event.reason || "",
							wasClean: event.wasClean,
							openForMs,
							connectForMs,
						});
						this.wsConnectStartedAt = null;
						this.wsOpenedAt = null;
						this.websocket = null;
						this.connectingPromise = null;
						if (this.shouldReconnect) {
							this.attemptReconnect();
						}
					};
				})
				.catch((err) => {
					if (this.isStaleConnection(connectionId)) return;
					this.connectingPromise = null;
					this.wsConnectStartedAt = null;
					logger.error(
						"WebSocket ticket acquisition failed",
						"CoordinatesGrabber",
						err,
					);
					reject(err);
				});
		});

		return this.connectingPromise;
	}

	/**
	 * Attempt to reconnect to WebSocket after disconnect
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			const delay =
				this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
			logger.debug(
				`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
				"CoordinatesGrabber",
			);
			if (this.reconnectTimeout) {
				clearTimeout(this.reconnectTimeout);
			}
			this.reconnectTimeout = setTimeout(() => {
				this.reconnectTimeout = null;
				if (!this.shouldReconnect) {
					return;
				}
				this.connectWebSocket().catch((err) => {
					logger.error("Reconnection failed", "CoordinatesGrabber", err);
				});
			}, delay);
		} else {
			const errorMsg =
				"Max WebSocket reconnection attempts reached. Service is offline. Please restart the server.";
			logger.error(errorMsg, "CoordinatesGrabber");
			if (this.reconnectTimeout) {
				clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}
			// Notify UI that service is permanently disconnected
			this.emit("service-disconnected", {
				type: "service-disconnected",
				message: errorMsg,
				timestamp: new Date().toISOString(),
			});
		}
	}

	/**
	 * Check if backend is accessible and is the correct Coordinates Grabber API
	 */
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

	/**
	 * Execute coordinates grabber with the provided config
	 */
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

	/**
	 * List available layers in the active AutoCAD drawing
	 */
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

	/**
	 * Get the current selection count from AutoCAD
	 */
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

	/**
	 * Trigger selection in AutoCAD (minimize Suite UI and focus AutoCAD)
	 */
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

	/**
	 * Download a generated coordinates Excel file from backend.
	 */
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

	/**
	 * Open folder containing a generated coordinates Excel file (Windows backend).
	 */
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

	/**
	 * Plot generated ground-grid conductors and placements into AutoCAD.
	 */
	public async plotGroundGrid(
		payload: GroundGridPlotRequest,
	): Promise<GroundGridPlotResult> {
		try {
			const headers = await this.getHeaders({ context: "ground-grid-plot" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/ground-grid/plot`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				timeoutMs: 120_000,
				requestName: "Ground-grid plot request",
			});

			const data = (await response
				.json()
				.catch(() => null)) as GroundGridPlotResult | null;
			if (!response.ok) {
				return {
					success: false,
					message:
						data?.message || `Ground-grid plot failed (${response.status})`,
					lines_drawn: data?.lines_drawn ?? 0,
					blocks_inserted: data?.blocks_inserted ?? 0,
					layer_name: data?.layer_name ?? "",
					error_details: data?.error_details,
				};
			}

			return (
				data || {
					success: true,
					message: "Ground grid plotted",
					lines_drawn: 0,
					blocks_inserted: 0,
					layer_name: "",
				}
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error("Ground-grid plot failed", "CoordinatesGrabber", err);
			return {
				success: false,
				message: `Cannot reach backend at ${this.baseUrl}. Is api_server.py running?`,
				lines_drawn: 0,
				blocks_inserted: 0,
				layer_name: "",
				error_details: message,
			};
		}
	}

	/**
	 * Subscribe to a specific event type
	 */
	public on(
		eventType: string,
		callback: (data: WebSocketMessage) => void,
	): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)!.add(callback);

		// Return unsubscribe function
		return () => {
			this.listeners.get(eventType)?.delete(callback);
		};
	}

	/**
	 * Emit an event (for testing / internal use)
	 */
	private emit(eventType: string, data: WebSocketMessage): void {
		const callbacks = this.listeners.get(eventType);
		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback(data);
				} catch (err) {
					logger.error(
						`Error in event listener for ${eventType}`,
						"CoordinatesGrabber",
						err,
					);
				}
			});
		}
	}

	/**
	 * Close WebSocket connection
	 */
	public disconnect(): void {
		this.wsConnectionSequence += 1;
		this.shouldReconnect = false;
		this.authInvalid = false;
		this.wsConnectStartedAt = null;
		this.wsOpenedAt = null;
		this.reconnectAttempts = 0;
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		if (this.websocket) {
			this.websocket.close();
			this.websocket = null;
		}
		this.connectingPromise = null;
	}

	/**
	 * Get the current connection URL (for debugging)
	 */
	public getBaseUrl(): string {
		return this.baseUrl;
	}

	/**
	 * Check if WebSocket is connected
	 */
	public isConnected(): boolean {
		return (
			this.websocket !== null && this.websocket.readyState === WebSocket.OPEN
		);
	}
}

export const coordinatesGrabberService = new CoordinatesGrabberService();
