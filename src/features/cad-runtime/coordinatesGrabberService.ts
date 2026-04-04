/**
 * Coordinates Grabber Service
 *
 * Facade over split transport layers:
 * - HTTP client
 * - WebSocket lifecycle client
 * - Ground-grid plotting bridge
 */
import { CoordinatesGrabberHttpClient } from "./coordinatesGrabberHttpClient";
import { CoordinatesGrabberPlottingBridge } from "./coordinatesGrabberPlottingBridge";
import type {
	BackendStatus,
	CoordinatesConfig,
	ExecutionResult,
	GroundGridPlotRequest,
	GroundGridPlotResult,
	OpenExportFolderResult,
	WebSocketMessage,
} from "./coordinatesGrabberTransportTypes";
import { CoordinatesGrabberWebSocketClient } from "./coordinatesGrabberWebSocketClient";

class CoordinatesGrabberService {
	private readonly httpClient: CoordinatesGrabberHttpClient;
	private readonly websocketClient: CoordinatesGrabberWebSocketClient;
	private readonly plottingBridge: CoordinatesGrabberPlottingBridge;

	constructor() {
		const baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
		const apiKey = import.meta.env.VITE_API_KEY ?? "";

		this.httpClient = new CoordinatesGrabberHttpClient(baseUrl, apiKey);
		this.websocketClient = new CoordinatesGrabberWebSocketClient({
			getWebSocketUrl: (ticket) => this.httpClient.getWebSocketUrl(ticket),
			requestWebSocketTicket: () => this.httpClient.requestWebSocketTicket(),
		});
		this.plottingBridge = new CoordinatesGrabberPlottingBridge(
			baseUrl,
			(options) => this.httpClient.getHeaders(options),
		);
	}

	public connectWebSocket(): Promise<void> {
		return this.websocketClient.connectWebSocket();
	}

	public on(
		eventType: string,
		callback: (data: WebSocketMessage) => void,
	): () => void {
		return this.websocketClient.on(eventType, callback);
	}

	public disconnect(): void {
		this.websocketClient.disconnect();
	}

	public isConnected(): boolean {
		return this.websocketClient.isConnected();
	}

	public getBaseUrl(): string {
		return this.httpClient.getBaseUrl();
	}

	public async checkStatus(): Promise<BackendStatus> {
		return this.httpClient.checkStatus();
	}

	public async execute(
		config: CoordinatesConfig,
		options?: { runId?: string },
	): Promise<ExecutionResult> {
		return this.httpClient.execute(config, options);
	}

	public async listLayers(): Promise<string[]> {
		return this.httpClient.listLayers();
	}

	public async getSelectionCount(): Promise<number> {
		return this.httpClient.getSelectionCount();
	}

	public async triggerSelection(): Promise<void> {
		return this.httpClient.triggerSelection();
	}

	public async downloadResultFile(path: string): Promise<Blob> {
		return this.httpClient.downloadResultFile(path);
	}

	public async openExportFolder(path: string): Promise<OpenExportFolderResult> {
		return this.httpClient.openExportFolder(path);
	}

	public async plotGroundGrid(
		payload: GroundGridPlotRequest,
	): Promise<GroundGridPlotResult> {
		return this.plottingBridge.plotGroundGrid(payload);
	}
}

export const coordinatesGrabberService = new CoordinatesGrabberService();

export type {
	BackendStatus,
	CoordinatesConfig,
	ExecutionResult,
	ExecutionResultPoint,
	GroundGridPlotConductor,
	GroundGridPlotConfig,
	GroundGridPlotPlacement,
	GroundGridPlotRequest,
	GroundGridPlotResult,
	OpenExportFolderResult,
	ServiceDisconnectedEvent,
	WebSocketCompleteEvent,
	WebSocketConnectedEvent,
	WebSocketErrorEvent,
	WebSocketMessage,
	WebSocketProgressEvent,
	WebSocketStatusEvent,
} from "./coordinatesGrabberTransportTypes";
