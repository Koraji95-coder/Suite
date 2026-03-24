import {
	CheckCircle2,
	CircleDashed,
	CircleDot,
	Download,
	FileSpreadsheet,
	Link2,
	Loader2,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { Progress } from "@/components/primitives/Progress";
import { cn } from "@/lib/utils";
import styles from "./CoordinatesGrabber.module.css";
import { CoordinateYamlViewer } from "./CoordinateYamlViewer";
import { useCoordinatesGrabberState } from "./useCoordinatesGrabberState";
import type { CadRuntimeLogSource } from "../cad-runtime/useCadRuntimeBackendBridge";

function getProgressLabel(stage: string, pct: number): string {
	switch (stage) {
		case "initializing":
			return "Initializing AutoCAD connection...";
		case "preparing":
			return "Preparing extraction...";
		case "scanning":
			return "Scanning entities...";
		case "inserting_blocks":
			return "Inserting blocks and labels...";
		case "exporting_excel":
			return "Exporting Excel...";
		case "completed":
			return "Finalizing run...";
		case "failed":
			return "Run failed";
		default:
			return pct < 30
				? "Scanning layers..."
				: pct < 60
					? "Extracting vertices..."
					: pct < 90
						? "Building Excel..."
						: "Finalizing run...";
	}
}

function formatSignedInteger(value: number): string {
	if (value > 0) return `+${value}`;
	if (value < 0) return `${value}`;
	return "0";
}

function formatSignedSeconds(value: number): string {
	if (value > 0) return `+${value.toFixed(2)}s`;
	if (value < 0) return `-${Math.abs(value).toFixed(2)}s`;
	return "0.00s";
}

function StepCard({
	title,
	description,
	status,
}: {
	title: string;
	description: string;
	status: "pending" | "active" | "complete";
}) {
	const Icon =
		status === "complete"
			? CheckCircle2
			: status === "active"
				? CircleDot
				: CircleDashed;
	return (
		<div className={cn(styles.stepCard, styles[`step${status}`])}>
			<div className={styles.stepIconWrap}>
				<Icon size={14} className={styles.stepIcon} />
			</div>
			<div className={styles.stepText}>
				<div className={styles.stepTitle}>{title}</div>
				<div className={styles.stepDescription}>{description}</div>
			</div>
		</div>
	);
}

export function CoordinatesGrabber({
	onLog,
}: {
	onLog?: (source: CadRuntimeLogSource, message: string) => void;
}) {
	const {
		addLog,
		availableLayers,
		backendConnected,
		downloadResult,
		openResultLocation,
		handleAddLayer,
		handleClearLayers,
		handleLayerSearch,
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
	} = useCoordinatesGrabberState({ onLog });

	const layersToRun =
		state.selectedLayers.length > 0
			? state.selectedLayers
			: state.layerName.trim()
				? [state.layerName.trim()]
				: [];
	const hasResult = state.executionHistory.length > 0;
	const latestHistory = hasResult ? state.executionHistory[0] : null;
	const previousHistory =
		state.executionHistory.length > 1 ? state.executionHistory[1] : null;
	const setupReady =
		layersToRun.length > 0 &&
		state.pointPrefix.trim().length > 0 &&
		state.startNumber > 0 &&
		state.decimalPlaces >= 0 &&
		state.decimalPlaces <= 12;
	const runStatus: "pending" | "active" | "complete" = state.isRunning
		? "active"
		: hasResult
			? "complete"
			: "pending";
	const setupStatus: "pending" | "active" | "complete" = setupReady
		? "complete"
		: "active";
	const resultsStatus: "pending" | "active" | "complete" = hasResult
		? "complete"
		: "pending";
	const progressLabel = getProgressLabel(progressStage, progress);
	const pointsDelta =
		latestHistory && previousHistory
			? (latestHistory.pointsCreated ?? 0) -
				(previousHistory.pointsCreated ?? 0)
			: 0;
	const durationDelta =
		latestHistory && previousHistory
			? latestHistory.duration - previousHistory.duration
			: 0;
	const outcomeChanged =
		latestHistory && previousHistory
			? latestHistory.success !== previousHistory.success
			: false;
	const latestLayerLabel =
		latestHistory?.config.layerName ||
		latestHistory?.config.mode ||
		"Extraction run";
	const previousLayerLabel =
		previousHistory?.config.layerName ||
		previousHistory?.config.mode ||
		"Extraction run";
	const layerChanged =
		latestHistory && previousHistory
			? latestLayerLabel !== previousLayerLabel
			: false;
	const layerInputPlaceholder =
		availableLayers.length > 0
			? "-- Select a layer --"
			: "No layers found. Type a layer name or refresh.";

	return (
		<div className={styles.root}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} />
				<div className={styles.heroMain}>
					<p className={styles.kicker}>AutoCAD Extraction Pipeline</p>
					<h1 className={styles.title}>Coordinate Grabber</h1>
					<p className={styles.subtitle}>
						Configure layers, run extraction, and export coordinate deliverables
						in one guided flow.
					</p>
				</div>
			</section>

			<section className={styles.steps}>
				<StepCard
					title="1. Setup"
					description="Choose target layers and extraction rules"
					status={setupStatus}
				/>
				<StepCard
					title="2. Extract"
					description="Run extraction with live status updates"
					status={runStatus}
				/>
				<StepCard
					title="3. Results"
					description="Review output, export file, and run history"
					status={resultsStatus}
				/>
			</section>

			<div className={styles.layout}>
				<section className={cn(styles.card, styles.setupCard)}>
					<header className={styles.cardHeader}>
						<h2>Setup</h2>
						<p>Define layers, geometry style, and naming standards.</p>
					</header>

					<div className={styles.cardGrid}>
						<div className={styles.fieldBlock}>
							<div className={styles.fieldHeader}>
								<span>Layers</span>
								<button
									type="button"
									className={styles.inlineButton}
									onClick={async () => {
										addLog("[INFO] Refreshing layer list from AutoCAD...");
										const layers = await refreshLayers();
										if (layers.length > 0) {
											addLog(`[SUCCESS] Found ${layers.length} layers`);
										} else {
											addLog("[WARNING] No layers found");
										}
									}}
								>
									<RefreshCw size={12} />
									Refresh
								</button>
							</div>
							{availableLayers.length > 0 ? (
								<select
									value={state.layerName}
									onChange={(event) => {
										const nextLayer = event.target.value;
										setState((prev) => ({ ...prev, layerName: nextLayer }));
									}}
									className={styles.input}
								 name="coordinatesgrabber_select_240">
									<option value="">{layerInputPlaceholder}</option>
									{availableLayers.map((layer) => (
										<option key={layer} value={layer}>
											{layer}
										</option>
									))}
								</select>
							) : (
								<input
									type="text"
									value={state.layerName}
									onChange={(event) => {
										const nextLayer = event.target.value;
										setState((prev) => ({ ...prev, layerName: nextLayer }));
									}}
									placeholder={layerInputPlaceholder}
									className={styles.input}
								name="coordinatesgrabber_input_256"
								/>
							)}
							<div className={styles.inlineActions}>
								<button
									type="button"
									className={styles.outlineButton}
									onClick={handleAddLayer}
								>
									+ Add Layer
								</button>
								<button
									type="button"
									className={styles.outlineButton}
									disabled={state.selectedLayers.length === 0}
									onClick={handleClearLayers}
								>
									Clear Layers
								</button>
							</div>
							<div className={styles.tagList}>
								{state.selectedLayers.length === 0 ? (
									<span className={styles.mutedText}>No layers added yet</span>
								) : (
									state.selectedLayers.map((layer) => (
										<button
											key={layer}
											type="button"
											className={styles.layerTag}
											onClick={() => handleRemoveLayer(layer)}
										>
											<span>{layer}</span>
											<span>×</span>
										</button>
									))
								)}
							</div>
						</div>

						<div className={styles.fieldBlock}>
							<span>Geometry Style</span>
							<div className={styles.choiceGrid}>
								<button
									type="button"
									onClick={() => handleStyleChange("center")}
									className={cn(
										styles.choiceButton,
										state.extractionStyle === "center" && styles.choiceActive,
									)}
								>
									Center Point
								</button>
								<button
									type="button"
									onClick={() => handleStyleChange("corners")}
									className={cn(
										styles.choiceButton,
										state.extractionStyle === "corners" && styles.choiceActive,
									)}
								>
									Four Corners
								</button>
							</div>
							<div className={styles.checkStack}>
								<label className={styles.checkLabel}>
									<input
										type="checkbox"
										checked={state.scanSelection}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												scanSelection: event.target.checked,
											}))
										}
									name="coordinatesgrabber_input_329"
									/>
									Scan selected entities only
								</label>
								<label className={styles.checkLabel}>
									<input
										type="checkbox"
										checked={state.includeModelspace}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												includeModelspace: event.target.checked,
											}))
										}
									name="coordinatesgrabber_input_342"
									/>
									Include ModelSpace geometry
								</label>
							</div>
						</div>

						<div className={cn(styles.fieldBlock, styles.pointNamingBlock)}>
							<span>Point Naming</span>
							<div className={styles.splitInputs}>
								<div className={styles.pointNamingField}>
									<span className={cn(styles.labelSmall, styles.centerText)}>
										Prefix
									</span>
									<input
										type="text"
										value={state.pointPrefix}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												pointPrefix: event.target.value,
											}))
										}
										className={cn(styles.input, styles.centerInput)}
									name="coordinatesgrabber_input_364"
									/>
								</div>
								<div className={styles.pointNamingField}>
									<span className={cn(styles.labelSmall, styles.centerText)}>
										Start #
									</span>
									<input
										type="number"
										min={1}
										value={state.startNumber}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												startNumber:
													Number.parseInt(event.target.value, 10) || 1,
											}))
										}
										className={cn(styles.input, styles.centerInput)}
									name="coordinatesgrabber_input_380"
									/>
								</div>
								<div className={styles.pointNamingField}>
									<span className={cn(styles.labelSmall, styles.centerText)}>
										Decimals
									</span>
									<input
										type="number"
										min={0}
										max={12}
										value={state.decimalPlaces}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												decimalPlaces:
													Number.parseInt(event.target.value, 10) || 3,
											}))
										}
										className={cn(styles.input, styles.centerInput)}
									name="coordinatesgrabber_input_398"
									/>
								</div>
								<div className={styles.pointNamingField}>
									<span className={cn(styles.labelSmall, styles.centerText)}>
										Block Scale
									</span>
									<input
										type="number"
										min={0.0001}
										step={0.1}
										value={state.refScale}
										onChange={(event) =>
											setState((prev) => ({
												...prev,
												refScale: Number(event.target.value) || 1,
											}))
										}
										className={cn(styles.input, styles.centerInput)}
									name="coordinatesgrabber_input_417"
									/>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className={cn(styles.card, styles.statusCard)}>
					<header className={styles.cardHeader}>
						<h2>Connection Health</h2>
						<p>Live stream and backend status for this session.</p>
					</header>
					<div className={styles.healthStack}>
						<div className={styles.healthRow}>
							<span>Last stream event</span>
							<strong>{wsLastEventStamp}</strong>
						</div>
						<div className={styles.healthRow}>
							<span>Last status update</span>
							<strong>{liveStatusStamp}</strong>
						</div>
						<div className={styles.healthRow}>
							<span>Drawing</span>
							<strong>
								{liveBackendStatus.drawingOpen
									? (liveBackendStatus.drawingName ?? "Open")
									: "None"}
							</strong>
						</div>
						<button
							type="button"
							className={styles.inlineButton}
							onClick={() => void reconnectLiveStream()}
						>
							<Link2 size={12} />
							Reconnect Stream
						</button>
						{liveBackendStatus.error ? (
							<div className={styles.warningBox}>
								<TriangleAlert size={14} />
								<span>{liveBackendStatus.error}</span>
							</div>
						) : null}
					</div>
				</section>

				<section className={cn(styles.card, styles.runCard)}>
					<header className={styles.cardHeader}>
						<h2>Run</h2>
						<p>Start extraction with current setup and monitor progress.</p>
					</header>
					<div className={styles.runMeta}>
						<div>
							<span className={styles.labelSmall}>Layers queued</span>
							<strong>{layersToRun.length}</strong>
						</div>
						<div>
							<span className={styles.labelSmall}>Selection mode</span>
							<strong>{state.scanSelection ? "On" : "Off"}</strong>
						</div>
						<div>
							<span className={styles.labelSmall}>Selection count</span>
							<strong>{state.selectionCount}</strong>
						</div>
					</div>

					{state.isRunning ? (
						<div className={styles.progressWrap}>
							<div className={styles.progressLabel}>
								<Loader2 size={14} className={styles.spinner} />
								<span>{progressLabel}</span>
							</div>
							<Progress value={progress} showValue color="accent" />
						</div>
					) : null}

					<div className={styles.inlineActions}>
						<button
							type="button"
							className={styles.primaryButton}
							disabled={state.isRunning || !backendConnected}
							onClick={() => void handleLayerSearch()}
						>
							{state.isRunning ? "Extracting..." : "Start Extraction"}
						</button>
						{state.scanSelection ? (
							<button
								type="button"
								className={styles.outlineButton}
								disabled={!backendConnected || state.isRunning}
								onClick={() => void handleSelectionRefresh()}
							>
								Refresh Selection
							</button>
						) : null}
					</div>
				</section>

				<section className={cn(styles.card, styles.resultsCard)}>
					<header className={styles.cardHeader}>
						<h2>Results</h2>
						<p>Review latest output, exports, and execution history.</p>
					</header>

					{latestHistory ? (
						<div className={styles.latestRun}>
							<div className={styles.latestHeader}>
								<strong>Latest Run</strong>
								<span>
									{new Date(latestHistory.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<div className={styles.latestMetrics}>
								<div>
									<span>Outcome</span>
									<strong>
										{latestHistory.success ? "Success" : "Failed"}
									</strong>
								</div>
								<div>
									<span>Points</span>
									<strong>{latestHistory.pointsCreated ?? 0}</strong>
								</div>
								<div>
									<span>Duration</span>
									<strong>{latestHistory.duration.toFixed(2)}s</strong>
								</div>
								<div>
									<span>Export</span>
									<strong>{state.excelPath ? "Ready" : "Pending"}</strong>
								</div>
							</div>
							{latestHistory.message ? (
								<p className={styles.latestMessage}>{latestHistory.message}</p>
							) : null}
						</div>
					) : (
						<p className={styles.mutedText}>
							No run yet. Complete setup and execute extraction.
						</p>
					)}

					{latestHistory && previousHistory ? (
						<div className={styles.changesCard}>
							<div className={styles.changesHeader}>
								What changed vs previous run
							</div>
							<div className={styles.changesGrid}>
								<div>
									<span>Points</span>
									<strong
										className={cn(
											styles.deltaValue,
											pointsDelta > 0
												? styles.deltaUp
												: pointsDelta < 0
													? styles.deltaDown
													: styles.deltaNeutral,
										)}
									>
										{formatSignedInteger(pointsDelta)}
									</strong>
								</div>
								<div>
									<span>Duration</span>
									<strong
										className={cn(
											styles.deltaValue,
											durationDelta < 0
												? styles.deltaUp
												: durationDelta > 0
													? styles.deltaDown
													: styles.deltaNeutral,
										)}
									>
										{formatSignedSeconds(durationDelta)}
									</strong>
								</div>
								<div>
									<span>Outcome</span>
									<strong
										className={cn(
											styles.deltaValue,
											outcomeChanged
												? latestHistory.success
													? styles.deltaUp
													: styles.deltaDown
												: styles.deltaNeutral,
										)}
									>
										{outcomeChanged
											? `${previousHistory.success ? "Success" : "Failed"} -> ${
													latestHistory.success ? "Success" : "Failed"
												}`
											: "No change"}
									</strong>
								</div>
								<div>
									<span>Layers</span>
									<strong
										className={cn(
											styles.deltaValue,
											layerChanged ? styles.deltaNeutral : styles.deltaMuted,
										)}
									>
										{layerChanged ? "Changed" : "Unchanged"}
									</strong>
								</div>
							</div>
						</div>
					) : null}

					<div className={styles.inlineActions}>
						<button
							type="button"
							className={styles.outlineButton}
							disabled={state.isRunning || !latestHistory || !backendConnected}
							onClick={() => void retryLastExtraction()}
						>
							<RefreshCw size={14} />
							Retry Last Extraction
						</button>
						<button
							type="button"
							className={styles.outlineButton}
							disabled={!state.excelPath}
							onClick={() => void openResultLocation()}
						>
							<FileSpreadsheet size={14} />
							Open Export Location
						</button>
						<button
							type="button"
							className={styles.outlineButton}
							disabled={!state.excelPath}
							onClick={() => void downloadResult()}
						>
							<Download size={14} />
							Download Excel
						</button>
					</div>

					<div className={styles.historyList}>
						{state.executionHistory.slice(0, 6).map((entry) => (
							<div key={entry.timestamp} className={styles.historyRow}>
								<div className={styles.historyStatus}>
									{entry.success ? (
										<CheckCircle2 size={14} />
									) : (
										<TriangleAlert size={14} />
									)}
								</div>
								<div className={styles.historyText}>
									<div>
										{entry.config.layerName ||
											(entry.config.mode === "layer_search"
												? "Extraction run"
												: entry.config.mode) ||
											"Extraction run"}
									</div>
									<span>
										{new Date(entry.timestamp).toLocaleTimeString()} •{" "}
										{entry.duration.toFixed(2)}s • {entry.pointsCreated ?? 0}{" "}
										points
									</span>
								</div>
							</div>
						))}
					</div>

					{state.coordinateData.length > 0 ? (
						<details className={styles.detailsBlock}>
							<summary>Inspect raw coordinate payload</summary>
							<div className={styles.detailsInner}>
								<CoordinateYamlViewer data={state.coordinateData} />
							</div>
						</details>
					) : null}
				</section>
			</div>
		</div>
	);
}
