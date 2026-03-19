// src/components/apps/ground-grid/GroundGridContext.tsx
import { createContext, useCallback, useContext, useState } from "react";
import {
	type GroundGridLiveBackendStatus,
	useGroundGridBackendBridge,
} from "./useGroundGridBackendBridge";

export interface LogEntry {
	timestamp: string;
	source: "grabber" | "generator" | "system";
	message: string;
}

interface GroundGridContextValue {
	logs: LogEntry[];
	addLog: (source: LogEntry["source"], message: string) => void;
	clearLogs: () => void;
	liveBackendStatus: GroundGridLiveBackendStatus;
	backendConnected: boolean;
	wsLive: boolean;
	wsLastUpdate: number | null;
	availableLayers: string[];
	refreshLayers: () => Promise<string[]>;
	reconnectBackend: () => Promise<boolean>;
}

const GroundGridContext = createContext<GroundGridContextValue | null>(null);

export function useGroundGrid() {
	const ctx = useContext(GroundGridContext);
	if (!ctx) {
		throw new Error("useGroundGrid must be used within GroundGridProvider");
	}
	return ctx;
}

export function GroundGridProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [logs, setLogs] = useState<LogEntry[]>([]);

	const addLog = useCallback((source: LogEntry["source"], message: string) => {
		setLogs((prev) => [
			...prev,
			{ timestamp: new Date().toLocaleTimeString(), source, message },
		]);
	}, []);

	const clearLogs = useCallback(() => setLogs([]), []);

	const {
		availableLayers,
		backendConnected,
		liveBackendStatus,
		reconnectBackend,
		refreshLayers,
		wsLastUpdate,
		wsLive,
	} = useGroundGridBackendBridge({
		addLog,
	});

	return (
		<GroundGridContext.Provider
			value={{
				addLog,
				availableLayers,
				backendConnected,
				clearLogs,
				liveBackendStatus,
				logs,
				reconnectBackend,
				refreshLayers,
				wsLastUpdate,
				wsLive,
			}}
		>
			{children}
		</GroundGridContext.Provider>
	);
}
