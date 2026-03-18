import { useCallback, type MutableRefObject } from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface UseCoordinatesGrabberResultFilesOptions {
	addLog: (message: string) => void;
	stateRef: MutableRefObject<CoordinatesGrabberState>;
}

export function useCoordinatesGrabberResultFiles({
	addLog,
	stateRef,
}: UseCoordinatesGrabberResultFilesOptions) {
	const downloadResult = useCallback(async () => {
		const excelPath = stateRef.current.excelPath;
		if (!excelPath) {
			addLog("[ERROR] No export file available to download");
			return;
		}
		try {
			addLog("[INFO] Initiating download...");
			const blob = await coordinatesGrabberService.downloadResultFile(excelPath);
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `coordinates_${Date.now()}.xlsx`;
			link.click();
			window.URL.revokeObjectURL(url);
			addLog("[SUCCESS] File downloaded successfully");
		} catch (err) {
			addLog(
				`[ERROR] Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	}, [addLog, stateRef]);

	const openResultLocation = useCallback(async () => {
		const excelPath = stateRef.current.excelPath;
		if (!excelPath) {
			addLog("[ERROR] No export path available");
			return;
		}
		try {
			const result = await coordinatesGrabberService.openExportFolder(excelPath);
			addLog(`[SUCCESS] ${result.message}`);
		} catch (err) {
			addLog(
				`[ERROR] Could not open export folder: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	}, [addLog, stateRef]);

	return {
		downloadResult,
		openResultLocation,
	};
}
