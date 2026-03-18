import {
	AlertTriangle,
	Cable,
	CheckCircle2,
	Circle,
	Crosshair,
	Eraser,
	FlaskConical,
	Grid3X3,
	HardDriveDownload,
	Layers,
	LoaderCircle,
	Map as MapIcon,
	MoveRight,
	Rows3,
	Ruler,
	ScanLine,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Badge,
	Button,
	Input,
	Panel,
	Progress,
	Stack,
	Text,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
import styles from "./ConduitRouteApp.module.css";
import { ConduitRouteSectionSketch } from "./ConduitRouteSectionSketch";
import { ConduitTerminalWorkflow } from "./ConduitTerminalWorkflow";
import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	DEFAULT_WIRE_FUNCTIONS,
	EQUIPMENT_NODES,
	OBSTACLE_STYLE,
	ROUTE_TABS,
	ROUTING_MODES,
	SECTION_PRESETS,
	WIRE_COLORS,
} from "./conduitRouteData";
import { AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS } from "./autowirePresets";
import { toRoundedPathSvg } from "./conduitRouteEngine";
import {
	CONDUCTOR_AREAS,
	CONDUIT_AREAS,
	calculateNec,
	DEFAULT_CONDUCTORS,
} from "./conduitRouteNec";
import type {
	CableSystemType,
	ConduitRouteTab,
	NecConductorInput,
	ObstacleType,
	RoutingMode,
	SectionPreset,
} from "./conduitRouteTypes";
import {
	colorVariantByPercent,
	createConduitRouteViewModel,
	formatLength,
	getModeBadgeTone,
} from "./conduitRouteViewModel";
import { useConduitCadReviewController } from "./useConduitCadReviewController";
import { useConduitObstacleController } from "./useConduitObstacleController";
import { useConduitRouteCanvasController } from "./useConduitRouteCanvasController";

export function ConduitRouteApp() {
	const [workspace, setWorkspace] = useState<"yard" | "terminal">("yard");
	const [tab, setTab] = useState<ConduitRouteTab>("routes");
	const [mode, setMode] = useState<RoutingMode>("plan_view");
	const [cableType, setCableType] = useState<CableSystemType>("DC");
	const [wireFunction, setWireFunction] = useState<string>(
		DEFAULT_WIRE_FUNCTIONS.DC,
	);
	const [clearance, setClearance] = useState(18);
	const [statusMessage, setStatusMessage] = useState(
		"Ready. Click in the canvas to place a route start point.",
	);

	const [necConductors, setNecConductors] =
		useState<NecConductorInput[]>(DEFAULT_CONDUCTORS);
	const [necConduit, setNecConduit] = useState("2 EMT");
	const [ambientTempC, setAmbientTempC] = useState(30);
	const [sectionPreset, setSectionPreset] =
		useState<SectionPreset["id"]>("stub_up");

	useEffect(() => {
		const palette = WIRE_COLORS[cableType];
		if (!palette[wireFunction]) {
			setWireFunction(DEFAULT_WIRE_FUNCTIONS[cableType]);
		}
	}, [cableType, wireFunction]);
	const necResult = useMemo(
		() => calculateNec(necConductors, necConduit, ambientTempC),
		[necConductors, necConduit, ambientTempC],
	);
	const activeColorForRoute =
		WIRE_COLORS[cableType][wireFunction] ??
		WIRE_COLORS[cableType][DEFAULT_WIRE_FUNCTIONS[cableType]];

	const {
		activeObstacles,
		addObstacleLayerRule,
		autoIdentifyObstacleLayers,
		availableCadLayers,
		clearObstacleLayerRules,
		handleLayerPresetChange,
		layerPickerValue,
		layerRulesRefreshing,
		obstacleLayerNames,
		obstacleLayerPreset,
		obstacleLayerRules,
		obstacleLayerTypeOverrides,
		obstacleScanMeta,
		obstacleSource,
		obstacleSyncing,
		refreshObstacleLayerList,
		removeObstacleLayerRule,
		setLayerPickerValue,
		setObstacleLayerRules,
		syncAutocadObstacles,
		useDemoObstacleLayout,
	} = useConduitObstacleController({
		workspace,
		setStatusMessage,
	});

	const {
		clearCadReviewState,
		crewReviewEntries,
		crewReviewError,
		crewReviewLoading,
		exportBackcheckJson,
		routeBackcheckReport,
		routeBackchecking,
		runCadCrewReview,
		runRouteBackcheck,
	} = useConduitCadReviewController({
		setStatusMessage,
	});

	const {
		clearAllRoutes,
		exportScheduleCsv,
		handleCanvasClick,
		handleCanvasHover,
		hoverPoint,
		lastComputeMeta,
		removeRoute,
		routeComputing,
		routes,
		scheduleRows,
		selectedRouteId,
		setHoverPoint,
		setSelectedRouteId,
		startPoint,
		undoLastRoute,
	} = useConduitRouteCanvasController({
		mode,
		cableType,
		wireFunction,
		clearance,
		activeColor: activeColorForRoute,
		activeObstacles,
		obstacleSource,
		obstacleLayerNames,
		obstacleLayerTypeOverrides,
		obstacleLayerPreset,
		obstacleSyncing,
		routeBackchecking,
		setStatusMessage,
		onRouteMutation: clearCadReviewState,
	});

	const {
		availableWireFunctions,
		cadSyncGate,
		heroSubtitle,
		heroTitle,
		isTerminalWorkspace,
		previewPath,
		routeBackcheckSummary,
		routeStats,
		sectionInfo,
		sectionMetricCards,
		selectedRoute,
	} = useMemo(
		() =>
			createConduitRouteViewModel({
				workspace,
				cableType,
				wireFunction,
				activeObstacles,
				clearance,
				mode,
				startPoint,
				hoverPoint,
				routes,
				selectedRouteId,
				routeBackcheckReport,
				crewReviewEntries,
				obstacleLayerRules,
				sectionPreset,
			}),
		[
			activeObstacles,
			cableType,
			clearance,
			crewReviewEntries,
			hoverPoint,
			mode,
			obstacleLayerRules,
			routeBackcheckReport,
			routes,
			sectionPreset,
			selectedRouteId,
			startPoint,
			wireFunction,
			workspace,
		],
	);
	const bridgeBadgeLabel = isTerminalWorkspace
		? "Terminal Scan Workflow"
		: routeBackchecking
			? "Backcheck Running"
			: obstacleSyncing
			? "AutoCAD Bridge Syncing"
			: obstacleSource === "autocad"
				? "AutoCAD Bridge Active"
				: "AutoCAD Bridge Ready";

	const handleClearAllRoutes = () => {
		clearCadReviewState();
		clearAllRoutes();
	};

	const handleUndoLastRoute = () => {
		clearCadReviewState();
		undoLastRoute();
	};

	const handleRemoveRoute = (routeId: string) => {
		clearCadReviewState();
		removeRoute(routeId);
	};


	return (
		<div className={styles.root}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} />
				<div className={styles.heroHeader}>
					<div>
						<p className={styles.kicker}>AutoWire Lab</p>
						<h2 className={styles.title}>{heroTitle}</h2>
						<p className={styles.subtitle}>{heroSubtitle}</p>
					</div>
					<div className={styles.heroBadges}>
						<Badge color="success" variant="outline" size="sm">
							<ScanLine size={12} />
							{bridgeBadgeLabel}
						</Badge>
						<Badge color="primary" variant="outline" size="sm">
							<Sparkles size={12} />
							{isTerminalWorkspace
								? "Terminal Router Live"
								: "Route Engine Live"}
						</Badge>
					</div>
				</div>
				<div className={styles.workspaceToggle}>
					<button
						type="button"
						onClick={() => setWorkspace("yard")}
						className={cn(
							styles.workspaceButton,
							workspace === "yard" && styles.workspaceButtonActive,
						)}
					>
						<MapIcon size={13} />
						Yard Routing
					</button>
					<button
						type="button"
						onClick={() => setWorkspace("terminal")}
						className={cn(
							styles.workspaceButton,
							workspace === "terminal" && styles.workspaceButtonActive,
						)}
					>
						<Rows3 size={13} />
						Terminal Strips
					</button>
				</div>
				{workspace === "yard" ? (
					<div className={styles.metricsRow}>
						<div className={styles.metricCard}>
							<span>Total Routes</span>
							<strong>{routeStats.total}</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Total Length</span>
							<strong>{Math.round(routeStats.totalLength)} px</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Total Bends</span>
							<strong>{routeStats.totalBends}</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Warnings</span>
							<strong>{routeStats.warningCount}</strong>
						</div>
					</div>
				) : (
					<div className={styles.metricsRow}>
						<div className={styles.metricCard}>
							<span>Workflow</span>
							<strong>Scan → Pick → Route</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Input</span>
							<strong>Terminal Strips</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Output</span>
							<strong>Route + Schedule</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Phase</span>
							<strong>UI First</strong>
						</div>
					</div>
				)}
			</section>

			{workspace === "terminal" ? <ConduitTerminalWorkflow /> : null}

			{workspace === "yard" ? (
				<>
					<div className={styles.layout}>
						<Panel variant="glass" padding="md" className={styles.controlsCard}>
							<Stack gap={4}>
								<div>
									<Text size="sm" weight="semibold">
										Routing Controls
									</Text>
									<Text size="xs" color="muted">
										Select mode, system, and routing constraints.
									</Text>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Mode
									</Text>
									<div className={styles.modeGrid}>
										{ROUTING_MODES.map((entry) => (
											<button
												key={entry.id}
												type="button"
												onClick={() => setMode(entry.id)}
												className={cn(
													styles.modeButton,
													mode === entry.id && styles.modeButtonActive,
												)}
											>
												<div className={styles.modeLabel}>{entry.label}</div>
												<div className={styles.modeDescription}>
													{entry.description}
												</div>
											</button>
										))}
									</div>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Cable System
									</Text>
									<div className={styles.toggleRow}>
										{(["AC", "DC"] as const).map((entry) => (
											<Button
												key={entry}
												variant={cableType === entry ? "primary" : "outline"}
												size="sm"
												onClick={() => setCableType(entry)}
											>
												{entry}
											</Button>
										))}
									</div>
									<div className={styles.functionGrid}>
										{availableWireFunctions.map((entry) => (
											<button
												key={entry}
												type="button"
												onClick={() => setWireFunction(entry)}
												className={cn(
													styles.functionButton,
													wireFunction === entry && styles.functionButtonActive,
												)}
											>
												<span
													className={styles.swatch}
													style={{
														background: WIRE_COLORS[cableType][entry].hex,
													}}
												/>
												<span>{entry}</span>
												<small>{WIRE_COLORS[cableType][entry].code}</small>
											</button>
										))}
									</div>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Clearance: {clearance} px
									</Text>
									<input
										type="range"
										min={4}
										max={48}
										value={clearance}
										onChange={(event) =>
											setClearance(Number(event.target.value) || 18)
										}
										className={styles.slider}
									name="conduitrouteapp_input_1061"
									/>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Obstacle Source
									</Text>
									<div className={styles.canvasBadges}>
										<Badge
											color={
												obstacleSource === "autocad" ? "success" : "default"
											}
											variant="outline"
											size="sm"
										>
											<Layers size={12} />
											{obstacleSource === "autocad" ? "AutoCAD" : "Demo Layout"}
										</Badge>
										<Badge color="default" variant="outline" size="sm">
											{activeObstacles.length} obstacles
										</Badge>
										<Badge color="default" variant="outline" size="sm">
											{obstacleLayerRules.length} layer rules
										</Badge>
										{obstacleScanMeta?.scanMs ? (
											<Badge color="default" variant="outline" size="sm">
												{obstacleScanMeta.scanMs} ms
											</Badge>
										) : null}
									</div>
									<div className={styles.layerEditorPanel}>
									<div className={styles.layerEditorHeader}>
										<Text size="xs" color="muted">
											Layer Identification
										</Text>
											<Button
												size="sm"
												variant="ghost"
												iconLeft={
													layerRulesRefreshing ? (
														<LoaderCircle size={12} />
													) : (
														<ScanLine size={12} />
													)
												}
												onClick={() =>
													void refreshObstacleLayerList({ silent: false })
												}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
												loading={layerRulesRefreshing}
											>
												Refresh
											</Button>
										</div>
										<div className={styles.layerEditorInputRow}>
											<select
												value={obstacleLayerPreset}
												onChange={(event) =>
													handleLayerPresetChange(event.target.value)
												}
												className={styles.layerEditorSelect}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
											 name="conduitrouteapp_select_1125">
												{AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS.map((preset) => (
													<option key={preset.id || "manual"} value={preset.id}>
														{preset.label}
													</option>
												))}
											</select>
										</div>
										<div className={styles.layerEditorInputRow}>
											{availableCadLayers.length > 0 ? (
												<select
													value={layerPickerValue}
													onChange={(event) =>
														setLayerPickerValue(event.target.value)
													}
													className={styles.layerEditorSelect}
												 name="conduitrouteapp_select_1142">
													<option value="">-- Select layer --</option>
													{availableCadLayers.map((layer) => (
														<option key={layer} value={layer}>
															{layer}
														</option>
													))}
												</select>
											) : (
												<input
													type="text"
													value={layerPickerValue}
													onChange={(event) =>
														setLayerPickerValue(event.target.value)
													}
													className={styles.layerEditorInput}
													placeholder="Type layer name..."
												name="conduitrouteapp_input_1157"
												/>
											)}
											<Button
												size="sm"
												variant="outline"
												onClick={addObstacleLayerRule}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
											>
												Add
											</Button>
										</div>
										<div className={styles.layerEditorActions}>
											<Button
												size="sm"
												variant="ghost"
												onClick={autoIdentifyObstacleLayers}
												disabled={
													routeComputing ||
													obstacleSyncing ||
													routeBackchecking ||
													availableCadLayers.length === 0
												}
											>
												Auto Identify
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={clearObstacleLayerRules}
												disabled={
													routeComputing ||
													obstacleSyncing ||
													routeBackchecking ||
													obstacleLayerRules.length === 0
												}
											>
												Clear Rules
											</Button>
										</div>
										<div className={styles.layerRuleList}>
											{obstacleLayerRules.length === 0 ? (
												<div className={styles.layerRuleEmpty}>
													No layer rules yet. Add one or run Auto Identify.
												</div>
											) : (
												obstacleLayerRules.map((rule) => (
													<div
														key={rule.layerName}
														className={styles.layerRuleRow}
													>
														<span className={styles.layerRuleName}>
															{rule.layerName}
														</span>
														<select
															value={rule.obstacleType}
															onChange={(event) =>
																setObstacleLayerRules((prev) =>
																	prev.map((entry) =>
																		entry.layerName === rule.layerName
																			? {
																					...entry,
																					obstacleType: event.target
																						.value as ObstacleType,
																				}
																			: entry,
																	),
																)
															}
															className={styles.layerTypeSelect}
														 name="conduitrouteapp_select_1216">
															<option value="foundation">Foundation</option>
															<option value="building">Building</option>
															<option value="equipment_pad">Pad</option>
															<option value="trench">Trench</option>
															<option value="road">Road</option>
															<option value="fence">Fence</option>
														</select>
														<button
															type="button"
															className={styles.layerRuleRemove}
															onClick={() =>
																removeObstacleLayerRule(rule.layerName)
															}
															disabled={routeComputing || obstacleSyncing || routeBackchecking}
														>
															<X size={12} />
														</button>
													</div>
												))
											)}
										</div>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												obstacleSyncing ? (
													<LoaderCircle size={14} />
												) : (
													<ScanLine size={14} />
												)
											}
											onClick={() => void syncAutocadObstacles()}
											loading={obstacleSyncing}
											disabled={routeComputing || obstacleSyncing || routeBackchecking}
										>
											Sync AutoCAD
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={useDemoObstacleLayout}
											disabled={routeComputing || obstacleSyncing || routeBackchecking}
										>
											Use Demo
										</Button>
									</div>
								</div>

								<div className={styles.actionRow}>
									<Button
										size="sm"
										variant="outline"
										iconLeft={<Eraser size={14} />}
										onClick={handleClearAllRoutes}
										disabled={routeComputing || obstacleSyncing || routeBackchecking}
									>
										Clear All
									</Button>
									<Button
										size="sm"
										variant="outline"
										iconLeft={<X size={14} />}
										onClick={handleUndoLastRoute}
										disabled={routeComputing || obstacleSyncing || routeBackchecking}
									>
										Undo
									</Button>
								</div>
								<div className={styles.backcheckPanel}>
									<div className={styles.backcheckHeader}>
										<Text size="xs" color="muted">
											Route Backcheck
										</Text>
										<div className={styles.backcheckHeaderBadges}>
											{routeBackcheckSummary ? (
												<>
													<Badge color="success" variant="outline" size="sm">
														{routeBackcheckSummary.pass_count} pass
													</Badge>
													<Badge color="warning" variant="outline" size="sm">
														{routeBackcheckSummary.warn_count} warn
													</Badge>
													<Badge color="danger" variant="outline" size="sm">
														{routeBackcheckSummary.fail_count} fail
													</Badge>
												</>
											) : (
												<Badge color="default" variant="outline" size="sm">
													not run
												</Badge>
											)}
										</div>
									</div>
									<div className={styles.gatePanel}>
										<Badge color={cadSyncGate.color} variant="outline" size="sm">
											{cadSyncGate.label}
										</Badge>
										<Text size="xs" color="muted">
											{cadSyncGate.detail}
										</Text>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												routeBackchecking ? (
													<LoaderCircle size={14} />
												) : (
													<CheckCircle2 size={14} />
												)
											}
											onClick={() =>
												void runRouteBackcheck({
													routes,
													activeObstacles,
													obstacleSource,
													clearance,
													routeComputing,
													obstacleSyncing,
												})
											}
											loading={routeBackchecking}
											disabled={
												routeBackchecking ||
												crewReviewLoading ||
												routeComputing ||
												obstacleSyncing ||
												routes.length === 0
											}
										>
											Run Backcheck
										</Button>
										<Button
											size="sm"
											variant="ghost"
											iconLeft={<HardDriveDownload size={14} />}
											onClick={exportBackcheckJson}
											disabled={!routeBackcheckReport || routeBackchecking}
										>
											Export JSON
										</Button>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												crewReviewLoading ? (
													<LoaderCircle size={14} />
												) : (
													<CheckCircle2 size={14} />
												)
											}
											onClick={() =>
												void runCadCrewReview({
													routeComputing,
													obstacleSyncing,
												})
											}
											loading={crewReviewLoading}
											disabled={!routeBackcheckReport || routeBackchecking || crewReviewLoading}
										>
											CAD Crew Review
										</Button>
									</div>
									{routeBackcheckReport?.findings?.length ? (
										<div className={styles.backcheckFindings}>
											{routeBackcheckReport.findings.slice(0, 6).map((finding) => (
												<div key={finding.routeId} className={styles.backcheckFindingRow}>
													<div className={styles.backcheckFindingHead}>
														<strong>{finding.ref || finding.routeId}</strong>
														<Badge
															color={
																finding.status === "fail"
																	? "danger"
																	: finding.status === "warn"
																		? "warning"
																		: "success"
															}
															variant="outline"
															size="sm"
														>
															{finding.status}
														</Badge>
													</div>
													<div className={styles.backcheckFindingMeta}>
														<span>{Math.round(finding.stats.length)} px</span>
														<span>{finding.stats.bend_degrees}° bends</span>
														<span>{finding.stats.collision_count} collisions</span>
													</div>
													{finding.issues.length > 0 ? (
														<Text size="xs" color="muted">
															{finding.issues[0]?.message}
														</Text>
													) : null}
												</div>
											))}
										</div>
									) : null}
									{crewReviewEntries.length > 0 ? (
										<div className={styles.crewReviewPanel}>
											<Text size="xs" color="muted">
												Draftsmith {"->"} GridSage
											</Text>
											{crewReviewEntries.map((entry) => (
												<div key={entry.profileId} className={styles.crewReviewCard}>
													<div className={styles.backcheckFindingHead}>
														<strong>{entry.profileId}</strong>
														<Badge
															color={
																entry.status === "completed"
																	? "success"
																	: entry.status === "running"
																		? "warning"
																		: "danger"
															}
															variant="outline"
															size="sm"
														>
															{entry.status}
														</Badge>
													</div>
													{entry.response ? (
														<pre className={styles.crewReviewResponse}>
															{entry.response}
														</pre>
													) : null}
													{entry.error ? (
														<Text size="xs" color="warning">
															{entry.error}
														</Text>
													) : null}
												</div>
											))}
										</div>
									) : null}
									{crewReviewError ? (
										<Text size="xs" color="warning">
											{crewReviewError}
										</Text>
									) : null}
								</div>
							</Stack>
						</Panel>

						<Panel
							variant="elevated"
							padding="md"
							className={styles.canvasCard}
						>
							<div className={styles.canvasHeader}>
								<div>
									<Text size="sm" weight="semibold">
										Route Canvas
									</Text>
									<Text size="xs" color="muted">
										Click start, then destination. Engine computes around
										inflated obstacles.
									</Text>
								</div>
								<div className={styles.canvasBadges}>
									<Badge
										color={getModeBadgeTone(mode)}
										variant="outline"
										size="sm"
									>
										<MapIcon size={12} />
										{mode.replace("_", " ")}
									</Badge>
									<Badge color="default" variant="outline" size="sm">
										<Layers size={12} />
										{cableType} / {wireFunction}
									</Badge>
									<Badge
										color={obstacleSource === "autocad" ? "success" : "default"}
										variant="outline"
										size="sm"
									>
										{obstacleSource === "autocad"
											? "AutoCAD Obstacles"
											: "Demo Obstacles"}
									</Badge>
									{obstacleSyncing ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Syncing Obstacles...
										</Badge>
									) : null}
									{routeBackchecking ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Backchecking...
										</Badge>
									) : null}
									{routeComputing ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Computing...
										</Badge>
									) : null}
									{lastComputeMeta &&
									(lastComputeMeta.computeMs ||
										lastComputeMeta.requestMs ||
										lastComputeMeta.routeValid === false) ? (
										<Badge
											color={
												lastComputeMeta.routeValid === false
													? "danger"
													: "success"
											}
											variant="outline"
											size="sm"
										>
											{lastComputeMeta.routeValid === false
												? "Blocked"
												: `${lastComputeMeta.computeMs ?? lastComputeMeta.requestMs} ms`}
										</Badge>
									) : null}
								</div>
							</div>

							<div className={styles.canvasWrap}>
								<svg
									viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
									className={styles.canvas}
									onMouseMove={handleCanvasHover}
									onMouseLeave={() => setHoverPoint(null)}
									onClick={handleCanvasClick}
								>
									<defs>
										<pattern
											id="grid-sm"
											width="16"
											height="16"
											patternUnits="userSpaceOnUse"
										>
											<path
												d="M 16 0 L 0 0 0 16"
												className={styles.gridMinor}
											/>
										</pattern>
										<pattern
											id="grid-lg"
											width="64"
											height="64"
											patternUnits="userSpaceOnUse"
										>
											<rect width="64" height="64" fill="url(#grid-sm)" />
											<path
												d="M 64 0 L 0 0 0 64"
												className={styles.gridMajor}
											/>
										</pattern>
									</defs>
									<rect
										width={CANVAS_WIDTH}
										height={CANVAS_HEIGHT}
										className={styles.canvasBg}
									/>
									<rect
										width={CANVAS_WIDTH}
										height={CANVAS_HEIGHT}
										fill="url(#grid-lg)"
									/>

									{activeObstacles.map((obstacle) => {
										const style = OBSTACLE_STYLE[obstacle.type];
										return (
											<g key={obstacle.id}>
												<rect
													x={obstacle.x}
													y={obstacle.y}
													width={obstacle.w}
													height={obstacle.h}
													rx={obstacle.type === "fence" ? 8 : 4}
													fill={style.fill}
													stroke={style.stroke}
													strokeWidth={obstacle.type === "fence" ? 1.5 : 1.1}
													strokeDasharray={
														obstacle.type === "fence" ? "6,4" : undefined
													}
												/>
												{obstacle.label ? (
													<text
														x={obstacle.x + obstacle.w / 2}
														y={obstacle.y + obstacle.h / 2}
														textAnchor="middle"
														className={styles.obstacleLabel}
														fill={style.label}
													>
														{obstacle.label}
													</text>
												) : null}
											</g>
										);
									})}

									{routes.map((route) => {
										const selected = selectedRouteId === route.id;
										return (
											<g key={route.id}>
												<path
													d={toRoundedPathSvg(route.path)}
													className={styles.routeShadow}
												/>
												<path
													d={toRoundedPathSvg(route.path)}
													stroke={route.color.stroke}
													strokeWidth={selected ? 4 : 3}
													fill="none"
													className={styles.routeStroke}
													onClick={(event) => {
														event.stopPropagation();
														setSelectedRouteId(route.id);
													}}
												/>
												{route.tag ? (
													<text
														x={route.tag.position.x}
														y={route.tag.position.y}
														transform={`rotate(${route.tag.angleDeg} ${route.tag.position.x} ${route.tag.position.y})`}
														className={styles.tagText}
													>
														{route.tag.text}
													</text>
												) : null}
											</g>
										);
									})}

									{startPoint ? (
										<g>
											<circle
												cx={startPoint.x}
												cy={startPoint.y}
												r={8}
												className={styles.startDot}
											/>
											<circle
												cx={startPoint.x}
												cy={startPoint.y}
												r={16}
												className={styles.startRing}
											/>
										</g>
									) : null}

									{previewPath.path.length > 1 ? (
										<path
											d={toRoundedPathSvg(previewPath.path)}
											className={cn(
												styles.previewStroke,
												!previewPath.valid && styles.previewSketch,
											)}
										/>
									) : null}

									{EQUIPMENT_NODES.map((node) => (
										<g key={node.id}>
											<circle
												cx={node.x}
												cy={node.y}
												r={8}
												fill={node.color}
												className={styles.nodeDot}
											/>
											<text
												x={node.x + 12}
												y={node.y + 4}
												className={styles.nodeLabel}
											>
												{node.label}
											</text>
										</g>
									))}
								</svg>
							</div>

							<div className={styles.statusBar}>
								<span>{statusMessage}</span>
								{startPoint ? (
									<span>
										<Crosshair size={12} /> Start locked (
										{Math.round(startPoint.x)}, {Math.round(startPoint.y)})
									</span>
								) : null}
							</div>
						</Panel>

						<Panel variant="glass" padding="md" className={styles.inspectCard}>
							<div className={styles.inspectTabs}>
								{ROUTE_TABS.map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setTab(entry.id)}
										className={cn(
											styles.inspectTab,
											tab === entry.id && styles.inspectTabActive,
										)}
									>
										{entry.label}
									</button>
								))}
							</div>

							{tab === "routes" ? (
								<Stack gap={3} className={styles.feed}>
									{routes.length === 0 ? (
										<div className={styles.emptyState}>
											<Circle size={14} />
											No routes yet. Start by clicking two points on the canvas.
										</div>
									) : (
										routes.map((route) => (
											<div
												key={route.id}
												className={cn(
													styles.feedCard,
													selectedRouteId === route.id &&
														styles.feedCardSelected,
												)}
											>
												<button
													type="button"
													onClick={() => setSelectedRouteId(route.id)}
													className={styles.feedSelect}
												>
													<div className={styles.feedTop}>
														<strong>{route.ref}</strong>
														<Badge
															color={
																route.bendDegrees > 360 ? "danger" : "success"
															}
															variant="outline"
															size="sm"
														>
															{route.mode.replace("_", " ")}
														</Badge>
													</div>
													<div className={styles.feedMeta}>
														<span>
															<Ruler size={12} /> {formatLength(route.length)}
														</span>
														<span>
															<Cable size={12} /> {route.bendDegrees}° bends
														</span>
													</div>
												</button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleRemoveRoute(route.id)}
													iconLeft={<X size={12} />}
													disabled={routeComputing || obstacleSyncing || routeBackchecking}
												>
													Remove
												</Button>
											</div>
										))
									)}

									{selectedRoute ? (
										<div className={styles.selectedRouteCard}>
											<div className={styles.selectedHeader}>
												<span>Selected</span>
												<strong>{selectedRoute.ref}</strong>
											</div>
											<div className={styles.selectedRows}>
												<div>
													<span>System</span>
													<strong>{selectedRoute.cableType}</strong>
												</div>
												<div>
													<span>Function</span>
													<strong>{selectedRoute.wireFunction}</strong>
												</div>
												<div>
													<span>Bends</span>
													<strong>{selectedRoute.bendCount}</strong>
												</div>
												<div>
													<span>Total Degrees</span>
													<strong>{selectedRoute.bendDegrees}°</strong>
												</div>
											</div>
											{selectedRoute.bendDegrees > 360 ? (
												<div className={styles.warningBanner}>
													<AlertTriangle size={14} />
													Exceeded NEC 360° pull limit. Add pull point.
												</div>
											) : (
												<div className={styles.okBanner}>
													<CheckCircle2 size={14} />
													Within bend-limit envelope.
												</div>
											)}
										</div>
									) : null}
								</Stack>
							) : null}

							{tab === "schedule" ? (
								<div className={styles.scheduleWrap}>
									{scheduleRows.length === 0 ? (
										<div className={styles.emptyState}>
											No schedule rows yet.
										</div>
									) : (
										<table className={styles.scheduleTable}>
											<thead>
												<tr>
													<th>Ref</th>
													<th>Type</th>
													<th>Fn</th>
													<th>Color</th>
													<th>From</th>
													<th>To</th>
													<th>Len</th>
												</tr>
											</thead>
											<tbody>
												{scheduleRows.map((row) => (
													<tr key={row.id}>
														<td>{row.ref}</td>
														<td>{row.type}</td>
														<td>{row.fn}</td>
														<td>{row.color}</td>
														<td>{row.from}</td>
														<td>{row.to}</td>
														<td>{row.length}px</td>
													</tr>
												))}
											</tbody>
										</table>
									)}
									<div className={styles.scheduleActions}>
										<Button
											variant="outline"
											size="sm"
											iconLeft={<HardDriveDownload size={14} />}
											onClick={exportScheduleCsv}
											disabled={scheduleRows.length === 0}
										>
											Export CSV
										</Button>
									</div>
								</div>
							) : null}

							{tab === "nec" ? (
								<Stack gap={3}>
									<div className={styles.necControls}>
										<label className={styles.necLabel}>
											Conduit Type
											<select
												className={styles.selectField}
												value={necConduit}
												onChange={(event) => setNecConduit(event.target.value)}
											 name="conduitrouteapp_select_1707">
												{Object.keys(CONDUIT_AREAS).map((option) => (
													<option key={option} value={option}>
														{option}
													</option>
												))}
											</select>
										</label>
										<Input
											label="Ambient Temp (C)"
											type="number"
											value={ambientTempC}
											onChange={(event) =>
												setAmbientTempC(Number(event.target.value) || 30)
											}
											inputSize="sm"
										/>
									</div>

									<div className={styles.necConductors}>
										{necConductors.map((conductor, index) => (
											<div
												key={`${conductor.gauge}_${index}`}
												className={styles.necConductorRow}
											>
												<select
													className={styles.selectField}
													value={conductor.gauge}
													onChange={(event) => {
														setNecConductors((current) => {
															const next = [...current];
															next[index] = {
																...next[index],
																gauge: event.target.value,
															};
															return next;
														});
													}}
												 name="conduitrouteapp_select_1736">
													{Object.keys(CONDUCTOR_AREAS).map((option) => (
														<option key={option} value={option}>
															{option}
														</option>
													))}
												</select>
												<input
													type="number"
													min={1}
													className={styles.countField}
													value={conductor.count}
													onChange={(event) => {
														setNecConductors((current) => {
															const next = [...current];
															next[index] = {
																...next[index],
																count: Math.max(
																	1,
																	Number(event.target.value) || 1,
																),
															};
															return next;
														});
													}}
												name="conduitrouteapp_input_1756"
												/>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setNecConductors((current) =>
															current.length > 1
																? current.filter((_, row) => row !== index)
																: current,
														);
													}}
													iconLeft={<X size={12} />}
												>
													Drop
												</Button>
											</div>
										))}
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setNecConductors((current) => [
													...current,
													{ gauge: "12 AWG", count: 1 },
												])
											}
										>
											+ Add Conductor
										</Button>
									</div>

									<div className={styles.necResults}>
										<div className={styles.necCard}>
											<span>Fill</span>
											<strong>{necResult.fillPercent.toFixed(1)}%</strong>
											<Badge
												color={necResult.fillPass ? "success" : "danger"}
												variant="outline"
												size="sm"
											>
												Limit {necResult.fillLimitPercent}%
											</Badge>
										</div>
										<div className={styles.necCard}>
											<span>Derating</span>
											<strong>
												{(necResult.deratingFactor * 100).toFixed(0)}%
											</strong>
										</div>
										<div className={styles.necCard}>
											<span>Temp Corr</span>
											<strong>
												{(necResult.tempCorrectionFactor * 100).toFixed(0)}%
											</strong>
										</div>
									</div>

									<div>
										<Text
											size="xs"
											color="muted"
											className={styles.progressLabel}
										>
											Combined Thermal Utilization
										</Text>
										<Progress
											value={Math.min(
												100,
												Math.round((1 - necResult.combinedFactor) * 100),
											)}
											color={colorVariantByPercent(
												(1 - necResult.combinedFactor) * 100,
											)}
											showValue
										/>
									</div>
								</Stack>
							) : null}

							{tab === "sections" ? (
								<Stack gap={3}>
									<div className={styles.sectionButtons}>
										{SECTION_PRESETS.map((preset) => (
											<button
												key={preset.id}
												type="button"
												onClick={() => setSectionPreset(preset.id)}
												className={cn(
													styles.sectionButton,
													sectionPreset === preset.id &&
														styles.sectionButtonActive,
												)}
											>
												{preset.label}
											</button>
										))}
									</div>
									<div className={styles.sectionPanel}>
										<div className={styles.sectionHeader}>
											<Text size="sm" weight="semibold">
												{sectionInfo?.title ?? "Section"}
											</Text>
											<Text size="xs" color="muted">
												{sectionInfo?.description}
											</Text>
										</div>
										<ConduitRouteSectionSketch preset={sectionPreset} />
										<div className={styles.sectionMetrics}>
											{sectionMetricCards.map((metric) => (
												<div
													key={metric.label}
													className={styles.sectionMetric}
												>
													<span>{metric.label}</span>
													<strong>{metric.value}</strong>
												</div>
											))}
										</div>
									</div>
								</Stack>
							) : null}
						</Panel>
					</div>
					<footer className={styles.footer}>
						<div>
							<Grid3X3 size={12} />
							Grid {CANVAS_WIDTH}x{CANVAS_HEIGHT}
						</div>
						<div>
							<MoveRight size={12} />
							{routes.length > 0
								? `${routes[0].ref} latest route`
								: "No routes committed yet"}
						</div>
						<div>
							<FlaskConical size={12} />
							NEC snapshot in sync
						</div>
					</footer>
				</>
			) : null}
		</div>
	);
}
