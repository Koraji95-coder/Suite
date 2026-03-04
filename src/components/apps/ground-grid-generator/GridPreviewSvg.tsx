import type { MouseEventHandler, MutableRefObject } from "react";
import { hexToRgba } from "@/lib/palette";
import { cn } from "@/lib/utils";
import styles from "./GridPreviewSvg.module.css";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridPreviewSvgProps {
	svgRef: MutableRefObject<SVGSVGElement | null>;
	effectiveViewBox: {
		x: number;
		y: number;
		w: number;
		h: number;
	};
	isPanning: boolean;
	backgroundColor: string;
	rods: GridRod[];
	conductors: GridConductor[];
	tees: GridPlacement[];
	crosses: GridPlacement[];
	testWells: GridPlacement[];
	rodScale: number;
	onMouseDown: MouseEventHandler<SVGSVGElement>;
	onMouseMove: MouseEventHandler<SVGSVGElement>;
	onMouseUp: MouseEventHandler<SVGSVGElement>;
}

export function GridPreviewSvg({
	svgRef,
	effectiveViewBox,
	isPanning,
	backgroundColor,
	rods,
	conductors,
	tees,
	crosses,
	testWells,
	rodScale,
	onMouseDown,
	onMouseMove,
	onMouseUp,
}: GridPreviewSvgProps) {
	return (
		<svg
			ref={svgRef}
			viewBox={`${effectiveViewBox.x} ${effectiveViewBox.y} ${effectiveViewBox.w} ${effectiveViewBox.h}`}
			className={cn(
				styles.root,
				isPanning ? styles.cursorGrabbing : styles.cursorGrab,
			)}
			style={{
				background: hexToRgba(backgroundColor, 0.5),
				WebkitUserSelect: "none",
			}}
			onMouseDown={onMouseDown}
			onMouseMove={onMouseMove}
			onMouseUp={onMouseUp}
			onMouseLeave={onMouseUp}
			onDragStart={(e) => e.preventDefault()}
		>
			{conductors.map((conductor, index) => (
				<line
					key={`c-${index}`}
					x1={conductor.x1}
					y1={conductor.y1}
					x2={conductor.x2}
					y2={conductor.y2}
					stroke={hexToRgba("#f59e0b", 0.5)}
					strokeWidth={rodScale * 0.4}
					strokeLinecap="round"
				>
					<title>
						{conductor.label}: ({conductor.x1},{conductor.y1}) to (
						{conductor.x2},{conductor.y2})
					</title>
				</line>
			))}

			{rods.map((rod, index) => (
				<g key={`r-${index}`}>
					<circle
						cx={rod.grid_x}
						cy={rod.grid_y}
						r={rodScale}
						fill={hexToRgba("#22c55e", 0.3)}
						stroke="#22c55e"
						strokeWidth={rodScale * 0.2}
					/>
					<line
						x1={rod.grid_x - rodScale * 0.7}
						y1={rod.grid_y}
						x2={rod.grid_x + rodScale * 0.7}
						y2={rod.grid_y}
						stroke="#22c55e"
						strokeWidth={rodScale * 0.15}
					/>
					<line
						x1={rod.grid_x}
						y1={rod.grid_y - rodScale * 0.7}
						x2={rod.grid_x}
						y2={rod.grid_y + rodScale * 0.7}
						stroke="#22c55e"
						strokeWidth={rodScale * 0.15}
					/>
					<title>
						{rod.label}: ({rod.grid_x}, {rod.grid_y})
					</title>
				</g>
			))}

			{tees.map((tee, index) => {
				const size = rodScale * 1.2;
				return (
					<g
						key={`t-${index}`}
						transform={`translate(${tee.grid_x},${tee.grid_y}) rotate(${tee.rotation_deg})`}
					>
						<line
							x1={-size}
							y1={0}
							x2={size}
							y2={0}
							stroke="#3b82f6"
							strokeWidth={rodScale * 0.25}
							strokeLinecap="round"
						/>
						<line
							x1={0}
							y1={0}
							x2={0}
							y2={size * 0.8}
							stroke="#3b82f6"
							strokeWidth={rodScale * 0.25}
							strokeLinecap="round"
						/>
						<title>
							TEE: ({tee.grid_x}, {tee.grid_y}) rot={tee.rotation_deg}
						</title>
					</g>
				);
			})}

			{crosses.map((cross, index) => {
				const size = rodScale * 1.2;
				return (
					<g
						key={`x-${index}`}
						transform={`translate(${cross.grid_x},${cross.grid_y})`}
					>
						<line
							x1={-size}
							y1={0}
							x2={size}
							y2={0}
							stroke="#06b6d4"
							strokeWidth={rodScale * 0.25}
							strokeLinecap="round"
						/>
						<line
							x1={0}
							y1={-size}
							x2={0}
							y2={size}
							stroke="#06b6d4"
							strokeWidth={rodScale * 0.25}
							strokeLinecap="round"
						/>
						<title>
							CROSS: ({cross.grid_x}, {cross.grid_y})
						</title>
					</g>
				);
			})}

			{testWells.map((testWell, index) => {
				const size = rodScale * 1.4;
				return (
					<g key={`tw-${index}`}>
						<rect
							x={testWell.grid_x - size}
							y={testWell.grid_y - size}
							width={size * 2}
							height={size * 2}
							fill={hexToRgba("#ef4444", 0.25)}
							stroke="#ef4444"
							strokeWidth={rodScale * 0.2}
							rx={rodScale * 0.15}
						/>
						<circle
							cx={testWell.grid_x}
							cy={testWell.grid_y}
							r={rodScale * 0.6}
							fill={hexToRgba("#ef4444", 0.4)}
							stroke="#ef4444"
							strokeWidth={rodScale * 0.15}
						/>
						<line
							x1={testWell.grid_x - rodScale * 0.4}
							y1={testWell.grid_y}
							x2={testWell.grid_x + rodScale * 0.4}
							y2={testWell.grid_y}
							stroke="#ef4444"
							strokeWidth={rodScale * 0.12}
						/>
						<line
							x1={testWell.grid_x}
							y1={testWell.grid_y - rodScale * 0.4}
							x2={testWell.grid_x}
							y2={testWell.grid_y + rodScale * 0.4}
							stroke="#ef4444"
							strokeWidth={rodScale * 0.12}
						/>
						<title>
							GROUND ROD WITH TEST WELL: ({testWell.grid_x}, {testWell.grid_y})
						</title>
					</g>
				);
			})}
		</svg>
	);
}
