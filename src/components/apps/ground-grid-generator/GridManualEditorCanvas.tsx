import type {
	CSSProperties,
	MouseEvent,
	MutableRefObject,
	WheelEvent,
} from "react";
import { hexToRgba } from "@/lib/palette";
import type { EditorMode } from "./GridManualEditorModels";
import { placementKey } from "./GridManualEditorModels";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridManualEditorCanvasProps {
	svgRef: MutableRefObject<SVGSVGElement | null>;
	viewBox: string;
	mode: EditorMode;
	rodScale: number;
	rods: GridRod[];
	conductors: GridConductor[];
	tees: GridPlacement[];
	crosses: GridPlacement[];
	selectedRod: number | null;
	selectedConductor: number | null;
	selectedTeeKey: string | null;
	selectedCrossKey: string | null;
	conductorStart: { x: number; y: number } | null;
	primaryColor: string;
	backgroundColor: string;
	mutedTextColor: string;
	onSvgClick: (e: MouseEvent<SVGSVGElement>) => void;
	onWheel: (e: WheelEvent<SVGSVGElement>) => void;
	onSelectRod: (index: number) => void;
	onSelectConductor: (index: number) => void;
	onSelectTee: (key: string) => void;
	onSelectCross: (key: string) => void;
}

export function GridManualEditorCanvas({
	svgRef,
	viewBox,
	mode,
	rodScale,
	rods,
	conductors,
	tees,
	crosses,
	selectedRod,
	selectedConductor,
	selectedTeeKey,
	selectedCrossKey,
	conductorStart,
	primaryColor,
	backgroundColor,
	mutedTextColor,
	onSvgClick,
	onWheel,
	onSelectRod,
	onSelectConductor,
	onSelectTee,
	onSelectCross,
}: GridManualEditorCanvasProps) {
	const selectionCursor =
		mode === "select" ? "default" : mode === "delete" ? "crosshair" : "cell";

	const pointerStyle: CSSProperties = {
		cursor: mode === "select" ? "pointer" : undefined,
	};

	return (
		<div
			style={{
				minHeight: 300,
				borderRadius: 8,
				border: `1px solid ${hexToRgba(primaryColor, 0.15)}`,
				overflow: "hidden",
				position: "relative",
				flexShrink: 0,
				height: 350,
			}}
		>
			<svg
				ref={svgRef}
				viewBox={viewBox}
				style={{
					width: "100%",
					height: "100%",
					background: hexToRgba(backgroundColor, 0.5),
					cursor: selectionCursor,
				}}
				onClick={onSvgClick}
				onWheel={onWheel}
			>
				{conductors.map((c, i) => (
					<g key={`c-${i}`}>
						<line
							x1={c.x1}
							y1={c.y1}
							x2={c.x2}
							y2={c.y2}
							stroke={
								selectedConductor === i ? "#fff" : hexToRgba("#f59e0b", 0.6)
							}
							strokeWidth={rodScale * (selectedConductor === i ? 0.8 : 0.4)}
							strokeLinecap="round"
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") onSelectConductor(i);
							}}
							style={pointerStyle}
						/>
						<text
							x={(c.x1 + c.x2) / 2}
							y={(c.y1 + c.y2) / 2 - rodScale * 1}
							fontSize={rodScale * 0.8}
							fill={selectedConductor === i ? "#fff" : mutedTextColor}
							textAnchor="middle"
							style={{ pointerEvents: "none" }}
						>
							{c.label}
						</text>
					</g>
				))}

				{rods.map((r, i) => (
					<g
						key={`r-${i}`}
						onClick={(e) => {
							e.stopPropagation();
							if (mode === "select") onSelectRod(i);
						}}
						style={pointerStyle}
					>
						<circle
							cx={r.grid_x}
							cy={r.grid_y}
							r={rodScale}
							fill={
								selectedRod === i
									? hexToRgba("#fff", 0.3)
									: hexToRgba("#22c55e", 0.3)
							}
							stroke={selectedRod === i ? "#fff" : "#22c55e"}
							strokeWidth={rodScale * 0.2}
						/>
						<line
							x1={r.grid_x - rodScale * 0.7}
							y1={r.grid_y}
							x2={r.grid_x + rodScale * 0.7}
							y2={r.grid_y}
							stroke={selectedRod === i ? "#fff" : "#22c55e"}
							strokeWidth={rodScale * 0.15}
						/>
						<line
							x1={r.grid_x}
							y1={r.grid_y - rodScale * 0.7}
							x2={r.grid_x}
							y2={r.grid_y + rodScale * 0.7}
							stroke={selectedRod === i ? "#fff" : "#22c55e"}
							strokeWidth={rodScale * 0.15}
						/>
						<text
							x={r.grid_x}
							y={r.grid_y - rodScale * 1.4}
							fontSize={rodScale * 0.8}
							fill={selectedRod === i ? "#fff" : mutedTextColor}
							textAnchor="middle"
							style={{ pointerEvents: "none" }}
						>
							{r.label}
						</text>
					</g>
				))}

				{tees.map((p, i) => {
					const key = placementKey(p);
					const isSelected = selectedTeeKey === key;
					return (
						<g
							key={`tee-${i}`}
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") onSelectTee(key);
							}}
							style={pointerStyle}
						>
							<rect
								x={p.grid_x - rodScale * 0.6}
								y={p.grid_y - rodScale * 0.6}
								width={rodScale * 1.2}
								height={rodScale * 1.2}
								fill={
									isSelected
										? hexToRgba("#fff", 0.3)
										: hexToRgba("#3b82f6", 0.3)
								}
								stroke={isSelected ? "#fff" : "#3b82f6"}
								strokeWidth={rodScale * 0.15}
								rx={rodScale * 0.1}
							/>
							<text
								x={p.grid_x}
								y={p.grid_y + rodScale * 0.25}
								fontSize={rodScale * 0.5}
								fill={isSelected ? "#fff" : "#3b82f6"}
								textAnchor="middle"
								style={{ pointerEvents: "none", fontWeight: 700 }}
							>
								T
							</text>
						</g>
					);
				})}

				{crosses.map((p, i) => {
					const key = placementKey(p);
					const isSelected = selectedCrossKey === key;
					return (
						<g
							key={`cross-${i}`}
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") onSelectCross(key);
							}}
							style={pointerStyle}
						>
							<rect
								x={p.grid_x - rodScale * 0.6}
								y={p.grid_y - rodScale * 0.6}
								width={rodScale * 1.2}
								height={rodScale * 1.2}
								fill={
									isSelected
										? hexToRgba("#fff", 0.3)
										: hexToRgba("#06b6d4", 0.3)
								}
								stroke={isSelected ? "#fff" : "#06b6d4"}
								strokeWidth={rodScale * 0.15}
								rx={rodScale * 0.1}
							/>
							<text
								x={p.grid_x}
								y={p.grid_y + rodScale * 0.25}
								fontSize={rodScale * 0.5}
								fill={isSelected ? "#fff" : "#06b6d4"}
								textAnchor="middle"
								style={{ pointerEvents: "none", fontWeight: 700 }}
							>
								+
							</text>
						</g>
					);
				})}

				{conductorStart && (
					<circle
						cx={conductorStart.x}
						cy={conductorStart.y}
						r={rodScale * 0.5}
						fill="#f59e0b"
						opacity={0.8}
					/>
				)}
			</svg>
		</div>
	);
}
