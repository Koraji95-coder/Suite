import {
	Box,
	FileSpreadsheet,
	FileText,
	Lock,
	LockOpen,
	Monitor,
	PenTool,
	Play,
	Redo2,
	Undo2,
	Zap,
} from "lucide-react";
import {
	useEffect,
	useState,
	type CSSProperties,
	type ComponentType,
} from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/system/base/Progress";
import type { PlotDiffPreview, PreviewMode } from "./GridGeneratorPanelModels";
import styles from "./GridGeneratorPreviewColumn.module.css";
import { GridManualEditor } from "./GridManualEditor";
import { GridPreview } from "./GridPreview";
import { PotentialContour } from "./PotentialContour";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridGeneratorPreviewColumnProps {
	previewMode: PreviewMode;
	generating: boolean;
	canUndo: boolean;
	canRedo: boolean;
	backendConnected: boolean;
	soilResistivity: number;
	faultCurrent: number;
	teeCount: number;
	crossCount: number;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	plotDiffPreview: PlotDiffPreview;
	palettePrimary: string;
	paletteSurfaceLight: string;
	paletteText: string;
	paletteTextMuted: string;
	btnStyle: (active?: boolean) => CSSProperties;
	onRunGeneration: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onExportExcel: () => void;
	onExportPdf: () => void;
	onPlotToAutoCad: () => void;
	placementLock: boolean;
	onTogglePlacementLock: () => void;
	onPreviewModeChange: (mode: PreviewMode) => void;
	onSoilResistivityChange: (value: number) => void;
	onFaultCurrentChange: (value: number) => void;
	onManualRodsChange: (next: GridRod[]) => void;
	onManualConductorsChange: (next: GridConductor[]) => void;
	onManualPlacementsChange: (next: GridPlacement[]) => void;
}

export function GridGeneratorPreviewColumn({
	previewMode,
	generating,
	canUndo,
	canRedo,
	backendConnected,
	soilResistivity,
	faultCurrent,
	teeCount,
	crossCount,
	rods,
	conductors,
	placements,
	plotDiffPreview,
	palettePrimary,
	paletteSurfaceLight,
	paletteText,
	paletteTextMuted,
	btnStyle,
	onRunGeneration,
	onUndo,
	onRedo,
	onExportExcel,
	onExportPdf,
	onPlotToAutoCad,
	placementLock,
	onTogglePlacementLock,
	onPreviewModeChange,
	onSoilResistivityChange,
	onFaultCurrentChange,
	onManualRodsChange,
	onManualConductorsChange,
	onManualPlacementsChange,
}: GridGeneratorPreviewColumnProps) {
	const hasPlacements = placements.length > 0;
	const [showConductors, setShowConductors] = useState(true);
	const [showRods, setShowRods] = useState(true);
	const [showTestWells, setShowTestWells] = useState(true);
	const [showTees, setShowTees] = useState(true);
	const [showCrosses, setShowCrosses] = useState(true);
	const [showCallouts, setShowCallouts] = useState(true);
	const [calloutScale, setCalloutScale] = useState(1.2);
	const [showPlotPreview, setShowPlotPreview] = useState(false);
	const [gridPreview3DLoading, setGridPreview3DLoading] = useState(false);
	const [gridPreview3DError, setGridPreview3DError] = useState<string | null>(
		null,
	);
	const [GridPreview3DComponent, setGridPreview3DComponent] =
		useState<ComponentType<{
			rods: GridRod[];
			conductors: GridConductor[];
			placements: GridPlacement[];
		}> | null>(null);

	useEffect(() => {
		if (
			previewMode !== "3d" ||
			gridPreview3DLoading ||
			gridPreview3DError ||
			GridPreview3DComponent
		) {
			return;
		}
		let active = true;
		setGridPreview3DLoading(true);
		void import("./GridPreview3D")
			.then((module) => {
				if (!active) return;
				setGridPreview3DComponent(() => module.GridPreview3D);
				setGridPreview3DError(null);
			})
			.catch((error: unknown) => {
				if (!active) return;
				const message =
					error instanceof Error
						? error.message
						: "Failed to load 3D preview module.";
				setGridPreview3DError(message);
			})
			.finally(() => {
				if (!active) return;
				setGridPreview3DLoading(false);
			});
		return () => {
			active = false;
		};
	}, [
		previewMode,
		gridPreview3DLoading,
		gridPreview3DError,
		GridPreview3DComponent,
	]);

	useEffect(() => {
		if (previewMode === "3d") return;
		setGridPreview3DError(null);
		setGridPreview3DComponent(null);
		setGridPreview3DLoading(false);
	}, [previewMode]);

	const previewVars = {
		"--gg-primary": palettePrimary,
		"--gg-surface-light": paletteSurfaceLight,
		"--gg-text": paletteText,
		"--gg-text-muted": paletteTextMuted,
	} as CSSProperties;

	return (
		<div className={styles.root} style={previewVars}>
			<div className={styles.toolbar}>
				<button
					onClick={onRunGeneration}
					disabled={generating || conductors.length === 0}
					className={cn(styles.toolbarButton, styles.generateButton)}
					style={{
						...btnStyle(true),
						opacity: conductors.length === 0 ? 0.5 : undefined,
					}}
				>
					{generating ? (
						<>
							<Progress
								value={100}
								size="sm"
								indeterminate
								animated
								color="accent"
								className={styles.toolbarProgress}
							/>
							Generating grid…
						</>
					) : (
						<>
							<Play size={14} />
							Generate Grid
						</>
					)}
				</button>

				<button
					onClick={onUndo}
					disabled={!canUndo}
					className={cn(styles.toolbarButton, styles.actionButton)}
					style={{ ...btnStyle(), opacity: canUndo ? 1 : 0.4 }}
				>
					<Undo2 size={14} />
				</button>
				<button
					onClick={onRedo}
					disabled={!canRedo}
					className={cn(styles.toolbarButton, styles.actionButton)}
					style={{ ...btnStyle(), opacity: canRedo ? 1 : 0.4 }}
				>
					<Redo2 size={14} />
				</button>
				<button
					onClick={onTogglePlacementLock}
					disabled={!hasPlacements}
					title={
						placementLock
							? "Placements are locked: Generate Grid will not overwrite them."
							: "Placements are unlocked: Generate Grid will replace them."
					}
					className={cn(
						styles.toolbarButton,
						styles.actionButton,
						styles.dashedButton,
					)}
					style={{
						...btnStyle(placementLock),
						opacity: hasPlacements ? 1 : 0.6,
					}}
				>
					{placementLock ? <Lock size={14} /> : <LockOpen size={14} />}
					{placementLock ? "Placements Locked" : "Placements Unlocked"}
				</button>

				{hasPlacements && (
					<>
						<button
							onClick={onExportExcel}
							className={cn(styles.toolbarButton, styles.actionButton)}
							style={btnStyle()}
						>
							<FileSpreadsheet size={14} /> Excel
						</button>
						<button
							onClick={onExportPdf}
							className={cn(styles.toolbarButton, styles.actionButton)}
							style={btnStyle()}
						>
							<FileText size={14} /> PDF
						</button>
						<button
							onClick={() => setShowPlotPreview(true)}
							className={cn(styles.toolbarButton, styles.actionButton)}
							style={{
								...btnStyle(),
								opacity: backendConnected ? 1 : 0.5,
							}}
						>
							<Monitor size={14} /> AutoCAD
						</button>
					</>
				)}
			</div>

			<div className={styles.previewTabs}>
				{[
					{ id: "2d" as const, label: "2D", icon: <Monitor size={12} /> },
					{ id: "3d" as const, label: "3D", icon: <Box size={12} /> },
					{
						id: "contour" as const,
						label: "Potential",
						icon: <Zap size={12} />,
					},
					{
						id: "editor" as const,
						label: "Editor",
						icon: <PenTool size={12} />,
					},
				].map((tab) => (
					<button
						key={tab.id}
						onClick={() => onPreviewModeChange(tab.id)}
						className={cn(
							styles.tabButton,
							previewMode === tab.id
								? styles.tabButtonActive
								: styles.tabButtonInactive,
						)}
					>
						{tab.icon} {tab.label}
					</button>
				))}
			</div>

			{previewMode === "contour" && (
				<div className={styles.contourControls}>
					<label className={styles.fieldRow}>
						Soil Resistivity:
						<input
							type="number"
							value={soilResistivity}
							onChange={(e) =>
								onSoilResistivityChange(Number(e.target.value) || 0)
							}
							className={styles.smallInput}
							name="gridgeneratorpreviewcolumn_input_266"
						/>
						ohm-m
					</label>
					<label className={styles.fieldRow}>
						Fault Current:
						<input
							type="number"
							value={faultCurrent}
							onChange={(e) =>
								onFaultCurrentChange(Number(e.target.value) || 0)
							}
							className={styles.smallInput}
							name="gridgeneratorpreviewcolumn_input_288"
						/>
						A
					</label>
				</div>
			)}

			{previewMode === "2d" && (
				<div className={styles.toggleToolbar}>
					{[
						{
							id: "all",
							label: "All",
							apply: () => {
								setShowConductors(true);
								setShowRods(true);
								setShowTestWells(true);
								setShowTees(true);
								setShowCrosses(true);
								setShowCallouts(true);
							},
						},
						{
							id: "topology",
							label: "Focus Topology",
							apply: () => {
								setShowConductors(true);
								setShowRods(false);
								setShowTestWells(false);
								setShowTees(true);
								setShowCrosses(true);
								setShowCallouts(true);
							},
						},
						{
							id: "rods",
							label: "Focus Rods",
							apply: () => {
								setShowConductors(false);
								setShowRods(true);
								setShowTestWells(true);
								setShowTees(false);
								setShowCrosses(false);
								setShowCallouts(true);
							},
						},
					].map((preset) => (
						<button
							key={preset.id}
							onClick={preset.apply}
							style={btnStyle()}
							className={cn(
								styles.toolbarButton,
								styles.actionButton,
								styles.presetButton,
							)}
						>
							{preset.label}
						</button>
					))}

					{[
						{
							id: "cond",
							label: "Conductors",
							on: showConductors,
							set: setShowConductors,
						},
						{ id: "rod", label: "Rods", on: showRods, set: setShowRods },
						{
							id: "tw",
							label: "Test Wells",
							on: showTestWells,
							set: setShowTestWells,
						},
						{ id: "tee", label: "Tees", on: showTees, set: setShowTees },
						{
							id: "cross",
							label: "Crosses",
							on: showCrosses,
							set: setShowCrosses,
						},
						{
							id: "callouts",
							label: "Callouts",
							on: showCallouts,
							set: setShowCallouts,
						},
					].map((toggle) => (
						<button
							key={toggle.id}
							onClick={() => toggle.set((prev) => !prev)}
							style={btnStyle(toggle.on)}
							className={cn(
								styles.toggleButton,
								toggle.on
									? styles.toggleButtonActive
									: styles.toggleButtonInactive,
							)}
						>
							{toggle.label}
						</button>
					))}

					<label className={styles.calloutControl}>
						Callout Size
						<input
							type="range"
							min={0.25}
							max={4}
							step={0.1}
							value={calloutScale}
							onChange={(event) =>
								setCalloutScale(Number(event.target.value) || 1.2)
							}
							name="gridgeneratorpreviewcolumn_input_424"
						/>
					</label>
				</div>
			)}

			<div className={styles.previewFrame}>
				{previewMode === "2d" && (
					<GridPreview
						rods={rods}
						conductors={conductors}
						placements={placements}
						layerVisibility={{
							conductors: showConductors,
							rods: showRods,
							testWells: showTestWells,
							tees: showTees,
							crosses: showCrosses,
						}}
						callouts={{
							show: showCallouts,
							scale: calloutScale,
						}}
					/>
				)}
				{previewMode === "3d" && (
					<>
						{!gridPreview3DError && !GridPreview3DComponent && (
							<div className={styles.lazyPanelState}>
								<Progress
									value={34}
									indeterminate
									animated
									size="sm"
									color="accent"
									className={styles.lazyPanelProgress}
								/>
								Loading 3D preview module...
							</div>
						)}
						{gridPreview3DError && (
							<div
								className={`${styles.lazyPanelState} ${styles.lazyPanelStateError}`}
							>
								<div>3D preview module failed to load.</div>
								<div className={styles.lazyPanelDetail}>
									{gridPreview3DError}
									<span className={styles.lazyPanelHelper}>
										Reload the grid or open the log tab for details before
										retrying.
									</span>
								</div>
								<button
									type="button"
									className={styles.lazyPanelRetry}
									onClick={() => {
										setGridPreview3DError(null);
										setGridPreview3DComponent(null);
									}}
									disabled={gridPreview3DLoading}
								>
									Retry
								</button>
							</div>
						)}
						{GridPreview3DComponent && !gridPreview3DError && (
							<GridPreview3DComponent
								rods={rods}
								conductors={conductors}
								placements={placements}
							/>
						)}
					</>
				)}
				{previewMode === "contour" && (
					<PotentialContour
						rods={rods}
						conductors={conductors}
						soilResistivity={soilResistivity}
						faultCurrent={faultCurrent}
					/>
				)}
				{previewMode === "editor" && (
					<GridManualEditor
						rods={rods}
						conductors={conductors}
						placements={placements}
						onRodsChange={onManualRodsChange}
						onConductorsChange={onManualConductorsChange}
						onPlacementsChange={onManualPlacementsChange}
					/>
				)}
			</div>

			{hasPlacements &&
				(() => {
					const testWellCount = placements.filter(
						(placement) => placement.type === "GROUND_ROD_WITH_TEST_WELL",
					).length;
					const rodOnlyCount = rods.length - testWellCount;
					return (
						<div className={styles.statsGrid}>
							{[
								{ label: "Ground Rods", value: rodOnlyCount, color: "#22c55e" },
								{ label: "Test Wells", value: testWellCount, color: "#ef4444" },
								{
									label: "Conductors",
									value: conductors.length,
									color: "#f59e0b",
								},
								{ label: "Tees", value: teeCount, color: "#3b82f6" },
								{ label: "Crosses", value: crossCount, color: "#06b6d4" },
							].map((stat) => (
								<div
									key={stat.label}
									className={styles.statCard}
									style={
										{
											"--gg-stat-color": stat.color,
										} as CSSProperties
									}
								>
									<div className={styles.statValue}>{stat.value}</div>
									<div className={styles.statLabel}>{stat.label}</div>
								</div>
							))}
						</div>
					);
				})()}

			{showPlotPreview && (
				<div className={styles.plotModalBackdrop}>
					<div className={styles.plotModal}>
						<div className={styles.plotTitle}>Pre-Plot Validation and Diff</div>
						<div className={styles.plotSubtitle}>
							{plotDiffPreview.hasBaseline
								? "Comparing current grid against last successful AutoCAD plot."
								: "No prior plot baseline found. This will be treated as first plot."}
						</div>

						<div className={styles.plotStatsGrid}>
							{[
								{
									label: "Conductors Added",
									value: plotDiffPreview.conductorsAdded,
									color: "#22c55e",
								},
								{
									label: "Conductors Removed",
									value: plotDiffPreview.conductorsRemoved,
									color: "#ef4444",
								},
								{
									label: "Placements Added",
									value: plotDiffPreview.placementsAdded,
									color: "#22c55e",
								},
								{
									label: "Placements Removed",
									value: plotDiffPreview.placementsRemoved,
									color: "#ef4444",
								},
								{
									label: "Rotation Changes",
									value: plotDiffPreview.placementsRotationChanged,
									color: "#f59e0b",
								},
								{
									label: "Type Swaps",
									value: plotDiffPreview.placementTypeSwaps,
									color: "#3b82f6",
								},
							].map((stat) => (
								<div
									key={stat.label}
									className={styles.plotStatCard}
									style={
										{
											"--gg-stat-color": stat.color,
										} as CSSProperties
									}
								>
									<div className={styles.plotStatValue}>{stat.value}</div>
									<div className={styles.plotStatLabel}>{stat.label}</div>
								</div>
							))}
						</div>

						<div className={styles.issueList}>
							{plotDiffPreview.issues.length === 0 ? (
								<div className={styles.issueOk}>No blocking issues found.</div>
							) : (
								plotDiffPreview.issues.map((issue, idx) => (
									<div
										key={`${issue.severity}-${idx}`}
										className={styles.issueItem}
										style={
											{
												"--gg-issue-color":
													issue.severity === "error"
														? "#ef4444"
														: issue.severity === "warning"
															? "#f59e0b"
															: "#10b981",
											} as CSSProperties
										}
									>
										[{issue.severity.toUpperCase()}] {issue.message}
									</div>
								))
							)}
						</div>

						<div className={styles.plotActions}>
							<button
								onClick={() => setShowPlotPreview(false)}
								style={btnStyle()}
							>
								Cancel
							</button>
							<button
								onClick={() => {
									setShowPlotPreview(false);
									onPlotToAutoCad();
								}}
								disabled={!plotDiffPreview.canPlot}
								style={{
									...btnStyle(plotDiffPreview.canPlot),
									opacity: plotDiffPreview.canPlot ? 1 : 0.45,
								}}
							>
								Confirm Plot
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
