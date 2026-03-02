import { useTheme } from "@/lib/palette";
import { DrawingListManagerArchitectureMap } from "./DrawingListManagerArchitectureMap";
import { DrawingListManagerConfigPanels } from "./DrawingListManagerConfigPanels";
import { DrawingListManagerOverview } from "./DrawingListManagerOverview";
import { DrawingListManagerScanPanel } from "./DrawingListManagerScanPanel";
import { DrawingListManagerTable } from "./DrawingListManagerTable";
import { useDrawingListManagerState } from "./useDrawingListManagerState";

export function DrawingListManager() {
	const { palette } = useTheme();
	const {
		architectureMap,
		filteredDrawings,
		handleApplySwap,
		handleExport,
		handleFolderScan,
		handleGenerateList,
		handleRenumber,
		projectConfig,
		scanQuery,
		setProjectConfig,
		setScanQuery,
		setSwapRules,
		setTemplateCounts,
		summary,
		swapRules,
		templateCounts,
		updateDrawingTitle,
	} = useDrawingListManagerState();

	return (
		<div
			style={{
				minHeight: "100%",
				padding: 24,
				display: "flex",
				flexDirection: "column",
				gap: 24,
				color: palette.text,
			}}
		>
			<DrawingListManagerOverview
				palette={palette}
				summary={summary}
				onGenerateList={handleGenerateList}
				onExport={() => {
					void handleExport();
				}}
			/>

			<DrawingListManagerConfigPanels
				palette={palette}
				projectConfig={projectConfig}
				setProjectConfig={setProjectConfig}
				templateCounts={templateCounts}
				setTemplateCounts={setTemplateCounts}
				swapRules={swapRules}
				setSwapRules={setSwapRules}
				onApplySwap={handleApplySwap}
			/>

			<DrawingListManagerScanPanel
				palette={palette}
				scanQuery={scanQuery}
				setScanQuery={setScanQuery}
				onFolderScan={handleFolderScan}
				onRenumber={handleRenumber}
				skipped={summary.skipped}
			/>

			<DrawingListManagerTable
				palette={palette}
				drawings={filteredDrawings}
				onTitleChange={updateDrawingTitle}
			/>

			<DrawingListManagerArchitectureMap
				palette={palette}
				architectureMap={architectureMap}
			/>
		</div>
	);
}
