import type { Point2D } from "./conduitRouteTypes";
import { TERMINAL_LAYOUT_CONFIG } from "./conduitTerminalData";
import type {
	TerminalGeometryPrimitive,
	TerminalLayoutConfig,
	TerminalLayoutResult,
	TerminalNode,
	TerminalScanData,
	TerminalStripLayout,
} from "./conduitTerminalTypes";

interface GridPoint {
	x: number;
	y: number;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Bounds2D {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

interface PathNode {
	x: number;
	y: number;
	g: number;
	f: number;
	px: number;
	py: number;
}

interface LabelBucket {
	L?: string[];
	R?: string[];
	C?: string[];
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalizeRange(value: number, min: number, max: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
		return 0.5;
	}
	const span = max - min;
	if (Math.abs(span) <= 1e-6) {
		return 0.5;
	}
	return clamp((value - min) / span, 0, 1);
}

function pointInRect(point: Point2D, rect: Rect): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.w &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.h
	);
}

function gridKey(x: number, y: number): string {
	return `${x},${y}`;
}

function toGrid(
	point: Point2D,
	step: number,
	cols: number,
	rows: number,
): GridPoint {
	return {
		x: clamp(Math.round(point.x / step), 0, cols - 1),
		y: clamp(Math.round(point.y / step), 0, rows - 1),
	};
}

function fromGrid(point: GridPoint, step: number): Point2D {
	return { x: point.x * step, y: point.y * step };
}

function geometryBounds(
	geometry: TerminalGeometryPrimitive[] | undefined,
): Bounds2D | null {
	if (!Array.isArray(geometry) || geometry.length === 0) {
		return null;
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let hasPoint = false;

	for (const primitive of geometry) {
		if (!Array.isArray(primitive.points)) continue;
		for (const point of primitive.points) {
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
			hasPoint = true;
			minX = Math.min(minX, point.x);
			minY = Math.min(minY, point.y);
			maxX = Math.max(maxX, point.x);
			maxY = Math.max(maxY, point.y);
		}
	}

	if (!hasPoint) {
		return null;
	}
	return { minX, minY, maxX, maxY };
}

function mapWorldToCanvas(
	point: Point2D,
	params: {
		worldMinX: number;
		worldMaxX: number;
		worldMinY: number;
		worldMaxY: number;
		padding: number;
		usableWidth: number;
		usableHeight: number;
	},
): Point2D {
	const { worldMinX, worldMaxX, worldMinY, worldMaxY, padding, usableWidth, usableHeight } =
		params;
	return {
		x:
			padding +
			normalizeRange(point.x, worldMinX, worldMaxX) * Math.max(1, usableWidth),
		y:
			padding +
			normalizeRange(point.y, worldMinY, worldMaxY) * Math.max(1, usableHeight),
	};
}

function mapGeometryToCanvas(
	geometry: TerminalGeometryPrimitive[] | undefined,
	params: {
		worldMinX: number;
		worldMaxX: number;
		worldMinY: number;
		worldMaxY: number;
		padding: number;
		usableWidth: number;
		usableHeight: number;
	},
): TerminalGeometryPrimitive[] {
	if (!Array.isArray(geometry) || geometry.length === 0) {
		return [];
	}

	const out: TerminalGeometryPrimitive[] = [];
	for (const primitive of geometry) {
		if (!Array.isArray(primitive.points) || primitive.points.length < 2) continue;

		const mappedPoints = primitive.points
			.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
			.map((point) =>
				mapWorldToCanvas(point, {
					worldMinX: params.worldMinX,
					worldMaxX: params.worldMaxX,
					worldMinY: params.worldMinY,
					worldMaxY: params.worldMaxY,
					padding: params.padding,
					usableWidth: params.usableWidth,
					usableHeight: params.usableHeight,
				}),
			);
		if (mappedPoints.length < 2) continue;

		out.push({
			kind: primitive.kind,
			points: mappedPoints,
			closed: Boolean(primitive.closed),
		});
	}
	return out;
}

function sideTerminalX(strip: TerminalStripLayout): number {
	if (strip.side === "L") {
		return strip.px + strip.width * 0.16;
	}
	if (strip.side === "R") {
		return strip.px + strip.width * 0.84;
	}
	return strip.px + strip.width * 0.5;
}

function hasAnyLabel(labels: string[] | undefined): boolean {
	if (!Array.isArray(labels) || labels.length === 0) {
		return false;
	}
	return labels.some((label) => typeof label === "string" && label.trim().length > 0);
}

function normalizeLabelArray(
	labels: string[] | undefined,
	terminalCount: number,
): string[] {
	const count = Math.max(1, terminalCount);
	const out = Array.from({ length: count }, (_, index) => {
		const raw = labels?.[index];
		return typeof raw === "string" ? raw : "";
	});
	return out;
}

function stripBlockRect(strip: TerminalStripLayout, inflateBy = 7): Rect {
	return {
		x: strip.px - inflateBy,
		y: strip.py - inflateBy * 0.75,
		w: strip.width + inflateBy * 2,
		h: strip.height + inflateBy * 1.5,
	};
}

function simplifyPath(path: Point2D[]): Point2D[] {
	if (path.length <= 2) return path;
	const simplified: Point2D[] = [path[0]];
	for (let index = 1; index < path.length - 1; index += 1) {
		const prev = simplified[simplified.length - 1];
		const current = path[index];
		const next = path[index + 1];
		const dx1 = Math.sign(current.x - prev.x);
		const dy1 = Math.sign(current.y - prev.y);
		const dx2 = Math.sign(next.x - current.x);
		const dy2 = Math.sign(next.y - current.y);
		if (dx1 !== dx2 || dy1 !== dy2) {
			simplified.push(current);
		}
	}
	simplified.push(path[path.length - 1]);
	return simplified;
}

export function buildTerminalLayout(
	scanData: TerminalScanData,
	config: TerminalLayoutConfig = TERMINAL_LAYOUT_CONFIG,
): TerminalLayoutResult {
	const strips: TerminalStripLayout[] = [];
	const terminals: TerminalNode[] = [];
	const sharedLabelsByStrip = new Map<string, LabelBucket>();

	const canvasWidth = config.gridWidth * config.scale + config.padding * 2;
	const canvasHeight = config.gridHeight * config.scale + config.padding * 2;

	const stripDrafts: Array<{
		base: Omit<TerminalStripLayout, "px" | "py" | "xLabel" | "yLabel">;
		rawX: number;
		rawY: number;
		syntheticWidth: number;
		syntheticHeight: number;
		geometryWorld?: TerminalGeometryPrimitive[];
		geometryWorldBounds: Bounds2D | null;
	}> = [];

	for (const [panelId, panel] of Object.entries(scanData.panels)) {
		for (const [side, sideData] of Object.entries(panel.sides)) {
			const sideKey = side.toUpperCase();
			for (const strip of sideData.strips) {
				const syntheticHeight = Math.max(
					config.terminalSpacing * (strip.terminalCount - 1),
					config.terminalRadius * 2 + 6,
				);
				const normalizedLabels = normalizeLabelArray(
					strip.terminalLabels,
					strip.terminalCount,
				);
				if (hasAnyLabel(normalizedLabels)) {
					const bucketKey = `${panelId}|${strip.stripNumber}|${strip.terminalCount}`;
					const bucket = sharedLabelsByStrip.get(bucketKey) ?? {};
					if (sideKey === "L") {
						bucket.L = normalizedLabels;
					} else if (sideKey === "R") {
						bucket.R = normalizedLabels;
					} else {
						bucket.C = normalizedLabels;
					}
					sharedLabelsByStrip.set(bucketKey, bucket);
				}
				const geometryWorld = Array.isArray(strip.geometry)
					? strip.geometry
					: undefined;
				stripDrafts.push({
					base: {
						...strip,
						terminalLabels: normalizedLabels,
						panelId,
						panelFullName: panel.fullName,
						panelColor: panel.color,
						side,
						width: config.stripWidth,
						height: syntheticHeight,
					},
					rawX: strip.x,
					rawY: strip.y,
					syntheticWidth: config.stripWidth,
					syntheticHeight,
					geometryWorld,
					geometryWorldBounds: geometryBounds(geometryWorld),
				});
			}
		}
	}

	for (const draft of stripDrafts) {
		if (hasAnyLabel(draft.base.terminalLabels)) {
			continue;
		}

		const sideKey = draft.base.side.toUpperCase();
		const bucketKey = `${draft.base.panelId}|${draft.base.stripNumber}|${draft.base.terminalCount}`;
		const bucket = sharedLabelsByStrip.get(bucketKey);
		if (!bucket) {
			continue;
		}

		let mirrorLabels: string[] | undefined;
		if (sideKey === "L") {
			mirrorLabels = bucket.R ?? bucket.C;
		} else if (sideKey === "R") {
			mirrorLabels = bucket.L ?? bucket.C;
		} else {
			mirrorLabels = bucket.L ?? bucket.R;
		}

		if (hasAnyLabel(mirrorLabels)) {
			draft.base.terminalLabels = normalizeLabelArray(
				mirrorLabels,
				draft.base.terminalCount,
			);
		}
	}

	const worldBounds = stripDrafts.flatMap((draft) => {
		const bounds: Bounds2D[] = [
			{
				minX: draft.rawX,
				minY: draft.rawY,
				maxX: draft.rawX,
				maxY: draft.rawY,
			},
		];
		if (draft.geometryWorldBounds) {
			bounds.push(draft.geometryWorldBounds);
		}
		return bounds;
	});

	const minX =
		worldBounds.length > 0
			? Math.min(...worldBounds.map((bounds) => bounds.minX))
			: 0;
	const maxX =
		worldBounds.length > 0
			? Math.max(...worldBounds.map((bounds) => bounds.maxX))
			: 1;
	const minY =
		worldBounds.length > 0
			? Math.min(...worldBounds.map((bounds) => bounds.minY))
			: 0;
	const maxY =
		worldBounds.length > 0
			? Math.max(...worldBounds.map((bounds) => bounds.maxY))
			: 1;
	const maxStripHeight =
		stripDrafts.length > 0
			? Math.max(...stripDrafts.map((draft) => draft.syntheticHeight))
			: config.terminalRadius * 2 + 6;
	const usableWidth = Math.max(
		1,
		canvasWidth - config.padding * 2 - config.stripWidth,
	);
	const usableHeight = Math.max(
		1,
		canvasHeight - config.padding * 2 - maxStripHeight,
	);

	for (const draft of stripDrafts) {
		const insertionPx = mapWorldToCanvas(
			{ x: draft.rawX, y: draft.rawY },
			{
				worldMinX: minX,
				worldMaxX: maxX,
				worldMinY: minY,
				worldMaxY: maxY,
				padding: config.padding,
				usableWidth,
				usableHeight,
			},
		);
		const geometryPx = mapGeometryToCanvas(draft.geometryWorld, {
			worldMinX: minX,
			worldMaxX: maxX,
			worldMinY: minY,
			worldMaxY: maxY,
			padding: config.padding,
			usableWidth,
			usableHeight,
		});
		const geometryPxBounds = geometryBounds(geometryPx);

		const px = geometryPxBounds ? geometryPxBounds.minX : insertionPx.x;
		const py = geometryPxBounds ? geometryPxBounds.minY : insertionPx.y;
		const width = geometryPxBounds
			? Math.max(8, geometryPxBounds.maxX - geometryPxBounds.minX)
			: draft.syntheticWidth;
		const height = geometryPxBounds
			? Math.max(config.terminalRadius * 2 + 6, geometryPxBounds.maxY - geometryPxBounds.minY)
			: draft.syntheticHeight;

		const strip: TerminalStripLayout = {
			...draft.base,
			width,
			height,
			geometryPx: geometryPx.length > 0 ? geometryPx : undefined,
			xLabel: px + width / 2,
			yLabel: py - 9,
			px,
			py,
		};
		strips.push(strip);

		const terminalX = sideTerminalX(strip);
		const rowSpacing = geometryPxBounds
			? Math.max(height / Math.max(1, strip.terminalCount), config.terminalSpacing)
			: config.terminalSpacing;

		for (
			let terminalIndex = 0;
			terminalIndex < strip.terminalCount;
			terminalIndex += 1
		) {
			const termId = `T${String(terminalIndex + 1).padStart(2, "0")}`;
			const customLabelRaw = strip.terminalLabels?.[terminalIndex];
			const customLabel =
				typeof customLabelRaw === "string" ? customLabelRaw.trim() : "";
			const y = geometryPxBounds
				? py + rowSpacing * (terminalIndex + 0.5)
				: py + terminalIndex * rowSpacing;
			terminals.push({
				id: `${strip.stripId}:${termId}`,
				stripId: strip.stripId,
				panelId: strip.panelId,
				panelColor: strip.panelColor,
				side: strip.side,
				termId,
				index: terminalIndex,
				label: customLabel || `${strip.stripId}:${termId}`,
				x: terminalX,
				y,
			});
		}
	}

	return { canvasWidth, canvasHeight, strips, terminals };
}

export function terminalAnchorPoint(
	from: Point2D,
	to: Point2D,
	margin = 10,
): { start: Point2D; end: Point2D } {
	const leftToRight = from.x <= to.x;
	const start = {
		x: from.x + (leftToRight ? margin : -margin),
		y: from.y,
	};
	const end = {
		x: to.x + (leftToRight ? -margin : margin),
		y: to.y,
	};
	return { start, end };
}

export function terminalLeadPoint(
	terminal: TerminalNode,
	target: Point2D,
	leadLength = 24,
): Point2D {
	if (terminal.side === "L") {
		return { x: terminal.x - leadLength, y: terminal.y };
	}
	if (terminal.side === "R") {
		return { x: terminal.x + leadLength, y: terminal.y };
	}

	const towardRight = target.x >= terminal.x;
	return {
		x: terminal.x + (towardRight ? leadLength : -leadLength),
		y: terminal.y,
	};
}

export function routeTerminalPath(
	start: Point2D,
	end: Point2D,
	strips: TerminalStripLayout[],
	canvasWidth: number,
	canvasHeight: number,
): Point2D[] {
	const step = 8;
	const cols = Math.max(2, Math.ceil(canvasWidth / step));
	const rows = Math.max(2, Math.ceil(canvasHeight / step));
	const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

	for (const strip of strips) {
		const blockedRect = stripBlockRect(strip, 8);
		const x0 = clamp(Math.floor(blockedRect.x / step), 0, cols - 1);
		const y0 = clamp(Math.floor(blockedRect.y / step), 0, rows - 1);
		const x1 = clamp(
			Math.ceil((blockedRect.x + blockedRect.w) / step),
			0,
			cols - 1,
		);
		const y1 = clamp(
			Math.ceil((blockedRect.y + blockedRect.h) / step),
			0,
			rows - 1,
		);
		for (let row = y0; row <= y1; row += 1) {
			for (let col = x0; col <= x1; col += 1) {
				const world = fromGrid({ x: col, y: row }, step);
				const closeToStart =
					Math.hypot(world.x - start.x, world.y - start.y) <= 12;
				const closeToEnd = Math.hypot(world.x - end.x, world.y - end.y) <= 12;
				if (closeToStart || closeToEnd) continue;
				if (pointInRect(world, blockedRect)) {
					grid[row][col] = 999;
				}
			}
		}
	}

	const startCell = toGrid(start, step, cols, rows);
	const endCell = toGrid(end, step, cols, rows);
	const open: PathNode[] = [
		{
			x: startCell.x,
			y: startCell.y,
			g: 0,
			f: 0,
			px: -1,
			py: -1,
		},
	];
	const closed = new Set<string>();
	const gScores = new Map<string, number>([
		[gridKey(startCell.x, startCell.y), 0],
	]);
	const parents = new Map<
		string,
		{ x: number; y: number; px: number; py: number }
	>();
	const dirs: Array<{ dx: number; dy: number }> = [
		{ dx: 1, dy: 0 },
		{ dx: -1, dy: 0 },
		{ dx: 0, dy: 1 },
		{ dx: 0, dy: -1 },
	];

	let iterations = 0;
	const maxIterations = cols * rows * 2;
	while (open.length > 0 && iterations < maxIterations) {
		iterations += 1;
		open.sort((a, b) => a.f - b.f);
		const current = open.shift();
		if (!current) break;
		const currentKey = gridKey(current.x, current.y);
		if (closed.has(currentKey)) continue;
		closed.add(currentKey);

		if (current.x === endCell.x && current.y === endCell.y) {
			const path: Point2D[] = [];
			let walkKey = currentKey;
			let walkX = current.x;
			let walkY = current.y;
			path.unshift(fromGrid({ x: walkX, y: walkY }, step));
			while (parents.has(walkKey)) {
				const parent = parents.get(walkKey);
				if (!parent) break;
				path.unshift(fromGrid({ x: parent.x, y: parent.y }, step));
				walkX = parent.x;
				walkY = parent.y;
				walkKey = gridKey(parent.x, parent.y);
			}
			path[0] = start;
			path[path.length - 1] = end;
			return simplifyPath(path);
		}

		for (const { dx, dy } of dirs) {
			const nx = current.x + dx;
			const ny = current.y + dy;
			if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
			if (grid[ny][nx] >= 999) continue;
			const nextKey = gridKey(nx, ny);
			if (closed.has(nextKey)) continue;

			let movementCost = 1;
			if (current.px >= 0) {
				const prevDx = current.x - current.px;
				const prevDy = current.y - current.py;
				if (prevDx !== dx || prevDy !== dy) {
					movementCost += 3.2;
				}
			}

			const tentativeG = current.g + movementCost;
			const prevBest = gScores.get(nextKey);
			if (prevBest !== undefined && tentativeG >= prevBest) continue;

			gScores.set(nextKey, tentativeG);
			parents.set(nextKey, {
				x: current.x,
				y: current.y,
				px: current.px,
				py: current.py,
			});
			const h = Math.abs(nx - endCell.x) + Math.abs(ny - endCell.y);
			open.push({
				x: nx,
				y: ny,
				g: tentativeG,
				f: tentativeG + h,
				px: current.x,
				py: current.y,
			});
		}
	}

	const midpointX = (start.x + end.x) / 2;
	return [start, { x: midpointX, y: start.y }, { x: midpointX, y: end.y }, end];
}

export function terminalPathLength(path: Point2D[]): number {
	let total = 0;
	for (let index = 1; index < path.length; index += 1) {
		total += Math.hypot(
			path[index].x - path[index - 1].x,
			path[index].y - path[index - 1].y,
		);
	}
	return total;
}

export function terminalBendCount(path: Point2D[]): number {
	let bends = 0;
	for (let index = 2; index < path.length; index += 1) {
		const dx1 = Math.sign(path[index - 1].x - path[index - 2].x);
		const dy1 = Math.sign(path[index - 1].y - path[index - 2].y);
		const dx2 = Math.sign(path[index].x - path[index - 1].x);
		const dy2 = Math.sign(path[index].y - path[index - 1].y);
		if (dx1 !== dx2 || dy1 !== dy2) {
			bends += 1;
		}
	}
	return bends;
}

export function toTerminalRouteSvg(path: Point2D[]): string {
	if (path.length < 2) return "";
	const points = simplifyPath(path);
	if (points.length < 2) return "";

	let svgPath = `M ${points[0].x} ${points[0].y}`;
	const preferredRadius = 11;

	for (let index = 1; index < points.length - 1; index += 1) {
		const prev = points[index - 1];
		const current = points[index];
		const next = points[index + 1];

		const inX = current.x - prev.x;
		const inY = current.y - prev.y;
		const outX = next.x - current.x;
		const outY = next.y - current.y;
		const inLen = Math.hypot(inX, inY);
		const outLen = Math.hypot(outX, outY);
		if (inLen < 0.5 || outLen < 0.5) {
			svgPath += ` L ${current.x} ${current.y}`;
			continue;
		}

		const inUx = inX / inLen;
		const inUy = inY / inLen;
		const outUx = outX / outLen;
		const outUy = outY / outLen;
		const dot = inUx * outUx + inUy * outUy;
		const cross = inUx * outUy - inUy * outUx;

		if (Math.abs(cross) <= 0.001 || dot <= -0.999) {
			svgPath += ` L ${current.x} ${current.y}`;
			continue;
		}

		const cornerRadius = Math.min(
			preferredRadius,
			inLen * 0.45,
			outLen * 0.45,
		);
		if (cornerRadius < 1.1) {
			svgPath += ` L ${current.x} ${current.y}`;
			continue;
		}

		const entryX = current.x - inUx * cornerRadius;
		const entryY = current.y - inUy * cornerRadius;
		const exitX = current.x + outUx * cornerRadius;
		const exitY = current.y + outUy * cornerRadius;
		const sweep = cross > 0 ? 1 : 0;
		svgPath +=
			` L ${entryX} ${entryY}` +
			` A ${cornerRadius} ${cornerRadius} 0 0 ${sweep} ${exitX} ${exitY}`;
	}

	const last = points[points.length - 1];
	svgPath += ` L ${last.x} ${last.y}`;
	return svgPath;
}
