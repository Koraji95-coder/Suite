// src/components/apps/ground-grid/GroundGridContext.tsx
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";

export interface LogEntry {
	timestamp: string;
	source: "grabber" | "generator" | "system";
	message: string;
}

interface GroundGridContextValue {
	logs: LogEntry[];
	addLog: (source: LogEntry["source"], message: string) => void;
	clearLogs: () => void;
	backendConnected: boolean;
	availableLayers: string[];
	refreshLayers: () => Promise<string[]>;
}

const GroundGridContext = createContext<GroundGridContextValue | null>(null);

export function useGroundGrid() {
	const ctx = useContext(GroundGridContext);
	if (!ctx) {
		throw new Error("useGroundGrid must be used within GroundGridProvider");
	}
	return ctx;
}

export function GroundGridProvider({ children }: { children: React.ReactNode }) {
	const { showToast } = useToast();
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [backendConnected, setBackendConnected] = useState(false);
	const [availableLayers, setAvailableLayers] = useState<string[]>([]);
	const hasInitRef = useRef(false);
	const shownDisconnectToastRef = useRef(false);

	const addLog = useCallback((source: LogEntry["source"], message: string) => {
		setLogs((prev) => [
			...prev,
			{ timestamp: new Date().toLocaleTimeString(), source, message },
		]);
	}, []);

	const clearLogs = useCallback(() => setLogs([]), []);

	const refreshLayers = useCallback(async (): Promise<string[]> => {
		try {
			const layers = await coordinatesGrabberService.listLayers();
			setAvailableLayers(layers);
			return layers;
		} catch {
			return [];
		}
	}, []);

	useEffect(() => {
		if (hasInitRef.current) return;
		hasInitRef.current = true;

		let pollInterval: ReturnType<typeof setInterval> | null = null;
		let isFirstCheck = true;
		let wasConnected = false;

		addLog("system", "Checking for AutoCAD backend...");

		coordinatesGrabberService.connectWebSocket().catch(() => {
			addLog(
				"system",
				"WebSocket status stream unavailable; using HTTP polling fallback",
			);
		});

		const unsubscribeWsStatus = coordinatesGrabberService.on(
			"status",
			async (event) => {
				if (event.type !== "status") return;

				const isNowConnected = event.connected && event.autocad_running;

				if (isFirstCheck) {
					if (isNowConnected) {
						addLog("system", "Connected to AutoCAD backend (WebSocket)");
						const layers = await coordinatesGrabberService.listLayers();
						setAvailableLayers(layers);
						if (layers.length > 0) {
							addLog(
								"system",
								`Retrieved ${layers.length} layers from active drawing`,
							);
						}
					}
				} else if (wasConnected !== isNowConnected) {
					if (isNowConnected) {
						addLog("system", "AutoCAD connection established (WebSocket)");
						shownDisconnectToastRef.current = false;
						showToast("success", "AutoCAD backend connected");
						const layers = await coordinatesGrabberService.listLayers();
						setAvailableLayers(layers);
					} else {
						addLog(
							"system",
							"AutoCAD connection lost - waiting for reconnection...",
						);
						if (!shownDisconnectToastRef.current) {
							shownDisconnectToastRef.current = true;
							showToast(
								"error",
								"AutoCAD connection lost. Check the Log tab for details.",
							);
						}
					}
				}

				wasConnected = isNowConnected;
				setBackendConnected(isNowConnected);
				isFirstCheck = false;
			},
		);

		const checkBackendStatus = async () => {
			try {
				const status = await coordinatesGrabberService.checkStatus();
				const isNowConnected = status.connected && status.autocad_running;

				if (isFirstCheck) {
					if (isNowConnected) {
						addLog("system", "Connected to AutoCAD backend");
						const layers = await coordinatesGrabberService.listLayers();
						setAvailableLayers(layers);
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
						if (!shownDisconnectToastRef.current) {
							shownDisconnectToastRef.current = true;
							showToast(
								"error",
								"AutoCAD backend not detected. Check the Log tab for details.",
							);
						}
					}
				} else if (wasConnected !== isNowConnected) {
					if (isNowConnected) {
						addLog("system", "AutoCAD connection established");
						shownDisconnectToastRef.current = false;
						showToast("success", "AutoCAD backend connected");
						const layers = await coordinatesGrabberService.listLayers();
						setAvailableLayers(layers);
					} else {
						addLog(
							"system",
							"AutoCAD connection lost - waiting for reconnection...",
						);
						if (!shownDisconnectToastRef.current) {
							shownDisconnectToastRef.current = true;
							showToast(
								"error",
								"AutoCAD connection lost. Check the Log tab for details.",
							);
						}
					}
				}

				wasConnected = isNowConnected;
				setBackendConnected(isNowConnected);
				isFirstCheck = false;
			} catch {
				if (isFirstCheck) {
					addLog(
						"system",
						"AutoCAD backend not detected - features will activate when available",
					);
					if (!shownDisconnectToastRef.current) {
						shownDisconnectToastRef.current = true;
						showToast(
							"error",
							"AutoCAD backend not detected. Check the Log tab for details.",
						);
					}
					isFirstCheck = false;
				}
			}
		};

		checkBackendStatus();
		pollInterval = setInterval(checkBackendStatus, 10000);

		return () => {
			if (pollInterval) clearInterval(pollInterval);
			unsubscribeWsStatus();
		};
	}, [addLog, showToast]);

	return (
		<GroundGridContext.Provider
			value={{
				logs,
				addLog,
				clearLogs,
				backendConnected,
				availableLayers,
				refreshLayers,
			}}
		>
			{children}
		</GroundGridContext.Provider>
	);
}