import { computeGridBounds2D } from "./gridViewUtils";
import type { GridConductor, GridRod } from "./types";

export const RESOLUTION = 80;
const CONTOUR_LEVELS = 12;

export interface ContourBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface HoveredPotentialValue {
	x: number;
	y: number;
	v: number;
}

interface CanvasSize {
	cssW: number;
	cssH: number;
	dpr: number;
	pxW: number;
	pxH: number;
}

export function computeContourBounds(
	rods: GridRod[],
	conductors: GridConductor[],
): ContourBounds {
	return computeGridBounds2D(rods, conductors, { padRatio: 0.3 });
}

export function computePotentialField(
	rods: GridRod[],
	conductors: GridConductor[],
	bounds: ContourBounds,
	soilResistivity: number,
	faultCurrent: number,
): number[][] {
	const field: number[][] = [];
	const spanX = bounds.maxX - bounds.minX;
	const spanY = bounds.maxY - bounds.minY;
	const currentPerRod = rods.length > 0 ? faultCurrent / rods.length : 0;

	for (let j = 0; j < RESOLUTION; j += 1) {
		const row: number[] = [];
		for (let i = 0; i < RESOLUTION; i += 1) {
			const px = bounds.minX + (i / (RESOLUTION - 1)) * spanX;
			const py = bounds.minY + (j / (RESOLUTION - 1)) * spanY;

			let potential = 0;

			for (const rod of rods) {
				const dist = Math.sqrt((px - rod.grid_x) ** 2 + (py - rod.grid_y) ** 2);
				const effectiveDist = Math.max(dist, 0.5);
				potential +=
					(soilResistivity * currentPerRod) / (2 * Math.PI * effectiveDist);
			}

			for (const conductor of conductors) {
				const dx = conductor.x2 - conductor.x1;
				const dy = conductor.y2 - conductor.y1;
				const len = Math.sqrt(dx * dx + dy * dy);
				if (len < 0.01) continue;

				const t = Math.max(
					0,
					Math.min(
						1,
						((px - conductor.x1) * dx + (py - conductor.y1) * dy) / (len * len),
					),
				);
				const closestX = conductor.x1 + t * dx;
				const closestY = conductor.y1 + t * dy;
				const dist = Math.max(
					Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2),
					0.3,
				);

				potential +=
					(soilResistivity * currentPerRod * 0.1) / (2 * Math.PI * dist);
			}

			row.push(potential);
		}
		field.push(row);
	}

	return field;
}

export function getFieldRange(field: number[][]): {
	minVal: number;
	maxVal: number;
} {
	let minVal = Infinity;
	let maxVal = -Infinity;
	for (const row of field) {
		for (const value of row) {
			if (value < minVal) minVal = value;
			if (value > maxVal) maxVal = value;
		}
	}
	return { minVal, maxVal };
}

function potentialToColor(value: number, min: number, max: number): string {
	const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

	if (t < 0.25) {
		const s = t / 0.25;
		return `rgb(${Math.round(34 + s * (59 - 34))}, ${Math.round(
			139 + s * (130 - 139),
		)}, ${Math.round(34 + s * (246 - 34))})`;
	}
	if (t < 0.5) {
		const s = (t - 0.25) / 0.25;
		return `rgb(${Math.round(59 + s * (234 - 59))}, ${Math.round(
			130 + s * (179 - 130),
		)}, ${Math.round(246 + s * (8 - 246))})`;
	}
	if (t < 0.75) {
		const s = (t - 0.5) / 0.25;
		return `rgb(${Math.round(234 + s * (245 - 234))}, ${Math.round(
			179 + s * (158 - 179),
		)}, ${Math.round(8 + s * (11 - 8))})`;
	}
	const s = (t - 0.75) / 0.25;
	return `rgb(${Math.round(245 + s * (239 - 245))}, ${Math.round(
		158 + s * (68 - 158),
	)}, ${Math.round(11 + s * (68 - 11))})`;
}

function getCanvasSize(container: HTMLDivElement): CanvasSize {
	const cssW = container.clientWidth;
	const cssH = container.clientHeight;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	return {
		cssW,
		cssH,
		dpr,
		pxW: Math.max(1, Math.floor(cssW * dpr)),
		pxH: Math.max(1, Math.floor(cssH * dpr)),
	};
}

interface DrawPotentialContourArgs {
	canvas: HTMLCanvasElement;
	container: HTMLDivElement;
	field: number[][];
	bounds: ContourBounds;
	minVal: number;
	maxVal: number;
	conductors: GridConductor[];
	rods: GridRod[];
}

export function drawPotentialContourCanvas({
	canvas,
	container,
	field,
	bounds,
	minVal,
	maxVal,
	conductors,
	rods,
}: DrawPotentialContourArgs) {
	if (field.length === 0) return;

	const { cssW, cssH, dpr, pxW, pxH } = getCanvasSize(container);
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	canvas.width = pxW;
	canvas.height = pxH;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);

	const cellW = cssW / RESOLUTION;
	const cellH = cssH / RESOLUTION;

	for (let j = 0; j < RESOLUTION; j += 1) {
		for (let i = 0; i < RESOLUTION; i += 1) {
			ctx.fillStyle = potentialToColor(field[j][i], minVal, maxVal);
			ctx.globalAlpha = 0.65;
			ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
		}
	}
	ctx.globalAlpha = 1;

	const spanX = bounds.maxX - bounds.minX;
	const spanY = bounds.maxY - bounds.minY;

	ctx.strokeStyle = "#f59e0b";
	ctx.lineWidth = 1.5;
	for (const conductor of conductors) {
		const x1 = ((conductor.x1 - bounds.minX) / spanX) * cssW;
		const y1 = ((conductor.y1 - bounds.minY) / spanY) * cssH;
		const x2 = ((conductor.x2 - bounds.minX) / spanX) * cssW;
		const y2 = ((conductor.y2 - bounds.minY) / spanY) * cssH;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}

	for (const rod of rods) {
		const rx = ((rod.grid_x - bounds.minX) / spanX) * cssW;
		const ry = ((rod.grid_y - bounds.minY) / spanY) * cssH;
		ctx.fillStyle = "#22c55e";
		ctx.beginPath();
		ctx.arc(rx, ry, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	const step = (maxVal - minVal) / CONTOUR_LEVELS;
	ctx.strokeStyle = "rgba(255,255,255,0.2)";
	ctx.lineWidth = 0.5;

	for (let level = 1; level < CONTOUR_LEVELS; level += 1) {
		const threshold = minVal + level * step;
		for (let j = 0; j < RESOLUTION - 1; j += 1) {
			for (let i = 0; i < RESOLUTION - 1; i += 1) {
				const v00 = field[j][i];
				const v10 = field[j][i + 1];
				const v01 = field[j + 1][i];
				const crossH = v00 < threshold !== v10 < threshold;
				const crossV = v00 < threshold !== v01 < threshold;

				if (crossH) {
					const t = (threshold - v00) / (v10 - v00);
					const px = (i + t) * cellW;
					const py = j * cellH;
					ctx.beginPath();
					ctx.arc(px, py, 0.8, 0, Math.PI * 2);
					ctx.stroke();
				}
				if (crossV) {
					const t = (threshold - v00) / (v01 - v00);
					const px = i * cellW;
					const py = (j + t) * cellH;
					ctx.beginPath();
					ctx.arc(px, py, 0.8, 0, Math.PI * 2);
					ctx.stroke();
				}
			}
		}
	}
}
