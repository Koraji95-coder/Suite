import { useTheme } from "@/lib/palette";
import { CoordinatesGrabberConfigTab } from "./CoordinatesGrabberConfigTab";
import { CoordinatesGrabberExportTab } from "./CoordinatesGrabberExportTab";
import { CoordinatesGrabberHeader } from "./CoordinatesGrabberHeader";
import { CoordinatesGrabberHistoryTab } from "./CoordinatesGrabberHistoryTab";
import { CoordinatesGrabberTabs } from "./CoordinatesGrabberTabs";
import { CoordinateYamlViewer } from "./CoordinateYamlViewer";
import { useCoordinatesGrabberState } from "./useCoordinatesGrabberState";

export function CoordinatesGrabber() {
	const { palette } = useTheme();
	const {
		addLog,
		availableLayers,
		backendConnected,
		downloadResult,
		handleAddLayer,
		handleClearLayers,
		handleLayerSearch,
		handleModeChange,
		handleRemoveLayer,
		handleSelectionRefresh,
		handleStyleChange,
		liveBackendStatus,
		liveStatusStamp,
		progress,
		refreshLayers,
		setState,
		state,
		wsConnected,
	} = useCoordinatesGrabberState();

	return (
		<div
			className="flex h-full flex-col gap-3 overflow-auto p-4 sm:p-5"
			style={{ background: palette.background }}
		>
			<CoordinatesGrabberHeader palette={palette} />

			<CoordinatesGrabberTabs
				palette={palette}
				activeTab={state.activeTab}
				historyCount={state.executionHistory.length}
				onTabChange={(tab) =>
					setState((prev) => ({
						...prev,
						activeTab: tab,
					}))
				}
			/>

			{state.activeTab === "config" && (
				<CoordinatesGrabberConfigTab
					state={state}
					setState={setState}
					palette={palette}
					availableLayers={availableLayers}
					refreshLayers={refreshLayers}
					handleModeChange={handleModeChange}
					handleStyleChange={handleStyleChange}
					handleAddLayer={handleAddLayer}
					handleRemoveLayer={handleRemoveLayer}
					handleClearLayers={handleClearLayers}
					handleLayerSearch={handleLayerSearch}
					handleSelectionRefresh={handleSelectionRefresh}
					addLog={addLog}
					backendConnected={backendConnected}
					wsConnected={wsConnected}
					liveBackendStatus={liveBackendStatus}
					liveStatusStamp={liveStatusStamp}
					progress={progress}
				/>
			)}

			{state.activeTab === "export" && (
				<CoordinatesGrabberExportTab
					state={state}
					palette={palette}
					downloadResult={downloadResult}
				/>
			)}

			{state.activeTab === "yaml" && (
				<div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
					<CoordinateYamlViewer data={state.coordinateData} />
				</div>
			)}

			{state.activeTab === "history" && (
				<CoordinatesGrabberHistoryTab state={state} palette={palette} />
			)}
		</div>
	);
}
