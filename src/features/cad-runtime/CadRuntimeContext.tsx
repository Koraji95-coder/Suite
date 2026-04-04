import { createContext, useContext } from "react";
import {
	type CadRuntimeLiveBackendStatus,
	type CadRuntimeLogSource,
	useCadRuntimeBackendBridge,
} from "./useCadRuntimeBackendBridge";

export type {
	CadRuntimeLiveBackendStatus,
	CadRuntimeLogSource,
} from "./useCadRuntimeBackendBridge";

export type CadRuntimeLogSink = (
	source: CadRuntimeLogSource,
	message: string,
) => void;

export interface CadRuntimeContextValue {
	availableLayers: string[];
	backendConnected: boolean;
	liveBackendStatus: CadRuntimeLiveBackendStatus;
	reconnectBackend: () => Promise<boolean>;
	refreshLayers: () => Promise<string[]>;
	wsLastUpdate: number | null;
	wsLive: boolean;
}

const CadRuntimeContext = createContext<CadRuntimeContextValue | null>(null);

function noopLogSink() {
	return undefined;
}

export function useCadRuntime() {
	const ctx = useContext(CadRuntimeContext);
	if (!ctx) {
		throw new Error("useCadRuntime must be used within CadRuntimeProvider");
	}
	return ctx;
}

export function CadRuntimeProvider({
	addLog = noopLogSink,
	children,
}: {
	addLog?: CadRuntimeLogSink;
	children: React.ReactNode;
}) {
	const runtime = useCadRuntimeBackendBridge({ addLog });

	return (
		<CadRuntimeContext.Provider value={runtime}>
			{children}
		</CadRuntimeContext.Provider>
	);
}
