import { Loader } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressBar } from "@/data/ProgressBar";
import { coordinatesGrabberService } from "@/Ground-Grid-Generation/coordinatesGrabberService";
import { hexToRgba, useTheme } from "@/lib/palette";
import { CoordinateYamlViewer } from "./coordinates/CoordinateYamlViewer";
import type { CoordinatePoint } from "./coordinates/types";
import { useGroundGrid } from "./ground-grid/GroundGridContext";

interface CoordinatesGrabberState {
	mode: "polylines" | "blocks" | "layer_search";
	layerName: string;
	selectedLayers: string[];
	extractionStyle: "center" | "corners";
	refScale: number;
	pointPrefix: string;
	startNumber: number;
	decimalPlaces: number;
	scanSelection: boolean;
	includeModelspace: boolean;
	activeTab: "config" | "export" | "history" | "yaml";
	excelPath: string;
	isRunning: boolean;
	selectionCount: number;
	executionHistory: ExecutionHistoryEntry[];
	validationErrors: string[];
	performanceMetrics?: PerformanceMetrics;
	coordinateData: CoordinatePoint[];
}

interface ExecutionHistoryEntry {
	timestamp: number;
	config: Partial<CoordinatesGrabberState>;
	success: boolean;
	pointsCreated?: number;
	duration: number;
	fileSize?: number;
	filePath?: string;
	message?: string;
}

interface PerformanceMetrics {
	startTime: number;
	endTime?: number;
	duration: number;
	pointsCreated: number;
	geometriesProcessed: number;
	fileSize: number;
	pointsPerSecond: number;
}

const DEFAULT_STATE: CoordinatesGrabberState = {
	mode: "layer_search",
	layerName: "",
	selectedLayers: [],
	extractionStyle: "center",
	refScale: 1,
	pointPrefix: "P",
	startNumber: 1,
	decimalPlaces: 3,
	scanSelection: false,
	includeModelspace: true,
	activeTab: "config",
	excelPath: "",
	isRunning: false,
	selectionCount: 0,
	executionHistory: [],
	validationErrors: [],
	coordinateData: [],
};

export function CoordinatesGrabber() {
	const { palette } = useTheme();
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
	const [liveBackendStatus, setLiveBackendStatus] = useState<{
		autocadRunning: boolean;
		drawingOpen: boolean;
		drawingName: string | null;
		error: string | null;
		lastUpdated: number | null;
	}>({
		autocadRunning: false,
		drawingOpen: false,
		drawingName: null,
		error: null,
		lastUpdated: null,
	});
	const [_hoveredTooltip, _setHoveredTooltip] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const startProgressSimulation = useCallback(() => {
		setProgress(5);
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
		setTimeout(() => setProgress(0), 600);
	}, []);

	const addLog = useCallback(
		(message: string) => {
			ctxAddLog("grabber", message);
		},
		[ctxAddLog],
	);

	const hasAttemptedRunRef = useRef(false);

	const handleModeChange = (newMode: CoordinatesGrabberState["mode"]) => {
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

		// Mark that user has attempted a run
		hasAttemptedRunRef.current = true;

		// Check for validation errors
		const errors = validateConfiguration();
		if (errors.length > 0) {
			setState((prev) => ({ ...prev, validationErrors: errors }));
			errors.forEach((err) => addLog(`[VALIDATION] ${err}`));
			addLog("[ERROR] Configuration validation failed");
			return;
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
			startProgressSimulation();

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
			});

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
					? result.points.map((p) => ({
							id: toText(p.id, `${state.pointPrefix}${state.startNumber}`),
							east: toNumber(p.east),
							north: toNumber(p.north),
							elevation: toNumber(p.elevation),
							layer: toText(p.layer),
						}))
					: Array.from({ length: pointsCreated }, (_, i) => ({
							id: `${state.pointPrefix}${state.startNumber + i}`,
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
				// Log failed execution
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

			// Save failed execution
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
			finishProgress();
		}
	};

	// Validate configuration (returns errors without setting state)
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

	// Update validation errors reactively, but only show in UI after first run attempt
	useEffect(() => {
		const errors = validateConfiguration();
		// Always update for button disable logic, but only surface in UI after user has tried to run
		if (hasAttemptedRunRef.current) {
			setState((prev) => ({ ...prev, validationErrors: errors }));
		} else {
			// Keep internal tracking for button disable, but don't show error box
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

		return () => {
			mounted = false;
			unsubscribeConnected();
			unsubscribeStatus();
			unsubscribeDisconnected();
			unsubscribeError();
		};
	}, []);

	// Save execution result to history
	const saveExecutionResult = useCallback((entry: ExecutionHistoryEntry) => {
		setState((prev) => ({
			...prev,
			executionHistory: [entry, ...prev.executionHistory].slice(0, 50), // Keep last 50
		}));
	}, []);

	// Calculate performance metrics
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
				geometriesProcessed: 0, // Would be populated by backend
				fileSize,
				pointsPerSecond: Math.round((pointsCreated / duration) * 100) / 100,
			};
		},
		[],
	);

	// Download result file
	const downloadResult = useCallback(async () => {
		if (!state.excelPath) {
			addLog("[ERROR] No export file available to download");
			return;
		}
		try {
			addLog("[INFO] Initiating download...");
			const response = await fetch(
				`/api/download-result?path=${encodeURIComponent(state.excelPath)}`,
			);
			if (response.ok) {
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `coordinates_${Date.now()}.xlsx`;
				link.click();
				window.URL.revokeObjectURL(url);
				addLog("[SUCCESS] File downloaded successfully");
			} else {
				addLog("[ERROR] Failed to download file");
			}
		} catch (err) {
			addLog(
				`[ERROR] Download failed: ${err instanceof Error ? err.message : "Unknown error"}`,
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

	const liveStatusStamp = liveBackendStatus.lastUpdated
		? new Date(liveBackendStatus.lastUpdated).toLocaleTimeString()
		: "--";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				padding: "16px",
				gap: "12px",
				overflow: "auto",
				background: palette.background,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					paddingBottom: "12px",
					borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
				}}
			>
				<div>
					<h1
						style={{
							margin: "0 0 4px 0",
							fontSize: "20px",
							fontWeight: "600",
							color: palette.text,
						}}
					>
						Coordinates Grabber
					</h1>
					<p
						style={{
							margin: "0",
							fontSize: "12px",
							color: palette.textMuted,
						}}
					>
						Extract coordinate points from CAD drawings
					</p>
				</div>
				<div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
					{/* Preset button */}
					<div
						title="Coming soon: Presets"
						style={{
							padding: "6px 8px",
							borderRadius: "4px",
							border: "1px dashed " + hexToRgba(palette.primary, 0.3),
							background: hexToRgba(palette.primary, 0.05),
							color: palette.textMuted,
							fontSize: "11px",
							cursor: "not-allowed",
							opacity: 0.5,
						}}
					>
						Presets (coming soon)
					</div>
					<div
						style={{
							fontSize: "24px",
							fontWeight: "700",
							color: palette.primary,
							opacity: 0.7,
							marginLeft: "8px",
						}}
					>
						📍
					</div>
				</div>
			</div>

			{/* Tabs */}
			<div
				style={{
					display: "flex",
					gap: "8px",
					borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
				}}
			>
				{(["config", "export", "history", "yaml"] as const).map((tab) => (
					<button
						key={tab}
						onClick={() => setState((prev) => ({ ...prev, activeTab: tab }))}
						style={{
							padding: "8px 12px",
							border: "none",
							background: "none",
							color:
								state.activeTab === tab ? palette.primary : palette.textMuted,
							fontSize: "13px",
							fontWeight: state.activeTab === tab ? "600" : "400",
							cursor: "pointer",
							borderBottom:
								state.activeTab === tab
									? `2px solid ${palette.primary}`
									: "none",
							transition: "all 0.2s",
							whiteSpace: "nowrap",
						}}
					>
						{tab === "config" && "Config"}
						{tab === "export" && "Export"}
						{tab === "history" && `History (${state.executionHistory.length})`}
						{tab === "yaml" && "YAML"}
					</button>
				))}
			</div>

			{/* Configuration Tab */}
			{state.activeTab === "config" && (
				<div style={{ flex: 1, overflow: "auto" }}>
					<div
						style={{ display: "flex", flexDirection: "column", gap: "16px" }}
					>
						{/* Validation Errors */}
						{state.validationErrors.length > 0 && (
							<div
								style={{
									padding: "12px",
									borderRadius: "8px",
									background: hexToRgba("#ff6b6b", 0.1),
									border: `1px solid ${hexToRgba("#ff6b6b", 0.3)}`,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "8px",
										marginBottom: "8px",
									}}
								>
									<span style={{ fontSize: "14px", color: "#ff6b6b" }}>⚠️</span>
									<span
										style={{
											color: "#ff6b6b",
											fontSize: "12px",
											fontWeight: "600",
										}}
									>
										Validation Errors
									</span>
								</div>
								<ul
									style={{
										margin: "0",
										paddingLeft: "20px",
										color: "#ff6b6b",
										fontSize: "11px",
									}}
								>
									{state.validationErrors.map((err, idx) => (
										<li key={idx}>{err}</li>
									))}
								</ul>
							</div>
						)}

						{/* Mode Selection */}
						<div
							style={{
								padding: "12px",
								borderRadius: "8px",
								background: hexToRgba(palette.surface, 0.5),
								border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							}}
						>
							<h3
								style={{
									margin: "0 0 12px 0",
									fontSize: "13px",
									fontWeight: "600",
									color: palette.text,
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								Extraction Mode
							</h3>
							<div
								style={{ display: "flex", flexDirection: "column", gap: "8px" }}
							>
								{["polylines", "blocks", "layer_search"].map((mode) => (
									<label
										key={mode}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "8px",
											cursor: "pointer",
											fontSize: "13px",
										}}
									>
										<input
											type="radio"
											name="mode"
											value={mode}
											checked={state.mode === mode}
											onChange={() =>
												handleModeChange(mode as typeof state.mode)
											}
											style={{ cursor: "pointer" }}
										/>
										<span
											style={{
												color:
													state.mode === mode ? palette.primary : palette.text,
											}}
										>
											{mode === "polylines" && "Polyline Vertices"}
											{mode === "blocks" && "Block Centers"}
											{mode === "layer_search" && "Layer Search"}
										</span>
									</label>
								))}
							</div>
						</div>

						{/* Layer Search Options (when layer_search mode) */}
						{state.mode === "layer_search" && (
							<>
								<div
									style={{
										padding: "12px",
										borderRadius: "8px",
										background: hexToRgba(palette.surface, 0.5),
										border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
									}}
								>
									<h3
										style={{
											margin: "0 0 12px 0",
											fontSize: "13px",
											fontWeight: "600",
											color: palette.text,
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										Layer Configuration
									</h3>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
									>
										<div>
											<label
												style={{
													fontSize: "12px",
													color: palette.textMuted,
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
												}}
											>
												<span>Layer Name:</span>
												<button
													onClick={async () => {
														addLog(
															"[INFO] Refreshing layer list from AutoCAD...",
														);
														const layers = await refreshLayers();
														if (layers.length > 0) {
															addLog(`[SUCCESS] Found ${layers.length} layers`);
														} else {
															addLog("[WARNING] No layers found");
														}
													}}
													style={{
														padding: "4px 8px",
														borderRadius: "3px",
														border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
														background: hexToRgba(palette.primary, 0.1),
														color: palette.primary,
														fontSize: "11px",
														cursor: "pointer",
														fontWeight: "500",
													}}
												>
													🔄 Refresh
												</button>
											</label>
											{availableLayers.length > 0 ? (
												<select
													value={state.layerName}
													onChange={(e) =>
														setState((prev) => ({
															...prev,
															layerName: e.target.value,
														}))
													}
													style={{
														marginTop: "4px",
														width: "100%",
														padding: "8px",
														borderRadius: "4px",
														border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
														background: hexToRgba(palette.background, 0.8),
														color: palette.text,
														fontSize: "12px",
														boxSizing: "border-box",
													}}
												>
													<option value="">-- Select a layer --</option>
													{availableLayers.map((layer) => (
														<option key={layer} value={layer}>
															{layer}
														</option>
													))}
												</select>
											) : (
												<input
													type="text"
													placeholder="No layers found. Type layer name or click Refresh..."
													value={state.layerName}
													onChange={(e) =>
														setState((prev) => ({
															...prev,
															layerName: e.target.value,
														}))
													}
													style={{
														marginTop: "4px",
														width: "100%",
														padding: "8px",
														borderRadius: "4px",
														border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
														background: hexToRgba(palette.background, 0.8),
														color: palette.text,
														fontSize: "12px",
														boxSizing: "border-box",
													}}
												/>
											)}
											<div
												style={{
													display: "flex",
													gap: "8px",
													marginTop: "8px",
													flexWrap: "wrap",
												}}
											>
												<button
													type="button"
													onClick={handleAddLayer}
													style={{
														padding: "6px 10px",
														borderRadius: "4px",
														border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
														background: hexToRgba(palette.primary, 0.1),
														color: palette.primary,
														fontSize: "11px",
														fontWeight: "600",
														cursor: "pointer",
													}}
												>
													+ Add Layer
												</button>
												<button
													type="button"
													onClick={handleClearLayers}
													disabled={state.selectedLayers.length === 0}
													style={{
														padding: "6px 10px",
														borderRadius: "4px",
														border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
														background: "transparent",
														color:
															state.selectedLayers.length === 0
																? palette.textMuted
																: palette.text,
														fontSize: "11px",
														fontWeight: "600",
														cursor:
															state.selectedLayers.length === 0
																? "not-allowed"
																: "pointer",
													}}
												>
													Clear Layers
												</button>
											</div>
											<div
												style={{
													marginTop: "8px",
													display: "flex",
													flexDirection: "column",
													gap: "6px",
												}}
											>
												{state.selectedLayers.length === 0 ? (
													<div
														style={{
															fontSize: "11px",
															color: palette.textMuted,
														}}
													>
														No layers added yet. Add one or more layers to run
														together.
													</div>
												) : (
													state.selectedLayers.map((layer) => (
														<div
															key={layer}
															style={{
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																padding: "6px 8px",
																borderRadius: "4px",
																background: hexToRgba(palette.primary, 0.08),
																border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
																fontSize: "11px",
															}}
														>
															<span style={{ color: palette.text }}>
																{layer}
															</span>
															<button
																type="button"
																onClick={() => handleRemoveLayer(layer)}
																style={{
																	border: "none",
																	background: "transparent",
																	color: palette.textMuted,
																	cursor: "pointer",
																	fontSize: "12px",
																}}
															>
																✕
															</button>
														</div>
													))
												)}
											</div>
										</div>
									</div>
								</div>

								<div
									style={{
										padding: "12px",
										borderRadius: "8px",
										background: hexToRgba(palette.surface, 0.5),
										border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
									}}
								>
									<h3
										style={{
											margin: "0 0 12px 0",
											fontSize: "13px",
											fontWeight: "600",
											color: palette.text,
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										Reference Point Style
									</h3>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
									>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: "8px",
												cursor: "pointer",
												fontSize: "13px",
											}}
										>
											<input
												type="radio"
												name="style"
												value="center"
												checked={state.extractionStyle === "center"}
												onChange={() => handleStyleChange("center")}
												style={{ cursor: "pointer" }}
											/>
											<span
												style={{
													color:
														state.extractionStyle === "center"
															? palette.primary
															: palette.text,
												}}
											>
												Single block at geometry center
											</span>
										</label>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: "8px",
												cursor: "pointer",
												fontSize: "13px",
											}}
										>
											<input
												type="radio"
												name="style"
												value="corners"
												checked={state.extractionStyle === "corners"}
												onChange={() => handleStyleChange("corners")}
												style={{ cursor: "pointer" }}
											/>
											<span
												style={{
													color:
														state.extractionStyle === "corners"
															? palette.primary
															: palette.text,
												}}
											>
												Four blocks at geometry corners (NW, NE, SW, SE)
											</span>
										</label>
									</div>
								</div>

								<div
									style={{
										padding: "12px",
										borderRadius: "8px",
										background: hexToRgba(palette.surface, 0.5),
										border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
									}}
								>
									<h3
										style={{
											margin: "0 0 12px 0",
											fontSize: "13px",
											fontWeight: "600",
											color: palette.text,
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										Scan Options
									</h3>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: "8px",
										}}
									>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: "8px",
												cursor: "pointer",
												fontSize: "13px",
											}}
										>
											<input
												type="checkbox"
												checked={state.scanSelection}
												onChange={(e) =>
													setState((prev) => ({
														...prev,
														scanSelection: e.target.checked,
													}))
												}
												style={{ cursor: "pointer" }}
											/>
											<span style={{ color: palette.text }}>
												Scan selected entities only
											</span>
										</label>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: "8px",
												cursor: "pointer",
												fontSize: "13px",
											}}
										>
											<input
												type="checkbox"
												checked={state.includeModelspace}
												onChange={(e) =>
													setState((prev) => ({
														...prev,
														includeModelspace: e.target.checked,
													}))
												}
												style={{ cursor: "pointer" }}
											/>
											<span style={{ color: palette.text }}>
												Include ModelSpace geometry (outside blocks)
											</span>
										</label>
									</div>
								</div>

								<div
									style={{
										padding: "12px",
										borderRadius: "8px",
										background: hexToRgba(palette.surface, 0.5),
										border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
									}}
								>
									<h3
										style={{
											margin: "0 0 12px 0",
											fontSize: "13px",
											fontWeight: "600",
											color: palette.text,
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										Reference Block
									</h3>
									<label style={{ fontSize: "12px", color: palette.textMuted }}>
										Scale:
									</label>
									<input
										type="number"
										value={state.refScale}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												refScale: Number(e.target.value) || 1,
											}))
										}
										min="0.0001"
										step="0.1"
										style={{
											marginTop: "4px",
											width: "100%",
											padding: "8px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
											background: hexToRgba(palette.background, 0.8),
											color: palette.text,
											fontSize: "12px",
											boxSizing: "border-box",
										}}
									/>
								</div>
							</>
						)}

						{/* Point Naming Options */}
						<div
							style={{
								padding: "12px",
								borderRadius: "8px",
								background: hexToRgba(palette.surface, 0.5),
								border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							}}
						>
							<h3
								style={{
									margin: "0 0 12px 0",
									fontSize: "13px",
									fontWeight: "600",
									color: palette.text,
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								Point Naming
							</h3>
							<div style={{ display: "flex", gap: "8px" }}>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: "12px", color: palette.textMuted }}>
										Prefix:
									</label>
									<input
										type="text"
										value={state.pointPrefix}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												pointPrefix: e.target.value,
											}))
										}
										style={{
											marginTop: "4px",
											width: "100%",
											padding: "8px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
											background: hexToRgba(palette.background, 0.8),
											color: palette.text,
											fontSize: "12px",
											boxSizing: "border-box",
										}}
									/>
								</div>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: "12px", color: palette.textMuted }}>
										Start #:
									</label>
									<input
										type="number"
										value={state.startNumber}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												startNumber: parseInt(e.target.value) || 1,
											}))
										}
										min="1"
										style={{
											marginTop: "4px",
											width: "100%",
											padding: "8px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
											background: hexToRgba(palette.background, 0.8),
											color: palette.text,
											fontSize: "12px",
											boxSizing: "border-box",
										}}
									/>
								</div>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: "12px", color: palette.textMuted }}>
										Decimals:
									</label>
									<input
										type="number"
										value={state.decimalPlaces}
										onChange={(e) =>
											setState((prev) => ({
												...prev,
												decimalPlaces: parseInt(e.target.value) || 3,
											}))
										}
										min="0"
										max="12"
										style={{
											marginTop: "4px",
											width: "100%",
											padding: "8px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
											background: hexToRgba(palette.background, 0.8),
											color: palette.text,
											fontSize: "12px",
											boxSizing: "border-box",
										}}
									/>
								</div>
							</div>
						</div>

						{state.isRunning && (
							<div
								style={{ display: "flex", flexDirection: "column", gap: "8px" }}
							>
								<div
									style={{ display: "flex", alignItems: "center", gap: "8px" }}
								>
									<Loader
										size={14}
										className="animate-spin"
										style={{ color: palette.primary }}
									/>
									<span
										style={{
											fontSize: "12px",
											color: palette.textMuted,
											fontWeight: 500,
										}}
									>
										{progress < 30
											? "Scanning layers..."
											: progress < 60
												? "Extracting vertices..."
												: progress < 90
													? "Building Excel..."
													: "Finalizing..."}
									</span>
								</div>
								<ProgressBar progress={progress} />
							</div>
						)}
						<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
							<button
								onClick={handleLayerSearch}
								disabled={state.isRunning || !backendConnected}
								style={{
									flex: 1,
									minWidth: "120px",
									padding: "10px 16px",
									borderRadius: "6px",
									border: "none",
									background: backendConnected
										? palette.primary
										: palette.textMuted,
									color: backendConnected
										? palette.background
										: "rgba(255,255,255,0.5)",
									fontWeight: "600",
									fontSize: "13px",
									cursor:
										backendConnected && !state.isRunning
											? "pointer"
											: "not-allowed",
									opacity: state.isRunning ? 0.6 : 1,
									transition: "opacity 0.2s",
								}}
								onMouseEnter={(e) => {
									if (!state.isRunning && backendConnected) {
										(e.currentTarget as HTMLButtonElement).style.opacity =
											"0.9";
									}
								}}
								onMouseLeave={(e) => {
									if (!state.isRunning && backendConnected) {
										(e.currentTarget as HTMLButtonElement).style.opacity = "1";
									}
								}}
							>
								{state.isRunning ? "⏳ Running..." : "▶ Run Layer Search"}
							</button>
							{state.mode === "blocks" && (
								<button
									onClick={handleSelectionRefresh}
									disabled={!backendConnected}
									style={{
										padding: "10px 16px",
										borderRadius: "6px",
										border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
										background: "transparent",
										color: backendConnected
											? palette.primary
											: palette.textMuted,
										fontWeight: "600",
										fontSize: "13px",
										cursor: backendConnected ? "pointer" : "not-allowed",
									}}
								>
									🔄 Refresh
								</button>
							)}
						</div>

						{/* Backend Status */}
						<div
							style={{
								padding: backendConnected ? "8px 12px" : "12px",
								borderRadius: "6px",
								background: backendConnected
									? hexToRgba("#51cf66", 0.1)
									: hexToRgba("#ffa94d", 0.06),
								border: `1px solid ${
									backendConnected
										? hexToRgba("#51cf66", 0.3)
										: hexToRgba("#ffa94d", 0.2)
								}`,
								fontSize: "11px",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: "8px",
									marginBottom: backendConnected ? "6px" : "10px",
								}}
							>
								<span style={{ color: palette.textMuted, fontSize: "10px" }}>
									WebSocket stream
								</span>
								<span
									style={{
										color: wsConnected ? "#51cf66" : "#ffa94d",
										fontSize: "10px",
										fontWeight: 600,
									}}
								>
									{wsConnected ? "● LIVE" : "○ OFFLINE"}
								</span>
							</div>
							{backendConnected ? (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "4px",
									}}
								>
									<span style={{ color: "#51cf66" }}>
										● Connected to AutoCAD
									</span>
									<span style={{ color: palette.textMuted, fontSize: "10px" }}>
										Drawing:{" "}
										{liveBackendStatus.drawingOpen
											? (liveBackendStatus.drawingName ?? "Open")
											: "No drawing open"}
									</span>
									<span style={{ color: palette.textMuted, fontSize: "10px" }}>
										Last live update: {liveStatusStamp}
									</span>
								</div>
							) : (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "10px",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "6px",
										}}
									>
										<span style={{ color: "#ffa94d" }}>
											○ Backend not detected
										</span>
										<span
											style={{ color: palette.textMuted, fontSize: "10px" }}
										>
											(live stream + 10s polling fallback)
										</span>
									</div>
									{liveBackendStatus.error ? (
										<div style={{ color: "#ffa94d", fontSize: "10px" }}>
											Last backend error: {liveBackendStatus.error}
										</div>
									) : null}
									<div
										style={{
											color: palette.textMuted,
											fontSize: "11px",
											lineHeight: "1.6",
										}}
									>
										<div
											style={{
												fontWeight: "600",
												color: palette.text,
												marginBottom: "6px",
												fontSize: "12px",
											}}
										>
											How to start the backend:
										</div>
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: "8px",
											}}
										>
											<div>
												<span
													style={{ color: palette.text, fontWeight: "500" }}
												>
													Option 1
												</span>
												<span style={{ color: palette.textMuted }}>
													{" "}
													-- From the project folder, run:
												</span>
												<div
													onClick={() => {
														navigator.clipboard.writeText(
															"npm run backend:coords",
														);
														addLog(
															"[INFO] Copied startup command to clipboard",
														);
													}}
													style={{
														marginTop: "4px",
														padding: "6px 10px",
														borderRadius: "4px",
														background: hexToRgba(palette.background, 0.8),
														border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
														fontFamily: "monospace",
														fontSize: "11px",
														color: palette.primary,
														cursor: "pointer",
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
													}}
												>
													<span>npm run backend:coords</span>
													<span
														style={{
															fontSize: "10px",
															color: palette.textMuted,
														}}
													>
														click to copy
													</span>
												</div>
											</div>
											<div>
												<span
													style={{ color: palette.text, fontWeight: "500" }}
												>
													Option 2
												</span>
												<span style={{ color: palette.textMuted }}>
													{" "}
													-- Double-click{" "}
												</span>
												<code
													style={{
														padding: "1px 5px",
														borderRadius: "3px",
														background: hexToRgba(palette.background, 0.8),
														border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
														fontFamily: "monospace",
														fontSize: "10px",
														color: palette.text,
													}}
												>
													start_api_server.bat
												</code>
											</div>
											<div
												style={{
													fontSize: "10px",
													color: palette.textMuted,
													borderTop: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
													paddingTop: "6px",
												}}
											>
												Requires: Python 3.9+, AutoCAD, and Windows
											</div>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Export Tab */}
			{state.activeTab === "export" && (
				<div style={{ flex: 1, overflow: "auto" }}>
					<div
						style={{ display: "flex", flexDirection: "column", gap: "16px" }}
					>
						<div
							style={{
								padding: "12px",
								borderRadius: "8px",
								background: hexToRgba(palette.surface, 0.5),
								border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							}}
						>
							<h3
								style={{
									margin: "0 0 12px 0",
									fontSize: "13px",
									fontWeight: "600",
									color: palette.text,
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								Excel Export
							</h3>
							{state.excelPath ? (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "8px",
									}}
								>
									<div
										style={{
											padding: "8px 12px",
											borderRadius: "4px",
											background: hexToRgba("#51cf66", 0.1),
											border: `1px solid ${hexToRgba("#51cf66", 0.3)}`,
											color: "#51cf66",
											fontSize: "12px",
											fontWeight: "500",
										}}
									>
										✓ {state.excelPath}
									</div>
									<button
										style={{
											padding: "8px 12px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
											background: hexToRgba(palette.primary, 0.1),
											color: palette.primary,
											fontSize: "12px",
											fontWeight: "500",
											cursor: "pointer",
										}}
									>
										📂 Open Export Location
									</button>
									<button
										onClick={downloadResult}
										style={{
											padding: "8px 12px",
											borderRadius: "4px",
											border: `1px solid ${hexToRgba("#4dabf7", 0.3)}`,
											background: hexToRgba("#4dabf7", 0.1),
											color: "#4dabf7",
											fontSize: "12px",
											fontWeight: "500",
											cursor: "pointer",
										}}
									>
										⬇️ Download Excel
									</button>
								</div>
							) : (
								<p
									style={{
										margin: "0",
										color: palette.textMuted,
										fontSize: "12px",
									}}
								>
									No export yet. Run layer search to generate Excel file.
								</p>
							)}
						</div>

						<div
							style={{
								padding: "12px",
								borderRadius: "8px",
								background: hexToRgba(palette.surface, 0.5),
								border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							}}
						>
							<h3
								style={{
									margin: "0 0 12px 0",
									fontSize: "13px",
									fontWeight: "600",
									color: palette.text,
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								Output Format
							</h3>
							<p
								style={{
									margin: "0 0 8px 0",
									color: palette.textMuted,
									fontSize: "12px",
								}}
							>
								Excel table format with the following columns:
							</p>
							<ul
								style={{
									margin: "0",
									paddingLeft: "20px",
									color: palette.text,
									fontSize: "12px",
								}}
							>
								<li>Point ID</li>
								<li>East (X)</li>
								<li>North (Y)</li>
								<li>Elevation (Z)</li>
								<li>Layer</li>
							</ul>
						</div>
					</div>
				</div>
			)}

			{/* YAML Tab */}
			{state.activeTab === "yaml" && (
				<div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
					<CoordinateYamlViewer data={state.coordinateData} />
				</div>
			)}

			{/* History Tab */}
			{state.activeTab === "history" && (
				<div
					style={{
						flex: 1,
						overflow: "auto",
						display: "flex",
						flexDirection: "column",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
							padding: "12px",
						}}
					>
						{state.performanceMetrics && (
							<div
								style={{
									padding: "12px",
									borderRadius: "8px",
									background: hexToRgba(palette.primary, 0.1),
									border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
								}}
							>
								<h3
									style={{
										margin: "0 0 8px 0",
										fontSize: "13px",
										fontWeight: "600",
										color: palette.text,
										textTransform: "uppercase",
										letterSpacing: "0.5px",
									}}
								>
									Latest Metrics
								</h3>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: "8px",
										fontSize: "12px",
										color: palette.textMuted,
									}}
								>
									<div>
										Points:{" "}
										<strong>{state.performanceMetrics.pointsCreated}</strong>
									</div>
									<div>
										Duration:{" "}
										<strong>
											{state.performanceMetrics.duration.toFixed(2)}s
										</strong>
									</div>
									<div>
										Rate:{" "}
										<strong>{state.performanceMetrics.pointsPerSecond}</strong>
										/s
									</div>
									<div>
										Time:{" "}
										<strong>
											{new Date(
												state.performanceMetrics.startTime,
											).toLocaleTimeString()}
										</strong>
									</div>
								</div>
							</div>
						)}

						{state.executionHistory.length === 0 ? (
							<p
								style={{
									color: palette.textMuted,
									fontSize: "12px",
									textAlign: "center",
									margin: "20px 0",
								}}
							>
								No execution history yet. Run a search to see results here.
							</p>
						) : (
							state.executionHistory.map((entry, idx) => (
								<div
									key={idx}
									style={{
										padding: "12px",
										borderRadius: "8px",
										background: entry.success
											? hexToRgba("#51cf66", 0.05)
											: hexToRgba("#ff6b6b", 0.05),
										border: `1px solid ${
											entry.success
												? hexToRgba("#51cf66", 0.2)
												: hexToRgba("#ff6b6b", 0.2)
										}`,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "8px",
											marginBottom: "8px",
										}}
									>
										<span
											style={{
												fontSize: "14px",
												color: entry.success ? "#51cf66" : "#ff6b6b",
											}}
										>
											{entry.success ? "✓" : "✗"}
										</span>
										<span
											style={{
												color: palette.text,
												fontSize: "12px",
												fontWeight: "600",
											}}
										>
											{entry.config.layerName || entry.config.mode}
										</span>
										<span
											style={{
												color: palette.textMuted,
												fontSize: "11px",
												marginLeft: "auto",
											}}
										>
											{new Date(entry.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<div
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr",
											gap: "8px",
											fontSize: "11px",
											color: palette.textMuted,
										}}
									>
										<div>Extracted: {entry.pointsCreated || "-"}</div>
										<div>Duration: {entry.duration.toFixed(2)}s</div>
									</div>
									{entry.message && !entry.success && (
										<div
											style={{
												marginTop: "8px",
												fontSize: "11px",
												color: "#ff6b6b",
												fontStyle: "italic",
											}}
										>
											{entry.message}
										</div>
									)}
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
