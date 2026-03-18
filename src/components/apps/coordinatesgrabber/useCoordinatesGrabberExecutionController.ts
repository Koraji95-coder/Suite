import {
	useCallback,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
import {
	calculatePerformanceMetrics,
	createHistoryEntry,
	resolveLayersToRun,
	restoreStateFromHistory,
} from "./coordinatesGrabberExecutionHistoryUtils";
import { normalizeCoordinatePoints } from "./coordinatesGrabberPointNormalizer";
import type {
	CoordinatesGrabberState,
	ExecutionHistoryEntry,
} from "./CoordinatesGrabberModels";
import { validateCoordinatesGrabberConfig } from "./useCoordinatesGrabberConfigValidation";

interface UseCoordinatesGrabberExecutionControllerOptions {
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

function buildExecuteRequest(state: CoordinatesGrabberState, layersToRun: string[]) {
	return {
		auto_increment: false,
		block_name_filter: "",
		excel_path: "",
		initial_number: state.startNumber,
		layer_search_include_modelspace: state.includeModelspace,
		layer_search_name: layersToRun.join(", "),
		layer_search_names: layersToRun,
		layer_search_use_corners: state.extractionStyle === "corners",
		layer_search_use_selection: state.scanSelection,
		mode: state.mode,
		prefix: state.pointPrefix,
		precision: state.decimalPlaces,
		ref_dwg_path: "",
		ref_layer_name: "Coordinate Reference Point",
		ref_rotation_deg: 0,
		ref_scale: state.refScale,
		replace_previous: true,
		show_azimuth: false,
		show_bearing: false,
		show_distance: false,
		show_distance_3d: false,
		show_elevation: true,
		show_segment: false,
	};
}

export function useCoordinatesGrabberExecutionController({
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
}: UseCoordinatesGrabberExecutionControllerOptions) {
	const saveExecutionResult = useCallback(
		(entry: ExecutionHistoryEntry) => {
			setState((prev) => ({
				...prev,
				executionHistory: [entry, ...prev.executionHistory].slice(0, 50),
			}));
		},
		[setState],
	);

	const handleLayerSearch = useCallback(async () => {
		if (inFlightRunRef.current) {
			addLog("[INFO] Extraction is already running");
			return;
		}
		inFlightRunRef.current = true;
		try {
			const currentState = stateRef.current;
			if (currentState.isRunning) {
				addLog("[INFO] Extraction is already running");
				return;
			}
			if (!backendConnected) {
				addLog("[ERROR] Not connected to AutoCAD backend");
				return;
			}

			hasAttemptedRunRef.current = true;
			const errors = validateCoordinatesGrabberConfig(currentState);
			if (errors.length > 0) {
				setState((prev) => ({ ...prev, validationErrors: errors }));
				errors.forEach((err) => addLog(`[VALIDATION] ${err}`));
				addLog("[ERROR] Configuration validation failed");
				return;
			}

			if (currentState.scanSelection) {
				try {
					const selectionCount = await coordinatesGrabberService.getSelectionCount();
					setState((prev) => ({ ...prev, selectionCount }));
					if (selectionCount <= 0 && !currentState.includeModelspace) {
						addLog(
							"[ERROR] Selection-only scan is enabled but no objects are selected. Select objects in AutoCAD first.",
						);
						return;
					}
					if (selectionCount <= 0 && currentState.includeModelspace) {
						addLog(
							"[WARNING] Selection scan enabled but no objects selected; proceeding with modelspace scan.",
						);
					} else {
						addLog(
							`[INFO] Selection preflight: ${selectionCount} objects selected`,
						);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : "Unknown error";
					if (!currentState.includeModelspace) {
						addLog(
							`[ERROR] Could not verify AutoCAD selection (${message}). Disable selection-only or retry.`,
						);
						return;
					}
					addLog(
						`[WARNING] Could not verify AutoCAD selection (${message}); proceeding with modelspace scan.`,
					);
				}
			}

			setState((prev) => ({ ...prev, isRunning: true, validationErrors: [] }));
			const executionStartTime = Date.now();
			const layersToRun = resolveLayersToRun(currentState);

			addLog(
				`[PROCESSING] Starting extraction on ${layersToRun.length} layer(s): ${layersToRun.join(", ")}`,
			);
			addLog(
				`[PROCESSING] Style: ${currentState.extractionStyle === "corners" ? "4 corners" : "center point"}`,
			);
			addLog(`[INFO] Reference block scale: ${currentState.refScale}`);
			addLog(
				`[INFO] Point naming: ${currentState.pointPrefix}${currentState.startNumber}`,
			);
			addLog(`[INFO] Precision: ${currentState.decimalPlaces} decimal places`);

			try {
				addLog("[PROCESSING] Preparing request...");
				const runId = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
				activeRunIdRef.current = runId;
				if (wsConnected) {
					setProgress(3);
					setProgressStage("initializing");
				} else {
					startProgressSimulation();
				}

				const result = await coordinatesGrabberService.execute(
					buildExecuteRequest(currentState, layersToRun),
					{ runId },
				);

				if (result.success) {
					const pointsCreated = result.points_created || 0;
					const blocksInserted = result.blocks_inserted || 0;
					const filePath = result.excel_path || "";
					const duration = (Date.now() - executionStartTime) / 1000;
					const blockErrors = result.block_errors as string[] | null;
					const metrics = calculatePerformanceMetrics(
						executionStartTime,
						pointsCreated,
						0,
					);

					saveExecutionResult(
						createHistoryEntry({
							durationSeconds: duration,
							filePath,
							layersToRun,
							pointsCreated,
							state: currentState,
							success: true,
						}),
					);

					setState((prev) => ({
						...prev,
						coordinateData: normalizeCoordinatePoints(result.points, {
							layerName: layersToRun[0] || "",
							pointPrefix: currentState.pointPrefix,
							pointsCreated,
							startNumber: currentState.startNumber,
						}),
						excelPath: filePath,
						performanceMetrics: metrics,
					}));

					addLog(
						`[SUCCESS] ${result.message || `Extracted ${pointsCreated} points`}`,
					);
					if (blocksInserted > 0) {
						addLog(`[SUCCESS] Reference blocks inserted: ${blocksInserted}`);
					}
					if (filePath) {
						addLog(`[SUCCESS] Excel exported: ${filePath}`);
					}
					addLog(`[INFO] Duration: ${duration.toFixed(2)}s`);
					if (blockErrors && blockErrors.length > 0) {
						blockErrors.forEach((err) => addLog(`[WARNING] ${err}`));
					}
				} else {
					saveExecutionResult(
						createHistoryEntry({
							durationSeconds: (Date.now() - executionStartTime) / 1000,
							layersToRun,
							message: result.message,
							state: currentState,
							success: false,
						}),
					);
					addLog(`[ERROR] ${result.message}`);
					if (result.error_details) {
						addLog(`[ERROR] Details: ${result.error_details}`);
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				saveExecutionResult(
					createHistoryEntry({
						durationSeconds: (Date.now() - executionStartTime) / 1000,
						layersToRun,
						message,
						state: currentState,
						success: false,
					}),
				);
				addLog(`[ERROR] Execution failed: ${message}`);
			} finally {
				setState((prev) => ({ ...prev, isRunning: false }));
				activeRunIdRef.current = null;
				if (!wsConnected) {
					setProgressStage("completed");
					finishProgress();
				} else {
					setProgressStage("completed");
					setProgress(100);
					queueProgressReset(600);
				}
			}
		} finally {
			inFlightRunRef.current = false;
		}
	}, [
		activeRunIdRef,
		addLog,
		backendConnected,
		finishProgress,
		hasAttemptedRunRef,
		inFlightRunRef,
		queueProgressReset,
		saveExecutionResult,
		setProgress,
		setProgressStage,
		setState,
		startProgressSimulation,
		stateRef,
		wsConnected,
	]);

	const retryLastExtraction = useCallback(async () => {
		const latestEntry = stateRef.current.executionHistory[0];
		if (!latestEntry) {
			addLog("[WARNING] No previous extraction to retry");
			return;
		}
		const nextState = restoreStateFromHistory(stateRef.current, latestEntry);
		stateRef.current = nextState;
		setState(nextState);
		addLog("[INFO] Restored last extraction settings");
		await handleLayerSearch();
	}, [addLog, handleLayerSearch, setState, stateRef]);

	const handleSelectionRefresh = useCallback(async () => {
		try {
			const count = await coordinatesGrabberService.getSelectionCount();
			setState((prev) => ({ ...prev, selectionCount: count }));
			addLog(`[INFO] Selection: ${count} entities selected`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			addLog(`[WARNING] Could not get selection count: ${message}`);
		}
	}, [addLog, setState]);

	return {
		handleLayerSearch,
		handleSelectionRefresh,
		retryLastExtraction,
		saveExecutionResult,
	};
}
