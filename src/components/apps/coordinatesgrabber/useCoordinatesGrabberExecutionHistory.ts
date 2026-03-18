import type { MutableRefObject, SetStateAction } from "react";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import { useCoordinatesGrabberExecutionController } from "./useCoordinatesGrabberExecutionController";
import { useCoordinatesGrabberResultFiles } from "./useCoordinatesGrabberResultFiles";

interface UseCoordinatesGrabberExecutionHistoryOptions {
	addLog: (message: string) => void;
	backendConnected: boolean;
	setState: (
		updater:
			| SetStateAction<CoordinatesGrabberState>
			| ((prev: CoordinatesGrabberState) => CoordinatesGrabberState),
	) => void;
	stateRef: MutableRefObject<CoordinatesGrabberState>;
	inFlightRunRef: MutableRefObject<boolean>;
	activeRunIdRef: MutableRefObject<string | null>;
	hasAttemptedRunRef: MutableRefObject<boolean>;
	wsConnected: boolean;
	startProgressSimulation: () => void;
	finishProgress: () => void;
	queueProgressReset: (delayMs?: number) => void;
	setProgress: (value: number) => void;
	setProgressStage: (value: string) => void;
}

export function useCoordinatesGrabberExecutionHistory(
	options: UseCoordinatesGrabberExecutionHistoryOptions,
) {
	const {
		handleLayerSearch,
		handleSelectionRefresh,
		retryLastExtraction,
		saveExecutionResult,
	} = useCoordinatesGrabberExecutionController(options);
	const { downloadResult, openResultLocation } = useCoordinatesGrabberResultFiles({
		addLog: options.addLog,
		stateRef: options.stateRef,
	});

	return {
		downloadResult,
		handleLayerSearch,
		handleSelectionRefresh,
		openResultLocation,
		retryLastExtraction,
		saveExecutionResult,
	};
}
