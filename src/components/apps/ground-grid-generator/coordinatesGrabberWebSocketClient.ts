import { logger } from "@/lib/logger";
import type { WebSocketMessage } from "./coordinatesGrabberTransportTypes";

interface CoordinatesGrabberWebSocketClientOptions {
	getWebSocketUrl: (ticket: string) => string;
	requestWebSocketTicket: () => Promise<string>;
}

export class CoordinatesGrabberWebSocketClient {
	private websocket: WebSocket | null = null;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private readonly reconnectDelay = 2000;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private connectingPromise: Promise<void> | null = null;
	private readonly listeners: Map<string, Set<(data: WebSocketMessage) => void>> =
		new Map();
	private shouldReconnect = true;
	private wsConnectStartedAt: number | null = null;
	private wsOpenedAt: number | null = null;
	private authInvalid = false;
	private wsConnectionSequence = 0;
	private readonly getWebSocketUrl: (ticket: string) => string;
	private readonly requestWebSocketTicket: () => Promise<string>;

	constructor(options: CoordinatesGrabberWebSocketClientOptions) {
		this.getWebSocketUrl = options.getWebSocketUrl;
		this.requestWebSocketTicket = options.requestWebSocketTicket;
	}

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

	public on(
		eventType: string,
		callback: (data: WebSocketMessage) => void,
	): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)?.add(callback);
		return () => {
			this.listeners.get(eventType)?.delete(callback);
		};
	}

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

	public isConnected(): boolean {
		return (
			this.websocket !== null && this.websocket.readyState === WebSocket.OPEN
		);
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

	private attemptReconnect(): void {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
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
			this.emit("service-disconnected", {
				type: "service-disconnected",
				message: errorMsg,
				timestamp: new Date().toISOString(),
			});
		}
	}

	private emit(eventType: string, data: WebSocketMessage): void {
		const callbacks = this.listeners.get(eventType);
		if (!callbacks) return;
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

	private isStaleConnection(connectionId: number): boolean {
		return connectionId !== this.wsConnectionSequence;
	}
}

