import { useTheme } from "@/lib/palette";
import styles from "./CoordinatesGrabber.module.css";
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
		openResultLocation,
		handleAddLayer,
		handleClearLayers,
		handleLayerSearch,
		handleModeChange,
		handleRemoveLayer,
		handleSelectionRefresh,
		handleStyleChange,
		liveBackendStatus,
		liveStatusStamp,
		progressStage,
		reconnectLiveStream,
		progress,
		refreshLayers,
		setState,
		state,
		wsLastEventStamp,
		wsConnected,
	} = useCoordinatesGrabberState();

	return (
		<div className={styles.root} style={{ background: palette.background }}>
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
					wsLastEventStamp={wsLastEventStamp}
					reconnectLiveStream={reconnectLiveStream}
					progress={progress}
					progressStage={progressStage}
				/>
			)}

			{state.activeTab === "export" && (
				<CoordinatesGrabberExportTab
					state={state}
					palette={palette}
					downloadResult={downloadResult}
					openResultLocation={openResultLocation}
				/>
			)}

			{state.activeTab === "yaml" && (
				<div className={styles.yamlTab}>
					<CoordinateYamlViewer data={state.coordinateData} />
				</div>
			)}

			{state.activeTab === "history" && (
				<CoordinatesGrabberHistoryTab state={state} palette={palette} />
			)}
		</div>
	);
}
