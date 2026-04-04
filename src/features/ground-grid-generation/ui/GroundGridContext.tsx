// src/features/ground-grid-generation/ui/GroundGridContext.tsx
import { createContext, useCallback, useContext, useState } from "react";
import {
	CadRuntimeProvider,
	type CadRuntimeContextValue,
	type CadRuntimeLogSource,
	type CadRuntimeLogSink,
	useCadRuntime,
} from "@/features/cad-runtime/CadRuntimeContext";

export interface LogEntry {
	timestamp: string;
	source: CadRuntimeLogSource;
	message: string;
}

interface GroundGridContextValue extends CadRuntimeContextValue {
	logs: LogEntry[];
	addLog: (source: LogEntry["source"], message: string) => void;
	clearLogs: () => void;
}

const GroundGridContext = createContext<GroundGridContextValue | null>(null);

export function useGroundGrid() {
	const ctx = useContext(GroundGridContext);
	if (!ctx) {
		throw new Error("useGroundGrid must be used within GroundGridProvider");
	}
	return ctx;
}

function GroundGridContextBridge({
	addLog,
	children,
	clearLogs,
	logs,
}: {
	addLog: CadRuntimeLogSink;
	children: React.ReactNode;
	clearLogs: () => void;
	logs: LogEntry[];
}) {
	const runtime = useCadRuntime();

	return (
		<GroundGridContext.Provider
			value={{
				addLog,
				clearLogs,
				logs,
				...runtime,
			}}
		>
			{children}
		</GroundGridContext.Provider>
	);
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

	return (
		<CadRuntimeProvider addLog={addLog}>
			<GroundGridContextBridge
				addLog={addLog}
				clearLogs={clearLogs}
				logs={logs}
			>
				{children}
			</GroundGridContextBridge>
		</CadRuntimeProvider>
	);
}
