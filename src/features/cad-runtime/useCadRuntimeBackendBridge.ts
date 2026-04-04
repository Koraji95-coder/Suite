import { useCallback, useEffect, useRef, useState } from "react";
import { coordinatesGrabberService } from "./coordinatesGrabberService";

export type CadRuntimeLogSource = "grabber" | "generator" | "system";

export interface CadRuntimeLiveBackendStatus {
	autocadRunning: boolean;
	drawingOpen: boolean;
	drawingName: string | null;
	error: string | null;
	lastUpdated: number | null;
}

interface UseCadRuntimeBackendBridgeOptions {
	addLog: (source: CadRuntimeLogSource, message: string) => void;
}

const DEFAULT_LIVE_BACKEND_STATUS: CadRuntimeLiveBackendStatus = {
	autocadRunning: false,
	drawingOpen: false,
	drawingName: null,
	error: null,
	lastUpdated: null,
};

export function useCadRuntimeBackendBridge({
	addLog,
}: UseCadRuntimeBackendBridgeOptions) {
	const [backendConnected, setBackendConnected] = useState(false);
	const [wsLive, setWsLive] = useState(() =>
		coordinatesGrabberService.isConnected(),
	);
	const [wsLastUpdate, setWsLastUpdate] = useState<number | null>(null);
	const [availableLayers, setAvailableLayers] = useState<string[]>([]);
	const [liveBackendStatus, setLiveBackendStatus] =
		useState<CadRuntimeLiveBackendStatus>(DEFAULT_LIVE_BACKEND_STATUS);

	const hasInitRef = useRef(false);
	const lastWsStatusAtRef = useRef(0);
	const wasConnectedRef = useRef(false);
	const isFirstCheckRef = useRef(true);

	const refreshLayers = useCallback(async (): Promise<string[]> => {
		try {
			const layers = await coordinatesGrabberService.listLayers();
			setAvailableLayers(layers);
			return layers;
		} catch {
			return [];
		}
	}, []);

	const handleConnectedState = useCallback(
		async (isNowConnected: boolean, source: "WebSocket" | "HTTP") => {
			const wasConnected = wasConnectedRef.current;
			const isFirstCheck = isFirstCheckRef.current;

			if (isFirstCheck) {
				if (isNowConnected) {
					addLog("system", `Connected to AutoCAD backend (${source})`);
					const layers = await refreshLayers();
					if (layers.length > 0) {
						addLog(
							"system",
							`Retrieved ${layers.length} layers from active drawing`,
						);
					}
				} else {
					addLog("system", "AutoCAD backend not detected");
					addLog(
						"system",
						"Start AutoCAD and the backend server to enable CAD features",
					);
				}
			} else if (wasConnected !== isNowConnected) {
				if (isNowConnected) {
					addLog("system", `AutoCAD connection established (${source})`);
					addLog("system", "CAD features restored and synchronized.");
					await refreshLayers();
				} else {
					addLog("system", "AutoCAD connection lost. Operating in offline mode.");
					addLog(
						"system",
						"Keep working locally; reconnect will restore CAD-linked actions.",
					);
				}
			}

			wasConnectedRef.current = isNowConnected;
			isFirstCheckRef.current = false;
			setBackendConnected(isNowConnected);
		},
		[addLog, refreshLayers],
	);

	const reconnectBackend = useCallback(async () => {
		try {
			coordinatesGrabberService.disconnect();
			await coordinatesGrabberService.connectWebSocket();
			setWsLive(true);
			setWsLastUpdate(Date.now());
			addLog("system", "Reconnect requested. Waiting for live status heartbeat.");
			return true;
		} catch (error) {
			setWsLive(false);
			const message = error instanceof Error ? error.message : "Unknown error";
			addLog("system", `WebSocket reconnect failed: ${message}`);
			return false;
		}
	}, [addLog]);

	useEffect(() => {
		if (hasInitRef.current) return;
		hasInitRef.current = true;

		let pollInterval: ReturnType<typeof setInterval> | null = null;
		addLog("system", "Checking for AutoCAD backend...");

		coordinatesGrabberService.connectWebSocket().catch(() => {
			addLog(
				"system",
				"WebSocket status stream unavailable; using HTTP polling fallback",
			);
		});

		const unsubscribeConnected = coordinatesGrabberService.on(
			"connected",
			(event) => {
				if (event.type !== "connected") return;
				setWsLive(true);
				setWsLastUpdate(Date.now());
			},
		);

		const unsubscribeStatus = coordinatesGrabberService.on(
			"status",
			(event) => {
				if (event.type !== "status") return;
				lastWsStatusAtRef.current = Date.now();
				setWsLive(true);
				setWsLastUpdate(Date.now());
				setLiveBackendStatus({
					autocadRunning: event.autocad_running,
					drawingOpen: event.drawing_open,
					drawingName:
						typeof event.drawing_name === "string" ? event.drawing_name : null,
					error: typeof event.error === "string" ? event.error : null,
					lastUpdated: Date.now(),
				});
				void handleConnectedState(
					Boolean(event.connected && event.autocad_running),
					"WebSocket",
				);
			},
		);

		const unsubscribeDisconnected = coordinatesGrabberService.on(
			"service-disconnected",
			() => {
				setWsLive(false);
			},
		);

		const unsubscribeError = coordinatesGrabberService.on("error", () => {
			setWsLive(false);
		});

		const checkBackendStatus = async () => {
			if (Date.now() - lastWsStatusAtRef.current < 15_000) {
				return;
			}
			try {
				const status = await coordinatesGrabberService.checkStatus();
				const isNowConnected = Boolean(
					status.connected && status.autocad_running,
				);
				setLiveBackendStatus({
					autocadRunning: Boolean(status.autocad_running),
					drawingOpen: Boolean(status.drawing_open),
					drawingName:
						typeof status.drawing_name === "string" ? status.drawing_name : null,
					error: typeof status.error === "string" ? status.error : null,
					lastUpdated: Date.now(),
				});
				await handleConnectedState(isNowConnected, "HTTP");
			} catch {
				if (isFirstCheckRef.current) {
					addLog(
						"system",
						"AutoCAD backend not detected - features will activate when available",
					);
					setBackendConnected(false);
					isFirstCheckRef.current = false;
					wasConnectedRef.current = false;
					return;
				}
				await handleConnectedState(false, "HTTP");
			}
		};

		void checkBackendStatus();
		pollInterval = setInterval(() => {
			void checkBackendStatus();
		}, 10_000);

		return () => {
			if (pollInterval) clearInterval(pollInterval);
			unsubscribeConnected();
			unsubscribeStatus();
			unsubscribeDisconnected();
			unsubscribeError();
		};
	}, [addLog, handleConnectedState]);

	return {
		availableLayers,
		backendConnected,
		liveBackendStatus,
		reconnectBackend,
		refreshLayers,
		wsLastUpdate,
		wsLive,
	};
}
