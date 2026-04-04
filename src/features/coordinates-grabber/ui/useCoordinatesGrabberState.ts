import { type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import {
	type CadRuntimeLogSink,
	useCadRuntime,
} from "@/features/cad-runtime/CadRuntimeContext";
import {
	type CoordinatesGrabberState,
	DEFAULT_STATE,
} from "./CoordinatesGrabberModels";
import {
	useCoordinatesGrabberConfigValidation,
	validateCoordinatesGrabberConfig,
} from "./useCoordinatesGrabberConfigValidation";
import { useCoordinatesGrabberExecutionHistory } from "./useCoordinatesGrabberExecutionHistory";
import { useCoordinatesGrabberLiveStatus } from "./useCoordinatesGrabberLiveStatus";

export function useCoordinatesGrabberState({
	onLog,
}: {
	onLog?: CadRuntimeLogSink;
} = {}) {
	const {
		backendConnected,
		availableLayers,
		refreshLayers,
	} = useCadRuntime();
	const [state, setStateInternal] =
		useState<CoordinatesGrabberState>(DEFAULT_STATE);
	const stateRef = useRef<CoordinatesGrabberState>(DEFAULT_STATE);
	const hasAttemptedRunRef = useRef(false);
	const activeRunIdRef = useRef<string | null>(null);
	const inFlightRunRef = useRef(false);

	const setState = useCallback(
		(
			updater:
				| SetStateAction<CoordinatesGrabberState>
				| ((prev: CoordinatesGrabberState) => CoordinatesGrabberState),
		) => {
			setStateInternal((prev) => {
				const next =
					typeof updater === "function"
						? (
								updater as (
									prev: CoordinatesGrabberState,
								) => CoordinatesGrabberState
							)(prev)
						: updater;
				stateRef.current = next;
				return next;
			});
		},
		[],
	);

	const addLog = useCallback(
		(message: string) => {
			onLog?.("grabber", message);
		},
		[onLog],
	);

	const {
		finishProgress,
		liveBackendStatus,
		liveStatusStamp,
		progress,
		progressStage,
		queueProgressReset,
		reconnectLiveStream,
		setProgress,
		setProgressStage,
		startProgressSimulation,
		wsConnected,
		wsLastEventStamp,
	} = useCoordinatesGrabberLiveStatus({
		addLog,
		activeRunIdRef,
	});

	const {
		handleAddLayer,
		handleClearLayers,
		handleModeChange,
		handleRemoveLayer,
		handleStyleChange,
	} = useCoordinatesGrabberConfigValidation({
		addLog,
		stateLayerName: state.layerName,
		setState,
	});

	const {
		downloadResult,
		handleLayerSearch,
		handleSelectionRefresh,
		openResultLocation,
		retryLastExtraction,
	} = useCoordinatesGrabberExecutionHistory({
		addLog,
		backendConnected,
		setState,
		stateRef,
		inFlightRunRef,
		activeRunIdRef,
		hasAttemptedRunRef,
		wsConnected,
		startProgressSimulation,
		finishProgress,
		queueProgressReset,
		setProgress,
		setProgressStage,
	});

	useEffect(() => {
		const validationTarget: CoordinatesGrabberState = {
			...stateRef.current,
			mode: state.mode,
			selectedLayers: state.selectedLayers,
			layerName: state.layerName,
			pointPrefix: state.pointPrefix,
			startNumber: state.startNumber,
			decimalPlaces: state.decimalPlaces,
			refScale: state.refScale,
		};
		const errors = validateCoordinatesGrabberConfig(validationTarget);
		if (hasAttemptedRunRef.current) {
			setState((prev) => ({ ...prev, validationErrors: errors }));
		} else {
			setState((prev) => ({ ...prev, validationErrors: [] }));
		}
	}, [
		state.mode,
		state.selectedLayers,
		state.layerName,
		state.pointPrefix,
		state.startNumber,
		state.decimalPlaces,
		state.refScale,
		setState,
	]);

	return {
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
		retryLastExtraction,
		progress,
		refreshLayers,
		setState,
		state,
		wsLastEventStamp,
		wsConnected,
	};
}
