import { useCallback, useEffect, useRef, useState } from "react";
import { coordinatesGrabberService } from "@/components/apps/ground-grid-generator/coordinatesGrabberService";
import { useGroundGrid } from "../ground-grid-generator/GroundGridContext";
import {
	type CoordinatesGrabberState,
	DEFAULT_STATE,
	type ExecutionHistoryEntry,
	type LiveBackendStatus,
	type PerformanceMetrics,
} from "./CoordinatesGrabberModels";
import type { CoordinatePoint } from "./types";

export function useCoordinatesGrabberState() {
	const {
		addLog: ctxAddLog,
		backendConnected,
		availableLayers,
		refreshLayers,
	} = useGroundGrid();
	const [state, setState] = useState<CoordinatesGrabberState>(DEFAULT_STATE);
	const [wsConnected, setWsConnected] = useState(
		coordinatesGrabberService.isConnected(),
	);
	const [lastWsEventAt, setLastWsEventAt] = useState<number | null>(null);
	const [liveBackendStatus, setLiveBackendStatus] = useState<LiveBackendStatus>(
		{
			autocadRunning: false,
			drawingOpen: false,
			drawingName: null,
			error: null,
			lastUpdated: null,
		},
	);
	const [progress, setProgress] = useState(0);
	const [progressStage, setProgressStage] = useState<string>("");
	const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	const hasAttemptedRunRef = useRef(false);
	const activeRunIdRef = useRef<string | null>(null);

	const addLog = useCallback(
		(message: string) => {
			ctxAddLog("grabber", message);
		},
		[ctxAddLog],
	);

	const startProgressSimulation = useCallback(() => {
		setProgress(5);
		setProgressStage("processing");
		let current = 5;
		if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
		progressIntervalRef.current = setInterval(() => {
			current += Math.random() * 3 + 0.5;
			if (current >= 90) current = 90;
			setProgress(Math.round(current));
		}, 400);
	}, []);

	const finishProgress = useCallback(() => {
		if (progressIntervalRef.current) {
			clearInterval(progressIntervalRef.current);
			progressIntervalRef.current = null;
		}
		setProgress(100);
		setTimeout(() => {
			setProgress(0);
			setProgressStage("");
		}, 600);
	}, []);

	const saveExecutionResult = useCallback((entry: ExecutionHistoryEntry) => {
		setState((prev) => ({
			...prev,
			executionHistory: [entry, ...prev.executionHistory].slice(0, 50),
		}));
	}, []);

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

	const validateConfiguration = useCallback((): string[] => {
		const errors: string[] = [];

		if (state.mode === "layer_search") {
			const hasLayerSelection =
				state.selectedLayers.length > 0 || !!state.layerName.trim();
			if (!hasLayerSelection) {
				errors.push("Add at least one layer for layer search mode");
			}
		}

		if (!state.pointPrefix.trim()) {
			errors.push("Point prefix cannot be empty");
		}

		if (state.startNumber < 1) {
			errors.push("Start number must be at least 1");
		}

		if (state.decimalPlaces < 0 || state.decimalPlaces > 12) {
			errors.push("Decimal places must be between 0 and 12");
		}

		if (state.pointPrefix.length > 10) {
			errors.push("Point prefix must be 10 characters or less");
		}

		if (!Number.isFinite(state.refScale) || state.refScale <= 0) {
			errors.push("Scale must be greater than 0");
		}

		return errors;
	}, [
		state.mode,
		state.selectedLayers,
		state.layerName,
		state.pointPrefix,
		state.startNumber,
		state.decimalPlaces,
		state.refScale,
	]);

	const handleModeChange = (newMode: CoordinatesGrabberState["mode"]) => {
		if (newMode !== "layer_search") {
			addLog(
				`[INFO] '${newMode}' mode is not yet supported in this API flow. Staying on layer_search.`,
			);
			setState((prev) => ({ ...prev, mode: "layer_search" }));
			return;
		}
		setState((prev) => ({ ...prev, mode: newMode }));
		addLog(`Mode changed to: ${newMode}`);
	};

	const handleStyleChange = (style: "center" | "corners") => {
		setState((prev) => ({ ...prev, extractionStyle: style }));
		addLog(`Extraction style changed to: ${style}`);
	};

	const handleAddLayer = useCallback(() => {
		const layerToAdd = state.layerName.trim();
		if (!layerToAdd) {
			addLog("[WARNING] Select or enter a layer before adding");
			return;
		}
		setState((prev) => {
			if (prev.selectedLayers.includes(layerToAdd)) {
				return prev;
			}
			return { ...prev, selectedLayers: [...prev.selectedLayers, layerToAdd] };
		});
		addLog(`[INFO] Added layer: ${layerToAdd}`);
	}, [state.layerName, addLog]);

	const handleRemoveLayer = useCallback(
		(layerToRemove: string) => {
			setState((prev) => ({
				...prev,
				selectedLayers: prev.selectedLayers.filter(
					(layer) => layer !== layerToRemove,
				),
			}));
			addLog(`[INFO] Removed layer: ${layerToRemove}`);
		},
		[addLog],
	);

	const handleClearLayers = useCallback(() => {
		setState((prev) => ({ ...prev, selectedLayers: [] }));
		addLog("[INFO] Cleared selected layers");
	}, [addLog]);

	const handleLayerSearch = async () => {
		if (!backendConnected) {
			addLog("[ERROR] Not connected to AutoCAD backend");
			return;
		}

		hasAttemptedRunRef.current = true;

		const errors = validateConfiguration();
		if (errors.length > 0) {
			setState((prev) => ({ ...prev, validationErrors: errors }));
			errors.forEach((err) => addLog(`[VALIDATION] ${err}`));
			addLog("[ERROR] Configuration validation failed");
			return;
		}

		if (state.scanSelection) {
			try {
				const selectionCount = await coordinatesGrabberService.getSelectionCount();
				setState((prev) => ({ ...prev, selectionCount }));
				if (selectionCount <= 0 && !state.includeModelspace) {
					addLog(
						"[ERROR] Selection-only scan is enabled but no objects are selected. Select objects in AutoCAD first.",
					);
					return;
				}
				if (selectionCount <= 0 && state.includeModelspace) {
					addLog(
						"[WARNING] Selection scan enabled but no objects selected; proceeding with modelspace scan.",
					);
				} else {
					addLog(`[INFO] Selection preflight: ${selectionCount} objects selected`);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				if (!state.includeModelspace) {
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
			state.selectedLayers.length > 0
				? state.selectedLayers
				: state.layerName.trim()
					? [state.layerName.trim()]
					: [];

		addLog(
			`[PROCESSING] Starting layer search on ${layersToRun.length} layer(s): ${layersToRun.join(", ")}`,
		);
		addLog(
			`[PROCESSING] Style: ${state.extractionStyle === "corners" ? "4 corners" : "center point"}`,
		);
		addLog(`[INFO] Reference block scale: ${state.refScale}`);
		addLog(`[INFO] Point naming: ${state.pointPrefix}${state.startNumber}`);
		addLog(`[INFO] Precision: ${state.decimalPlaces} decimal places`);

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

			const result = await coordinatesGrabberService.execute({
				mode: state.mode,
				precision: state.decimalPlaces,
				prefix: state.pointPrefix,
				initial_number: state.startNumber,
				block_name_filter: "",
				layer_search_name: layersToRun.join(", "),
				layer_search_names: layersToRun,
				layer_search_use_selection: state.scanSelection,
				layer_search_include_modelspace: state.includeModelspace,
				layer_search_use_corners: state.extractionStyle === "corners",
				ref_dwg_path: "",
				ref_layer_name: "Coordinate Reference Point",
				ref_scale: state.refScale,
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
			}, { runId });

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
						mode: state.mode,
						layerName: layersToRun.join(", "),
						extractionStyle: state.extractionStyle,
						pointPrefix: state.pointPrefix,
						decimalPlaces: state.decimalPlaces,
					},
					success: true,
					pointsCreated,
					duration,
					filePath,
				};

				saveExecutionResult(historyEntry);

				const toNumber = (value: unknown): number => {
					if (typeof value === "number" && Number.isFinite(value)) return value;
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
							id: toText(point.id, `${state.pointPrefix}${state.startNumber}`),
							east: toNumber(point.east),
							north: toNumber(point.north),
							elevation: toNumber(point.elevation),
							layer: toText(point.layer),
						}))
					: Array.from({ length: pointsCreated }, (_, index) => ({
							id: `${state.pointPrefix}${state.startNumber + index}`,
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
						mode: state.mode,
						layerName: layersToRun.join(", "),
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
				config: { mode: state.mode },
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
				setTimeout(() => {
					setProgress(0);
					setProgressStage("");
				}, 600);
			}
		}
	};

	const downloadResult = useCallback(async () => {
		if (!state.excelPath) {
			addLog("[ERROR] No export file available to download");
			return;
		}
		try {
			addLog("[INFO] Initiating download...");
			const blob =
				await coordinatesGrabberService.downloadResultFile(state.excelPath);
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
	}, [state.excelPath, addLog]);

	const openResultLocation = useCallback(async () => {
		if (!state.excelPath) {
			addLog("[ERROR] No export path available");
			return;
		}
		try {
			const result = await coordinatesGrabberService.openExportFolder(
				state.excelPath,
			);
			addLog(`[SUCCESS] ${result.message}`);
		} catch (err) {
			addLog(
				`[ERROR] Could not open export folder: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	}, [state.excelPath, addLog]);

	const handleSelectionRefresh = async () => {
		try {
			const count = await coordinatesGrabberService.getSelectionCount();
			setState((prev) => ({ ...prev, selectionCount: count }));
			addLog(`[INFO] Selection: ${count} entities selected`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			addLog(`[WARNING] Could not get selection count: ${message}`);
		}
	};

	const reconnectLiveStream = useCallback(async () => {
		try {
			coordinatesGrabberService.disconnect();
			await coordinatesGrabberService.connectWebSocket();
			setWsConnected(true);
			setLastWsEventAt(Date.now());
			addLog("[INFO] Reconnected WebSocket live stream");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setWsConnected(false);
			addLog(`[WARNING] WebSocket reconnect failed: ${message}`);
		}
	}, [addLog]);

	useEffect(() => {
		const errors = validateConfiguration();
		if (hasAttemptedRunRef.current) {
			setState((prev) => ({ ...prev, validationErrors: errors }));
		} else {
			setState((prev) => ({ ...prev, validationErrors: [] }));
		}
	}, [validateConfiguration]);

	useEffect(() => {
		let mounted = true;

		coordinatesGrabberService.connectWebSocket().catch(() => {
			if (!mounted) return;
			setWsConnected(false);
		});

		const unsubscribeConnected = coordinatesGrabberService.on(
			"connected",
			(event) => {
				if (!mounted || event.type !== "connected") return;
				setWsConnected(true);
				setLastWsEventAt(Date.now());
			},
		);

		const unsubscribeStatus = coordinatesGrabberService.on(
			"status",
			(event) => {
				if (!mounted || event.type !== "status") return;
				setWsConnected(true);
				setLiveBackendStatus({
					autocadRunning: event.autocad_running,
					drawingOpen: event.drawing_open,
					drawingName:
						typeof event.drawing_name === "string" ? event.drawing_name : null,
					error: typeof event.error === "string" ? event.error : null,
					lastUpdated: Date.now(),
				});
				setLastWsEventAt(Date.now());
			},
		);

		const unsubscribeDisconnected = coordinatesGrabberService.on(
			"service-disconnected",
			() => {
				if (!mounted) return;
				setWsConnected(false);
			},
		);

		const unsubscribeError = coordinatesGrabberService.on("error", () => {
			if (!mounted) return;
			setWsConnected(false);
		});

		const unsubscribeProgress = coordinatesGrabberService.on("progress", (event) => {
			if (!mounted || event.type !== "progress") return;
			const activeRunId = activeRunIdRef.current;
			const eventRunId = event.run_id ? String(event.run_id) : null;
			if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
			const next = Math.max(0, Math.min(100, Math.round(event.progress)));
			setProgress(next);
			setProgressStage(event.stage);
			setLastWsEventAt(Date.now());
		});

		const unsubscribeComplete = coordinatesGrabberService.on("complete", (event) => {
			if (!mounted || event.type !== "complete") return;
			const activeRunId = activeRunIdRef.current;
			const eventRunId = event.run_id ? String(event.run_id) : null;
			if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
			finishProgress();
		});

		const unsubscribeWsError = coordinatesGrabberService.on("error", (event) => {
			if (!mounted || event.type !== "error") return;
			const activeRunId = activeRunIdRef.current;
			const eventRunId = event.run_id ? String(event.run_id) : null;
			if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
			finishProgress();
		});

		return () => {
			mounted = false;
			unsubscribeConnected();
			unsubscribeStatus();
			unsubscribeDisconnected();
			unsubscribeError();
			unsubscribeProgress();
			unsubscribeComplete();
			unsubscribeWsError();
		};
	}, [finishProgress]);

	useEffect(() => {
		const interval = setInterval(() => {
			if (coordinatesGrabberService.isConnected()) return;
			coordinatesGrabberService.connectWebSocket().catch(() => {
				// Service handles retry/backoff internally.
			});
		}, 10000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		return () => {
			if (progressIntervalRef.current) {
				clearInterval(progressIntervalRef.current);
			}
		};
	}, []);

	const liveStatusStamp = liveBackendStatus.lastUpdated
		? new Date(liveBackendStatus.lastUpdated).toLocaleTimeString()
		: "--";
	const wsLastEventStamp = lastWsEventAt
		? new Date(lastWsEventAt).toLocaleTimeString()
		: "--";

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
		progress,
		refreshLayers,
		setState,
		state,
		wsLastEventStamp,
		wsConnected,
	};
}
