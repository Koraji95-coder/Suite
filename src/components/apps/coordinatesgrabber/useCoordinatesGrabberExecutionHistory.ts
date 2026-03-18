import {
	useCallback,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
import type {
	CoordinatesGrabberState,
	ExecutionHistoryEntry,
	PerformanceMetrics,
} from "./CoordinatesGrabberModels";
import type { CoordinatePoint } from "./types";
import { validateCoordinatesGrabberConfig } from "./useCoordinatesGrabberConfigValidation";

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

export function useCoordinatesGrabberExecutionHistory({
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
}: UseCoordinatesGrabberExecutionHistoryOptions) {
	const saveExecutionResult = useCallback(
		(entry: ExecutionHistoryEntry) => {
			setState((prev) => ({
				...prev,
				executionHistory: [entry, ...prev.executionHistory].slice(0, 50),
			}));
		},
		[setState],
	);

	const calculateMetrics = useCallback(
		(
			startTime: number,
			pointsCreated: number,
			fileSize: number,
		): PerformanceMetrics => {
			const duration = (Date.now() - startTime) / 1000;
			return {
				startTime,
				duration,
				pointsCreated,
				geometriesProcessed: 0,
				fileSize,
				pointsPerSecond: Math.round((pointsCreated / duration) * 100) / 100,
			};
		},
		[],
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
					const selectionCount =
						await coordinatesGrabberService.getSelectionCount();
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

			const layersToRun =
				currentState.selectedLayers.length > 0
					? currentState.selectedLayers
					: currentState.layerName.trim()
						? [currentState.layerName.trim()]
						: [];

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
					{
						mode: currentState.mode,
						precision: currentState.decimalPlaces,
						prefix: currentState.pointPrefix,
						initial_number: currentState.startNumber,
						block_name_filter: "",
						layer_search_name: layersToRun.join(", "),
						layer_search_names: layersToRun,
						layer_search_use_selection: currentState.scanSelection,
						layer_search_include_modelspace: currentState.includeModelspace,
						layer_search_use_corners:
							currentState.extractionStyle === "corners",
						ref_dwg_path: "",
						ref_layer_name: "Coordinate Reference Point",
						ref_scale: currentState.refScale,
						ref_rotation_deg: 0,
						excel_path: "",
						replace_previous: true,
						auto_increment: false,
						show_segment: false,
						show_elevation: true,
						show_distance: false,
						show_distance_3d: false,
						show_bearing: false,
						show_azimuth: false,
					},
					{ runId },
				);

				if (result.success) {
					const pointsCreated = result.points_created || 0;
					const blocksInserted = result.blocks_inserted || 0;
					const filePath = result.excel_path || "";
					const duration = (Date.now() - executionStartTime) / 1000;
					const blockErrors = result.block_errors as string[] | null;

					const metrics = calculateMetrics(executionStartTime, pointsCreated, 0);

					const historyEntry: ExecutionHistoryEntry = {
						timestamp: Date.now(),
						config: {
							mode: currentState.mode,
							layerName: layersToRun.join(", "),
							selectedLayers: layersToRun,
							extractionStyle: currentState.extractionStyle,
							pointPrefix: currentState.pointPrefix,
							startNumber: currentState.startNumber,
							decimalPlaces: currentState.decimalPlaces,
							scanSelection: currentState.scanSelection,
							includeModelspace: currentState.includeModelspace,
							refScale: currentState.refScale,
						},
						success: true,
						pointsCreated,
						duration,
						filePath,
					};

					saveExecutionResult(historyEntry);

					const toNumber = (value: unknown): number => {
						if (typeof value === "number" && Number.isFinite(value))
							return value;
						if (typeof value === "string") {
							const parsed = Number(value);
							return Number.isFinite(parsed) ? parsed : 0;
						}
						return 0;
					};

					const toText = (value: unknown, fallback = ""): string => {
						return typeof value === "string" ? value : fallback;
					};

					const pointData: CoordinatePoint[] = result.points
						? result.points.map((point) => ({
								id: toText(
									point.id,
									`${currentState.pointPrefix}${currentState.startNumber}`,
								),
								east: toNumber(point.east),
								north: toNumber(point.north),
								elevation: toNumber(point.elevation),
								layer: toText(point.layer),
							}))
						: Array.from({ length: pointsCreated }, (_, index) => ({
								id: `${currentState.pointPrefix}${currentState.startNumber + index}`,
								east: 0,
								north: 0,
								elevation: 0,
								layer: layersToRun[0] || "",
							}));

					setState((prev) => ({
						...prev,
						excelPath: filePath,
						performanceMetrics: metrics,
						coordinateData: pointData,
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
					const historyEntry: ExecutionHistoryEntry = {
						timestamp: Date.now(),
						config: {
							mode: currentState.mode,
							layerName: layersToRun.join(", "),
							selectedLayers: layersToRun,
							extractionStyle: currentState.extractionStyle,
							pointPrefix: currentState.pointPrefix,
							startNumber: currentState.startNumber,
							decimalPlaces: currentState.decimalPlaces,
							scanSelection: currentState.scanSelection,
							includeModelspace: currentState.includeModelspace,
							refScale: currentState.refScale,
						},
						success: false,
						duration: (Date.now() - executionStartTime) / 1000,
						message: result.message,
					};

					saveExecutionResult(historyEntry);

					addLog(`[ERROR] ${result.message}`);
					if (result.error_details) {
						addLog(`[ERROR] Details: ${result.error_details}`);
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				addLog(`[ERROR] Execution failed: ${message}`);

				const historyEntry: ExecutionHistoryEntry = {
					timestamp: Date.now(),
					config: {
						mode: currentState.mode,
						layerName: layersToRun.join(", "),
						selectedLayers: layersToRun,
						extractionStyle: currentState.extractionStyle,
						pointPrefix: currentState.pointPrefix,
						startNumber: currentState.startNumber,
						decimalPlaces: currentState.decimalPlaces,
						scanSelection: currentState.scanSelection,
						includeModelspace: currentState.includeModelspace,
						refScale: currentState.refScale,
					},
					success: false,
					duration: (Date.now() - executionStartTime) / 1000,
					message,
				};

				saveExecutionResult(historyEntry);
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
		backendConnected,
		addLog,
		wsConnected,
		startProgressSimulation,
		calculateMetrics,
		saveExecutionResult,
		finishProgress,
		queueProgressReset,
		setState,
		inFlightRunRef,
		stateRef,
		hasAttemptedRunRef,
		activeRunIdRef,
		setProgress,
		setProgressStage,
	]);

	const retryLastExtraction = useCallback(async () => {
		const latestEntry = stateRef.current.executionHistory[0];
		if (!latestEntry) {
			addLog("[WARNING] No previous extraction to retry");
			return;
		}

		const config = latestEntry.config;
		const selectedLayersFromConfig = Array.isArray(config.selectedLayers)
			? config.selectedLayers.filter(
					(layer): layer is string =>
						typeof layer === "string" && layer.trim().length > 0,
				)
			: [];
		const layerNameFromConfig =
			typeof config.layerName === "string" ? config.layerName : "";
		const parsedLayerList =
			selectedLayersFromConfig.length > 0
				? selectedLayersFromConfig
				: layerNameFromConfig
						.split(",")
						.map((layer) => layer.trim())
						.filter((layer) => layer.length > 0);
		const nextLayerName = parsedLayerList[0] || layerNameFromConfig;

		const nextState: CoordinatesGrabberState = {
			...stateRef.current,
			mode: "layer_search",
			layerName: nextLayerName,
			selectedLayers: parsedLayerList,
			extractionStyle:
				config.extractionStyle === "center" ||
				config.extractionStyle === "corners"
					? config.extractionStyle
					: stateRef.current.extractionStyle,
			refScale:
				typeof config.refScale === "number" &&
				Number.isFinite(config.refScale) &&
				config.refScale > 0
					? config.refScale
					: stateRef.current.refScale,
			pointPrefix:
				typeof config.pointPrefix === "string" &&
				config.pointPrefix.trim().length > 0
					? config.pointPrefix
					: stateRef.current.pointPrefix,
			startNumber:
				typeof config.startNumber === "number" &&
				Number.isFinite(config.startNumber) &&
				config.startNumber >= 1
					? Math.floor(config.startNumber)
					: stateRef.current.startNumber,
			decimalPlaces:
				typeof config.decimalPlaces === "number" &&
				Number.isFinite(config.decimalPlaces)
					? Math.min(12, Math.max(0, Math.floor(config.decimalPlaces)))
					: stateRef.current.decimalPlaces,
			scanSelection:
				typeof config.scanSelection === "boolean"
					? config.scanSelection
					: stateRef.current.scanSelection,
			includeModelspace:
				typeof config.includeModelspace === "boolean"
					? config.includeModelspace
					: stateRef.current.includeModelspace,
		};

		stateRef.current = nextState;
		setState(nextState);
		addLog("[INFO] Restored last extraction settings");
		await handleLayerSearch();
	}, [addLog, handleLayerSearch, setState, stateRef]);

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

	const handleSelectionRefresh = useCallback(async () => {
		try {
			const count = await coordinatesGrabberService.getSelectionCount();
			setState((prev) => ({ ...prev, selectionCount: count }));
			addLog(`[INFO] Selection: ${count} entities selected`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			addLog(`[WARNING] Could not get selection count: ${message}`);
		}
	}, [setState, addLog]);

	return {
		downloadResult,
		handleLayerSearch,
		handleSelectionRefresh,
		openResultLocation,
		retryLastExtraction,
		saveExecutionResult,
	};
}
