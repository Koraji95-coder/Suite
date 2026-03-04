import { PageFrame } from "@/components/apps/ui/PageFrame";
import { DrawingListManagerArchitectureMap } from "./DrawingListManagerArchitectureMap";
import { DrawingListManagerConfigPanels } from "./DrawingListManagerConfigPanels";
import { DrawingListManagerOverview } from "./DrawingListManagerOverview";
import { DrawingListManagerScanPanel } from "./DrawingListManagerScanPanel";
import { DrawingListManagerTable } from "./DrawingListManagerTable";
import { useDrawingListManagerState } from "./useDrawingListManagerState";

export function DrawingListManager() {
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
		<PageFrame
			title="Drawing List Manager"
			description="Validate naming, generate lists, and audit drawing folders in seconds."
			actions={
				<DrawingListManagerOverview
					summary={summary}
					onGenerateList={handleGenerateList}
					onExport={() => void handleExport()}
				/>
			}
		>
			<div className="space-y-6">
				<DrawingListManagerConfigPanels
					projectConfig={projectConfig}
					setProjectConfig={setProjectConfig}
					templateCounts={templateCounts}
					setTemplateCounts={setTemplateCounts}
					swapRules={swapRules}
					setSwapRules={setSwapRules}
					onApplySwap={handleApplySwap}
				/>

				<DrawingListManagerScanPanel
					scanQuery={scanQuery}
					setScanQuery={setScanQuery}
					onFolderScan={handleFolderScan}
					onRenumber={handleRenumber}
					skipped={summary.skipped}
				/>

				<DrawingListManagerTable
					drawings={filteredDrawings}
					onTitleChange={updateDrawingTitle}
				/>

				<DrawingListManagerArchitectureMap architectureMap={architectureMap} />
			</div>
		</PageFrame>
	);
}
