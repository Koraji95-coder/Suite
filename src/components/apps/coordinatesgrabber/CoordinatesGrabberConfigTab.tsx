import type { Dispatch, SetStateAction } from "react";
import type { ColorScheme } from "@/lib/palette";
import { CoordinatesGrabberBackendStatusPanel } from "./CoordinatesGrabberBackendStatusPanel";
import { CoordinatesGrabberLayerSearchPanels } from "./CoordinatesGrabberLayerSearchPanels";
import {
	type CoordinatesGrabberState,
	type LiveBackendStatus,
} from "./CoordinatesGrabberModels";
import { CoordinatesGrabberModePanel } from "./CoordinatesGrabberModePanel";
import { CoordinatesGrabberPointNamingPanel } from "./CoordinatesGrabberPointNamingPanel";
import { CoordinatesGrabberRunPanel } from "./CoordinatesGrabberRunPanel";
import { CoordinatesGrabberValidationPanel } from "./CoordinatesGrabberValidationPanel";

interface CoordinatesGrabberConfigTabProps {
	state: CoordinatesGrabberState;
	setState: Dispatch<SetStateAction<CoordinatesGrabberState>>;
	palette: ColorScheme;
	availableLayers: string[];
	refreshLayers: () => Promise<string[]>;
	handleModeChange: (newMode: CoordinatesGrabberState["mode"]) => void;
	handleStyleChange: (style: "center" | "corners") => void;
	handleAddLayer: () => void;
	handleRemoveLayer: (layerToRemove: string) => void;
	handleClearLayers: () => void;
	handleLayerSearch: () => Promise<void>;
	handleSelectionRefresh: () => Promise<void>;
	addLog: (message: string) => void;
	backendConnected: boolean;
	wsConnected: boolean;
	liveBackendStatus: LiveBackendStatus;
	liveStatusStamp: string;
	progress: number;
}

export function CoordinatesGrabberConfigTab({
	state,
	setState,
	palette,
	availableLayers,
	refreshLayers,
	handleModeChange,
	handleStyleChange,
	handleAddLayer,
	handleRemoveLayer,
	handleClearLayers,
	handleLayerSearch,
	handleSelectionRefresh,
	addLog,
	backendConnected,
	wsConnected,
	liveBackendStatus,
	liveStatusStamp,
	progress,
}: CoordinatesGrabberConfigTabProps) {
	return (
		<div style={{ flex: 1, overflow: "auto" }}>
			<div
				style={{
					display: "grid",
					gap: "12px",
					gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
					alignItems: "start",
				}}
			>
				<CoordinatesGrabberValidationPanel errors={state.validationErrors} />

				<CoordinatesGrabberModePanel
					mode={state.mode}
					palette={palette}
					onModeChange={handleModeChange}
				/>

				<CoordinatesGrabberPointNamingPanel
					state={state}
					setState={setState}
					palette={palette}
				/>

				<CoordinatesGrabberLayerSearchPanels
					state={state}
					setState={setState}
					palette={palette}
					availableLayers={availableLayers}
					refreshLayers={refreshLayers}
					handleStyleChange={handleStyleChange}
					handleAddLayer={handleAddLayer}
					handleRemoveLayer={handleRemoveLayer}
					handleClearLayers={handleClearLayers}
					addLog={addLog}
				/>

				<CoordinatesGrabberRunPanel
					state={state}
					palette={palette}
					progress={progress}
					backendConnected={backendConnected}
					handleLayerSearch={handleLayerSearch}
					handleSelectionRefresh={handleSelectionRefresh}
				/>

				<CoordinatesGrabberBackendStatusPanel
					palette={palette}
					backendConnected={backendConnected}
					wsConnected={wsConnected}
					liveBackendStatus={liveBackendStatus}
					liveStatusStamp={liveStatusStamp}
					addLog={addLog}
				/>
			</div>
		</div>
	);
}
