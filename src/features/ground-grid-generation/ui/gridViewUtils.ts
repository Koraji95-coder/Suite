import type { GridConductor, GridRod } from "./types";

export interface GridBounds2D {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface GridViewBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface ComputeGridBoundsOptions {
	fallback?: GridBounds2D;
	padRatio?: number;
	minPad?: number;
}

const DEFAULT_FALLBACK_BOUNDS: GridBounds2D = {
	minX: 0,
	minY: 0,
	maxX: 100,
	maxY: 100,
};

export function computeGridBounds2D(
	rods: GridRod[],
	conductors: GridConductor[],
	options: ComputeGridBoundsOptions = {},
): GridBounds2D {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const rod of rods) {
		minX = Math.min(minX, rod.grid_x);
		minY = Math.min(minY, rod.grid_y);
		maxX = Math.max(maxX, rod.grid_x);
		maxY = Math.max(maxY, rod.grid_y);
	}

	for (const conductor of conductors) {
		minX = Math.min(minX, conductor.x1, conductor.x2);
		minY = Math.min(minY, conductor.y1, conductor.y2);
		maxX = Math.max(maxX, conductor.x1, conductor.x2);
		maxY = Math.max(maxY, conductor.y1, conductor.y2);
	}

	if (!isFinite(minX)) {
		return options.fallback ?? DEFAULT_FALLBACK_BOUNDS;
	}

	const spanX = maxX - minX;
	const spanY = maxY - minY;
	const padRatio = options.padRatio ?? 0;
	const ratioPad = Math.max(spanX, spanY) * padRatio;
	const minPad = options.minPad ?? 0;
	const pad = Math.max(ratioPad, minPad);

	return {
		minX: minX - pad,
		minY: minY - pad,
		maxX: maxX + pad,
		maxY: maxY + pad,
	};
}

export function boundsToViewBox(bounds: GridBounds2D): GridViewBox {
	return {
		x: bounds.minX,
		y: bounds.minY,
		w: bounds.maxX - bounds.minX,
		h: bounds.maxY - bounds.minY,
	};
}

export function zoomBoundsToViewBox(
	bounds: GridBounds2D,
	zoom: number,
): GridViewBox {
	const fullW = bounds.maxX - bounds.minX;
	const fullH = bounds.maxY - bounds.minY;
	const cx = bounds.minX + fullW / 2;
	const cy = bounds.minY + fullH / 2;
	const zW = fullW / zoom;
	const zH = fullH / zoom;

	return {
		x: cx - zW / 2,
		y: cy - zH / 2,
		w: zW,
		h: zH,
	};
}

export function formatViewBox(viewBox: GridViewBox): string {
	return `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
}

export function computeScaleFromBounds(
	bounds: GridBounds2D,
	factor = 0.012,
	zoom = 1,
): number {
	return (
		(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * factor) /
		zoom
	);
}

export function computeScaleFromViewBox(
	viewBox: GridViewBox,
	factor = 0.012,
): number {
	return Math.max(viewBox.w, viewBox.h) * factor;
}

export function clientPointToViewBoxPoint(
	clientX: number,
	clientY: number,
	rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	viewBox: GridViewBox,
): { x: number; y: number } {
	return {
		x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
		y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
	};
}
