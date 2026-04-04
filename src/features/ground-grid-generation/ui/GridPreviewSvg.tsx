import type { MouseEventHandler, MutableRefObject } from "react";
import { hexToRgba } from "@/lib/palette";
import { cn } from "@/lib/utils";
import styles from "./GridPreviewSvg.module.css";
import type { GridConductor, GridPlacement, GridRod } from "./types";

type Bounds2D = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

type TextAnchor = "start" | "middle" | "end";

type LabelRect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

type CalloutPlacement = {
	x: number;
	y: number;
	textAnchor: TextAnchor;
};

type CalloutTarget = {
	id: string;
	label: string;
	x: number;
	y: number;
	fallbackDx: number;
	fallbackDy: number;
};

type OccupiedObject = {
	id: string;
	x: number;
	y: number;
	radius: number;
};

function computePointBounds(points: Array<{ x: number; y: number }>): Bounds2D | null {
	if (points.length === 0) return null;
	let minX = points[0].x;
	let maxX = points[0].x;
	let minY = points[0].y;
	let maxY = points[0].y;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minY = Math.min(minY, point.y);
		maxY = Math.max(maxY, point.y);
	}
	return { minX, maxX, minY, maxY };
}

function normalize2D(dx: number, dy: number): { x: number; y: number } {
	const mag = Math.hypot(dx, dy) || 1;
	return { x: dx / mag, y: dy / mag };
}

function toTextAnchor(dx: number): TextAnchor {
	if (dx < -0.25) return "end";
	if (dx > 0.25) return "start";
	return "middle";
}

function estimateTextRect(
	x: number,
	y: number,
	text: string,
	fontSize: number,
	anchor: TextAnchor,
): LabelRect {
	const width = Math.max(fontSize * 0.9, text.length * fontSize * 0.62);
	const height = fontSize * 1.18;
	const left =
		anchor === "start"
			? x
			: anchor === "end"
				? x - width
				: x - width / 2;
	return {
		left,
		top: y - height / 2,
		right: left + width,
		bottom: y + height / 2,
	};
}

function rectsOverlap(a: LabelRect, b: LabelRect, pad: number): boolean {
	return !(
		a.right + pad < b.left ||
		a.left - pad > b.right ||
		a.bottom + pad < b.top ||
		a.top - pad > b.bottom
	);
}

function overlapArea(a: LabelRect, b: LabelRect): number {
	const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
	const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
	return w * h;
}

function getEdgeOutwardDirection(
	x: number,
	y: number,
	bounds: Bounds2D | null,
	tolerance: number,
): { x: number; y: number } | null {
	if (!bounds) return null;
	let dx = 0;
	let dy = 0;
	if (Math.abs(x - bounds.minX) <= tolerance) dx -= 1;
	if (Math.abs(x - bounds.maxX) <= tolerance) dx += 1;
	if (Math.abs(y - bounds.minY) <= tolerance) dy -= 1;
	if (Math.abs(y - bounds.maxY) <= tolerance) dy += 1;
	if (dx === 0 && dy === 0) return null;
	return normalize2D(dx, dy);
}

function buildCandidateDirections(
	fallback: { x: number; y: number },
	outward: { x: number; y: number } | null,
): Array<{ x: number; y: number }> {
	const base = [
		fallback,
		...(outward ? [outward] : []),
		{ x: 1, y: 0 },
		{ x: 0.7071, y: -0.7071 },
		{ x: 0, y: -1 },
		{ x: -0.7071, y: -0.7071 },
		{ x: -1, y: 0 },
		{ x: -0.7071, y: 0.7071 },
		{ x: 0, y: 1 },
		{ x: 0.7071, y: 0.7071 },
	];

	const deduped: Array<{ x: number; y: number }> = [];
	for (const dir of base) {
		const norm = normalize2D(dir.x, dir.y);
		const exists = deduped.some(
			(existing) =>
				Math.abs(existing.x - norm.x) < 0.02 &&
				Math.abs(existing.y - norm.y) < 0.02,
		);
		if (!exists) deduped.push(norm);
	}
	return deduped;
}

function placeCallouts(params: {
	targets: CalloutTarget[];
	occupiedObjects: OccupiedObject[];
	bounds: Bounds2D | null;
	tolerance: number;
	labelSize: number;
	labelOffset: number;
}): Map<string, CalloutPlacement> {
	const {
		targets,
		occupiedObjects,
		bounds,
		tolerance,
		labelSize,
		labelOffset,
	} = params;
	const placements = new Map<string, CalloutPlacement>();
	const occupiedRects: LabelRect[] = [];
	const rectPad = labelSize * 0.35;
	const radii = [labelOffset, labelOffset * 1.35, labelOffset * 1.75];

	for (const target of targets) {
		const fallback = normalize2D(target.fallbackDx, target.fallbackDy);
		const outward = getEdgeOutwardDirection(
			target.x,
			target.y,
			bounds,
			tolerance,
		);
		const directions = buildCandidateDirections(fallback, outward);

		let bestPlacement: CalloutPlacement | null = null;
		let bestRect: LabelRect | null = null;
		let bestScore = Number.NEGATIVE_INFINITY;
		let fallbackPlacement: CalloutPlacement | null = null;
		let fallbackRect: LabelRect | null = null;
		let fallbackOverlap = Number.POSITIVE_INFINITY;

		for (const radius of radii) {
			for (const direction of directions) {
				const x = target.x + direction.x * radius;
				const y = target.y + direction.y * radius;
				const textAnchor = toTextAnchor(direction.x);
				const rect = estimateTextRect(x, y, target.label, labelSize, textAnchor);

				let thisOverlap = 0;
				let collides = false;
				for (const existing of occupiedRects) {
					if (rectsOverlap(rect, existing, rectPad)) {
						collides = true;
						thisOverlap += overlapArea(rect, existing);
					}
				}

				for (const obj of occupiedObjects) {
					if (obj.id === target.id) continue;
					const cx = (rect.left + rect.right) / 2;
					const cy = (rect.top + rect.bottom) / 2;
					const objectGap = Math.hypot(cx - obj.x, cy - obj.y);
					if (objectGap < obj.radius + labelSize * 0.7) {
						collides = true;
					}
				}

				if (collides) {
					if (thisOverlap < fallbackOverlap) {
						fallbackOverlap = thisOverlap;
						fallbackPlacement = { x, y, textAnchor };
						fallbackRect = rect;
					}
					continue;
				}

				const outwardDot = outward
					? outward.x * direction.x + outward.y * direction.y
					: 0;
				const fallbackDot = fallback.x * direction.x + fallback.y * direction.y;
				const score = outwardDot * 2 + fallbackDot + radius / labelOffset;

				if (score > bestScore) {
					bestScore = score;
					bestPlacement = { x, y, textAnchor };
					bestRect = rect;
				}
			}
		}

		if (bestPlacement && bestRect) {
			placements.set(target.id, bestPlacement);
			occupiedRects.push(bestRect);
			continue;
		}

		if (fallbackPlacement && fallbackRect) {
			placements.set(target.id, fallbackPlacement);
			occupiedRects.push(fallbackRect);
			continue;
		}

		const finalFallback = {
			x: target.x + fallback.x * labelOffset,
			y: target.y + fallback.y * labelOffset,
			textAnchor: toTextAnchor(fallback.x),
		};
		placements.set(target.id, finalFallback);
		occupiedRects.push(
			estimateTextRect(
				finalFallback.x,
				finalFallback.y,
				target.label,
				labelSize,
				finalFallback.textAnchor,
			),
		);
	}

	return placements;
}

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
	showCallouts: boolean;
	calloutScale: number;
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
	showCallouts,
	calloutScale,
	onMouseDown,
	onMouseMove,
	onMouseUp,
}: GridPreviewSvgProps) {
	const worldPerPixel = effectiveViewBox.w / 1000;
	const labelSize = Math.max(
		rodScale * (1.2 * calloutScale),
		worldPerPixel * (8 * calloutScale),
	);
	const labelOffset = Math.max(labelSize * 0.8, rodScale * 1.4);
	const calloutBounds = computePointBounds([
		...rods.map((rod) => ({ x: rod.grid_x, y: rod.grid_y })),
		...tees.map((tee) => ({ x: tee.grid_x, y: tee.grid_y })),
		...crosses.map((cross) => ({ x: cross.grid_x, y: cross.grid_y })),
		...testWells.map((testWell) => ({ x: testWell.grid_x, y: testWell.grid_y })),
	]);
	const edgeTolerance = Math.max(worldPerPixel * 10, rodScale * 0.75);

	const conductorTargets: CalloutTarget[] = conductors.map((conductor, index) => {
		const dx = conductor.x2 - conductor.x1;
		const dy = conductor.y2 - conductor.y1;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		const trimmedLabel = (conductor.label || "").trim();
		const calloutLabel =
			trimmedLabel && trimmedLabel.toUpperCase().startsWith("C")
				? trimmedLabel
				: `C${index + 1}`;
		return {
			id: `conductor-${index}`,
			label: calloutLabel,
			x: (conductor.x1 + conductor.x2) / 2,
			y: (conductor.y1 + conductor.y2) / 2,
			fallbackDx: nx,
			fallbackDy: ny,
		};
	});

	const calloutTargets: CalloutTarget[] = [
		...testWells.map((testWell, index) => ({
			id: `testWell-${index}`,
			label: `TW${index + 1}`,
			x: testWell.grid_x,
			y: testWell.grid_y,
			fallbackDx: 1,
			fallbackDy: -0.2,
		})),
		...rods.map((rod, index) => ({
			id: `rod-${index}`,
			label: rod.label,
			x: rod.grid_x,
			y: rod.grid_y,
			fallbackDx: 1,
			fallbackDy: -0.2,
		})),
		...tees.map((tee, index) => ({
			id: `tee-${index}`,
			label: `T${index + 1}`,
			x: tee.grid_x,
			y: tee.grid_y,
			fallbackDx: 1,
			fallbackDy: -0.2,
		})),
		...crosses.map((cross, index) => ({
			id: `cross-${index}`,
			label: `X${index + 1}`,
			x: cross.grid_x,
			y: cross.grid_y,
			fallbackDx: 1,
			fallbackDy: -0.2,
		})),
		...conductorTargets,
	];

	const occupiedObjects: OccupiedObject[] = [
		...testWells.map((testWell, index) => ({
			id: `testWell-${index}`,
			x: testWell.grid_x,
			y: testWell.grid_y,
			radius: rodScale * 1.4,
		})),
		...rods.map((rod, index) => ({
			id: `rod-${index}`,
			x: rod.grid_x,
			y: rod.grid_y,
			radius: rodScale,
		})),
		...tees.map((tee, index) => ({
			id: `tee-${index}`,
			x: tee.grid_x,
			y: tee.grid_y,
			radius: rodScale * 1.2,
		})),
		...crosses.map((cross, index) => ({
			id: `cross-${index}`,
			x: cross.grid_x,
			y: cross.grid_y,
			radius: rodScale * 1.2,
		})),
		...conductorTargets.map((conductor) => ({
			id: conductor.id,
			x: conductor.x,
			y: conductor.y,
			radius: rodScale * 0.8,
		})),
	];

	const calloutPlacements = showCallouts
		? placeCallouts({
				targets: calloutTargets,
				occupiedObjects,
				bounds: calloutBounds,
				tolerance: edgeTolerance,
				labelSize,
				labelOffset,
		  })
		: new Map<string, CalloutPlacement>();

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
			{showCallouts &&
				conductors.map((conductor, index) => {
					const callout = calloutPlacements.get(`conductor-${index}`);
					if (!callout) return null;
					const trimmedLabel = (conductor.label || "").trim();
					const calloutLabel =
						trimmedLabel && trimmedLabel.toUpperCase().startsWith("C")
							? trimmedLabel
							: `C${index + 1}`;
					return (
						<text
							key={`cl-${index}`}
							x={callout.x}
							y={callout.y}
							fontSize={labelSize}
							fill="#fde68a"
							stroke={hexToRgba("#020617", 0.95)}
							strokeWidth={labelSize * 0.22}
							paintOrder="stroke"
							fontWeight={700}
							textAnchor={callout.textAnchor}
							dominantBaseline="middle"
						>
							{calloutLabel}
						</text>
					);
				})}

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
					{showCallouts &&
						(() => {
							const callout = calloutPlacements.get(`rod-${index}`);
							if (!callout) return null;
							return (
								<text
									x={callout.x}
									y={callout.y}
									fontSize={labelSize}
									fill="#f8fafc"
									stroke={hexToRgba("#020617", 0.95)}
									strokeWidth={labelSize * 0.22}
									paintOrder="stroke"
									fontWeight={700}
									textAnchor={callout.textAnchor}
									dominantBaseline="middle"
								>
									{rod.label}
								</text>
							);
						})()}
				</g>
			))}

			{tees.map((tee, index) => {
				const size = rodScale * 1.2;
				const previewRotationDeg = -tee.rotation_deg;
				return (
					<g
						key={`t-${index}`}
						transform={`translate(${tee.grid_x},${tee.grid_y}) rotate(${previewRotationDeg})`}
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
			{showCallouts &&
				tees.map((_, index) => {
					const callout = calloutPlacements.get(`tee-${index}`);
					if (!callout) return null;
					return (
						<text
							key={`tl-${index}`}
							x={callout.x}
							y={callout.y}
							fontSize={labelSize}
							fill="#dbeafe"
							stroke={hexToRgba("#020617", 0.95)}
							strokeWidth={labelSize * 0.22}
							paintOrder="stroke"
							fontWeight={700}
							textAnchor={callout.textAnchor}
							dominantBaseline="middle"
						>
							T{index + 1}
						</text>
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
			{showCallouts &&
				crosses.map((_, index) => {
					const callout = calloutPlacements.get(`cross-${index}`);
					if (!callout) return null;
					return (
						<text
							key={`xl-${index}`}
							x={callout.x}
							y={callout.y}
							fontSize={labelSize}
							fill="#cffafe"
							stroke={hexToRgba("#020617", 0.95)}
							strokeWidth={labelSize * 0.22}
							paintOrder="stroke"
							fontWeight={700}
							textAnchor={callout.textAnchor}
							dominantBaseline="middle"
						>
							X{index + 1}
						</text>
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
						{showCallouts &&
							(() => {
								const callout = calloutPlacements.get(`testWell-${index}`);
								if (!callout) return null;
								return (
									<text
										x={callout.x}
										y={callout.y}
										fontSize={labelSize}
										fill="#fecaca"
										stroke={hexToRgba("#020617", 0.95)}
										strokeWidth={labelSize * 0.22}
										paintOrder="stroke"
										fontWeight={700}
										textAnchor={callout.textAnchor}
										dominantBaseline="middle"
									>
										TW{index + 1}
									</text>
								);
							})()}
					</g>
				);
			})}
		</svg>
	);
}
