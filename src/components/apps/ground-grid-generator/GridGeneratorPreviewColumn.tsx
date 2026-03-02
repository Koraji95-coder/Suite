import {
	Box,
	FileSpreadsheet,
	FileText,
	Loader,
	Monitor,
	PenTool,
	Play,
	Redo2,
	Undo2,
	Zap,
} from "lucide-react";
import type { CSSProperties } from "react";
import { hexToRgba } from "@/lib/palette";
import type { PreviewMode } from "./GridGeneratorPanelModels";
import { GridManualEditor } from "./GridManualEditor";
import { GridPreview } from "./GridPreview";
import { GridPreview3D } from "./GridPreview3D";
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
	segmentCount: number;
	teeCount: number;
	crossCount: number;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
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
	segmentCount,
	teeCount,
	crossCount,
	rods,
	conductors,
	placements,
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
	onPreviewModeChange,
	onSoilResistivityChange,
	onFaultCurrentChange,
	onManualRodsChange,
	onManualConductorsChange,
	onManualPlacementsChange,
}: GridGeneratorPreviewColumnProps) {
	const hasPlacements = placements.length > 0;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button
					onClick={onRunGeneration}
					disabled={generating || conductors.length === 0}
					style={{
						...btnStyle(true),
						background: `linear-gradient(135deg, ${hexToRgba("#f59e0b", 0.25)}, ${hexToRgba("#ea580c", 0.2)})`,
						borderColor: hexToRgba("#f59e0b", 0.4),
						color: paletteText,
						opacity: conductors.length === 0 ? 0.5 : 1,
					}}
				>
					{generating ? (
						<Loader size={14} className="animate-spin" />
					) : (
						<Play size={14} />
					)}
					Generate Grid
				</button>

				<button
					onClick={onUndo}
					disabled={!canUndo}
					style={{ ...btnStyle(), opacity: canUndo ? 1 : 0.4 }}
				>
					<Undo2 size={14} />
				</button>
				<button
					onClick={onRedo}
					disabled={!canRedo}
					style={{ ...btnStyle(), opacity: canRedo ? 1 : 0.4 }}
				>
					<Redo2 size={14} />
				</button>

				{hasPlacements && (
					<>
						<button onClick={onExportExcel} style={btnStyle()}>
							<FileSpreadsheet size={14} /> Excel
						</button>
						<button onClick={onExportPdf} style={btnStyle()}>
							<FileText size={14} /> PDF
						</button>
						<button
							onClick={onPlotToAutoCad}
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

			<div style={{ display: "flex", gap: 4 }}>
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
						style={{
							...btnStyle(previewMode === tab.id),
							padding: "4px 10px",
							fontSize: 11,
							borderRadius: "6px 6px 0 0",
						}}
					>
						{tab.icon} {tab.label}
					</button>
				))}
			</div>

			{previewMode === "contour" && (
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "center",
						fontSize: 11,
						color: paletteTextMuted,
					}}
				>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						Soil Resistivity:
						<input
							type="number"
							value={soilResistivity}
							onChange={(e) =>
								onSoilResistivityChange(Number(e.target.value) || 0)
							}
							style={{
								width: 70,
								padding: "3px 6px",
								fontSize: 11,
								fontFamily: "monospace",
								background: hexToRgba(paletteSurfaceLight, 0.3),
								border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
								borderRadius: 4,
								color: paletteText,
								outline: "none",
							}}
						/>
						ohm-m
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						Fault Current:
						<input
							type="number"
							value={faultCurrent}
							onChange={(e) =>
								onFaultCurrentChange(Number(e.target.value) || 0)
							}
							style={{
								width: 70,
								padding: "3px 6px",
								fontSize: 11,
								fontFamily: "monospace",
								background: hexToRgba(paletteSurfaceLight, 0.3),
								border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
								borderRadius: 4,
								color: paletteText,
								outline: "none",
							}}
						/>
						A
					</label>
				</div>
			)}

			<div
				style={{
					borderRadius: 10,
					border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
					background: hexToRgba(paletteSurfaceLight, 0.15),
					flex: 1,
					minHeight: 400,
					overflow: "hidden",
				}}
			>
				{previewMode === "2d" && (
					<GridPreview
						rods={rods}
						conductors={conductors}
						placements={placements}
						segmentCount={segmentCount}
					/>
				)}
				{previewMode === "3d" && (
					<GridPreview3D
						rods={rods}
						conductors={conductors}
						placements={placements}
					/>
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
						(placement) => placement.type === "GROUND_ROD_TEST_WELL",
					).length;
					const rodOnlyCount = rods.length - testWellCount;
					return (
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(5, 1fr)",
								gap: 8,
							}}
						>
							{[
								{ label: "Ground Rods", value: rodOnlyCount, color: "#22c55e" },
								{ label: "Test Wells", value: testWellCount, color: "#ef4444" },
								{ label: "Segments", value: segmentCount, color: "#f59e0b" },
								{ label: "Tees", value: teeCount, color: "#3b82f6" },
								{ label: "Crosses", value: crossCount, color: "#06b6d4" },
							].map((stat) => (
								<div
									key={stat.label}
									style={{
										padding: "10px 12px",
										borderRadius: 8,
										border: `1px solid ${hexToRgba(stat.color, 0.2)}`,
										background: hexToRgba(stat.color, 0.06),
										textAlign: "center",
									}}
								>
									<div
										style={{
											fontSize: 20,
											fontWeight: 700,
											color: stat.color,
											fontVariantNumeric: "tabular-nums",
										}}
									>
										{stat.value}
									</div>
									<div
										style={{
											fontSize: 10,
											color: paletteTextMuted,
											marginTop: 2,
										}}
									>
										{stat.label}
									</div>
								</div>
							))}
						</div>
					);
				})()}
		</div>
	);
}
