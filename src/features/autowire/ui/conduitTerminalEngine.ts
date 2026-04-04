import type { Obstacle, Point2D } from "./conduitRouteTypes";
import { TERMINAL_LAYOUT_CONFIG } from "./conduitTerminalData";
import type {
	TerminalCanvasTransform,
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

interface WorldOrientation {
	mode: "native" | "rotated_cw_90";
	sourceMinX: number;
	sourceMaxX: number;
	sourceMinY: number;
	sourceMaxY: number;
	centerX: number;
	centerY: number;
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
	const geometryColumns = strip.terminalSideColumnsX;
	if (strip.side === "L" && Number.isFinite(geometryColumns?.L)) {
		return Number(geometryColumns?.L);
	}
	if (strip.side === "R" && Number.isFinite(geometryColumns?.R)) {
		return Number(geometryColumns?.R);
	}
	if (Number.isFinite(geometryColumns?.C)) {
		return Number(geometryColumns?.C);
	}
	if (strip.side === "L") {
		return strip.px + strip.width * 0.16;
	}
	if (strip.side === "R") {
		return strip.px + strip.width * 0.84;
	}
	return strip.px + strip.width * 0.5;
}

function stripVisualBounds(strip: TerminalStripLayout): Bounds2D {
	const geometry = geometryBounds(strip.geometryPx);
	if (geometry) {
		return geometry;
	}
	return {
		minX: strip.px,
		minY: strip.py,
		maxX: strip.px + strip.width,
		maxY: strip.py + strip.height,
	};
}

function sortAndDedupe(values: number[], tolerance: number): number[] {
	if (values.length === 0) {
		return [];
	}
	const sorted = [...values].sort((a, b) => a - b);
	const output: number[] = [sorted[0]];
	for (let index = 1; index < sorted.length; index += 1) {
		const candidate = sorted[index];
		if (Math.abs(candidate - output[output.length - 1]) > tolerance) {
			output.push(candidate);
		}
	}
	return output;
}

function defaultRowCenters(
	bounds: Bounds2D,
	terminalCount: number,
): number[] {
	const centers: number[] = [];
	const count = Math.max(1, terminalCount);
	const span = Math.max(1, bounds.maxY - bounds.minY);
	for (let index = 0; index < count; index += 1) {
		centers.push(bounds.minY + ((index + 0.5) / count) * span);
	}
	return centers;
}

function bestWindowByReference(
	values: number[],
	targetCount: number,
	reference: number[],
): number[] {
	if (values.length <= targetCount) {
		return values;
	}
	let bestStart = 0;
	let bestScore = Number.POSITIVE_INFINITY;
	for (let start = 0; start <= values.length - targetCount; start += 1) {
		let score = 0;
		for (let index = 0; index < targetCount; index += 1) {
			score += Math.abs(values[start + index] - reference[index]);
		}
		if (score < bestScore) {
			bestScore = score;
			bestStart = start;
		}
	}
	return values.slice(bestStart, bestStart + targetCount);
}

function deriveStripTerminalAnchors(
	strip: TerminalStripLayout,
): {
	rowCentersY: number[];
	sideColumnsX: { L?: number; R?: number; C?: number };
} {
	const bounds = stripVisualBounds(strip);
	const terminalCount = Math.max(1, strip.terminalCount);
	const defaultRows = defaultRowCenters(bounds, terminalCount);
	const defaultColumns = {
		L: strip.px + strip.width * 0.16,
		R: strip.px + strip.width * 0.84,
		C: strip.px + strip.width * 0.5,
	};

	if (!Array.isArray(strip.geometryPx) || strip.geometryPx.length === 0) {
		return { rowCentersY: defaultRows, sideColumnsX: defaultColumns };
	}

	const axisTolerance = clamp(Math.min(strip.width, strip.height) * 0.02, 0.8, 2.5);
	const minHorizontalLength = Math.max(8, strip.width * 0.3);
	const minVerticalLength = Math.max(8, strip.height * 0.3);
	const horizontalRailsY: number[] = [];
	const verticalRailsX: number[] = [];

	const pushSegment = (a: Point2D, b: Point2D) => {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const length = Math.hypot(dx, dy);
		if (length <= 1e-3) {
			return;
		}
		if (Math.abs(dy) <= axisTolerance && length >= minHorizontalLength) {
			horizontalRailsY.push((a.y + b.y) * 0.5);
		}
		if (Math.abs(dx) <= axisTolerance && length >= minVerticalLength) {
			verticalRailsX.push((a.x + b.x) * 0.5);
		}
	};

	for (const primitive of strip.geometryPx) {
		if (!Array.isArray(primitive.points) || primitive.points.length < 2) {
			continue;
		}
		for (let index = 1; index < primitive.points.length; index += 1) {
			pushSegment(primitive.points[index - 1], primitive.points[index]);
		}
		if (primitive.closed && primitive.points.length > 2) {
			pushSegment(
				primitive.points[primitive.points.length - 1],
				primitive.points[0],
			);
		}
	}

	const dedupeToleranceY = clamp((bounds.maxY - bounds.minY) / 160, 0.8, 3);
	const dedupeToleranceX = clamp((bounds.maxX - bounds.minX) / 120, 0.8, 3);
	const railY = sortAndDedupe(horizontalRailsY, dedupeToleranceY);
	const railX = sortAndDedupe(verticalRailsX, dedupeToleranceX);

	let rowCenters = defaultRows;
	if (railY.length >= terminalCount + 1) {
		let bestStart = 0;
		let bestSpan = Number.NEGATIVE_INFINITY;
		const window = terminalCount + 1;
		for (let start = 0; start <= railY.length - window; start += 1) {
			const span = railY[start + window - 1] - railY[start];
			if (span > bestSpan) {
				bestSpan = span;
				bestStart = start;
			}
		}
		const selectedRails = railY.slice(bestStart, bestStart + window);
		rowCenters = selectedRails
			.slice(0, terminalCount)
			.map((value, index) => (value + selectedRails[index + 1]) * 0.5);
	} else if (railY.length >= 2) {
		const intervalCenters = railY
			.slice(0, railY.length - 1)
			.map((value, index) => (value + railY[index + 1]) * 0.5);
		if (intervalCenters.length >= terminalCount) {
			rowCenters = bestWindowByReference(
				intervalCenters,
				terminalCount,
				defaultRows,
			);
		}
	}

	const sideColumns = { ...defaultColumns };
	if (railX.length >= 2) {
		sideColumns.L = (railX[0] + railX[1]) * 0.5;
		sideColumns.R = (railX[railX.length - 2] + railX[railX.length - 1]) * 0.5;
	}
	if (railX.length >= 4) {
		const midRight = Math.floor(railX.length / 2);
		const midLeft = Math.max(0, midRight - 1);
		sideColumns.C = (railX[midLeft] + railX[midRight]) * 0.5;
	}

	const clampX = (value: number) => clamp(value, bounds.minX, bounds.maxX);
	const clampY = (value: number) => clamp(value, bounds.minY, bounds.maxY);
	return {
		rowCentersY: rowCenters.map(clampY),
		sideColumnsX: {
			L: clampX(sideColumns.L),
			R: clampX(sideColumns.R),
			C: clampX(sideColumns.C),
		},
	};
}

function hasAnyLabel(labels: string[] | undefined): boolean {
	if (!Array.isArray(labels) || labels.length === 0) {
		return false;
	}
	return labels.some((label) => typeof label === "string" && label.trim().length > 0);
}

function normalizeLabelArray(
	_labels: string[] | undefined,
	terminalCount: number,
): string[] {
	const count = Math.max(1, terminalCount);
	const out = Array.from({ length: count }, (_, index) => String(index + 1));
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

function rotateWorldPointClockwise(
	point: Point2D,
	params: { centerX: number; centerY: number },
): Point2D {
	const { centerX, centerY } = params;
	return {
		x: centerX + (point.y - centerY),
		y: centerY - (point.x - centerX),
	};
}

function rotateWorldPointCounterClockwise(
	point: Point2D,
	params: { centerX: number; centerY: number },
): Point2D {
	const { centerX, centerY } = params;
	return {
		x: centerX - (point.y - centerY),
		y: centerY + (point.x - centerX),
	};
}

function orientWorldPoint(point: Point2D, orientation: WorldOrientation): Point2D {
	if (orientation.mode === "rotated_cw_90") {
		return rotateWorldPointClockwise(point, {
			centerX: orientation.centerX,
			centerY: orientation.centerY,
		});
	}
	return point;
}

export function buildTerminalLayout(
	scanData: TerminalScanData,
	config: TerminalLayoutConfig = TERMINAL_LAYOUT_CONFIG,
): TerminalLayoutResult {
	const strips: TerminalStripLayout[] = [];
	const terminals: TerminalNode[] = [];
	const sharedLabelsByStrip = new Map<string, LabelBucket>();
	const baseCanvasWidth = config.gridWidth * config.scale + config.padding * 2;
	const baseCanvasHeight = config.gridHeight * config.scale + config.padding * 2;

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

	const sourceWorldBounds = stripDrafts.flatMap((draft) => {
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

	const sourceMinX =
		sourceWorldBounds.length > 0
			? Math.min(...sourceWorldBounds.map((bounds) => bounds.minX))
			: 0;
	const sourceMaxX =
		sourceWorldBounds.length > 0
			? Math.max(...sourceWorldBounds.map((bounds) => bounds.maxX))
			: 1;
	const sourceMinY =
		sourceWorldBounds.length > 0
			? Math.min(...sourceWorldBounds.map((bounds) => bounds.minY))
			: 0;
	const sourceMaxY =
		sourceWorldBounds.length > 0
			? Math.max(...sourceWorldBounds.map((bounds) => bounds.maxY))
			: 1;
	const sourceSpanX = Math.max(1e-6, sourceMaxX - sourceMinX);
	const sourceSpanY = Math.max(1e-6, sourceMaxY - sourceMinY);
	let rotateVotes = 0;
	let nativeVotes = 0;
	for (const draft of stripDrafts) {
		const bounds = draft.geometryWorldBounds;
		if (!bounds) {
			nativeVotes += 1;
			continue;
		}
		const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
		const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
		if (spanX > spanY) {
			rotateVotes += 1;
		} else {
			nativeVotes += 1;
		}
	}
	const orientationMode: WorldOrientation["mode"] =
		rotateVotes === nativeVotes
			? sourceSpanX > sourceSpanY
				? "rotated_cw_90"
				: "native"
			: rotateVotes > nativeVotes
				? "rotated_cw_90"
				: "native";
	const orientation: WorldOrientation = {
		mode: orientationMode,
		sourceMinX,
		sourceMaxX,
		sourceMinY,
		sourceMaxY,
		centerX: (sourceMinX + sourceMaxX) * 0.5,
		centerY: (sourceMinY + sourceMaxY) * 0.5,
	};

	const orientedPoints: Point2D[] = [];
	for (const draft of stripDrafts) {
		orientedPoints.push(
			orientWorldPoint({ x: draft.rawX, y: draft.rawY }, orientation),
		);
		if (!draft.geometryWorld) {
			continue;
		}
		for (const primitive of draft.geometryWorld) {
			for (const point of primitive.points) {
				if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
					continue;
				}
				orientedPoints.push(orientWorldPoint(point, orientation));
			}
		}
	}

	const orientedMinX =
		orientedPoints.length > 0
			? Math.min(...orientedPoints.map((point) => point.x))
			: sourceMinX;
	const orientedMaxX =
		orientedPoints.length > 0
			? Math.max(...orientedPoints.map((point) => point.x))
			: sourceMaxX;
	const orientedMinY =
		orientedPoints.length > 0
			? Math.min(...orientedPoints.map((point) => point.y))
			: sourceMinY;
	const orientedMaxY =
		orientedPoints.length > 0
			? Math.max(...orientedPoints.map((point) => point.y))
			: sourceMaxY;
	const orientedSpanX = Math.max(1e-6, orientedMaxX - orientedMinX);
	const orientedSpanY = Math.max(1e-6, orientedMaxY - orientedMinY);
	const orientedAspect = orientedSpanX / orientedSpanY;
	const targetArea = baseCanvasWidth * baseCanvasHeight;
	const canvasWidth = clamp(
		Math.sqrt(targetArea * orientedAspect) + config.padding * 0.75,
		560,
		980,
	);
	let canvasHeight = clamp(
		Math.sqrt(targetArea / orientedAspect) + config.padding * 0.75,
		520,
		980,
	);
	if (orientation.mode === "rotated_cw_90" && canvasHeight <= canvasWidth) {
		canvasHeight = Math.min(980, canvasWidth + 140);
	}

	const usableWidth = Math.max(1, canvasWidth - config.padding * 2);
	const usableHeight = Math.max(1, canvasHeight - config.padding * 2);
	const transform: TerminalCanvasTransform = {
		worldMinX: orientedMinX,
		worldMaxX: orientedMaxX,
		worldMinY: orientedMinY,
		worldMaxY: orientedMaxY,
		padding: config.padding,
		usableWidth,
		usableHeight,
		orientation: orientation.mode,
		sourceWorldMinX: sourceMinX,
		sourceWorldMaxX: sourceMaxX,
		sourceWorldMinY: sourceMinY,
		sourceWorldMaxY: sourceMaxY,
		rotationCenterX: orientation.centerX,
		rotationCenterY: orientation.centerY,
	};

	for (const draft of stripDrafts) {
		const orientedInsertion = orientWorldPoint(
			{ x: draft.rawX, y: draft.rawY },
			orientation,
		);
		const orientedGeometryWorld =
			draft.geometryWorld?.map((primitive) => ({
				...primitive,
				points: primitive.points.map((point) =>
					orientWorldPoint(point, orientation),
				),
			})) ?? [];

		const insertionPx = mapWorldToCanvas(orientedInsertion, {
			worldMinX: orientedMinX,
			worldMaxX: orientedMaxX,
			worldMinY: orientedMinY,
			worldMaxY: orientedMaxY,
			padding: config.padding,
			usableWidth,
			usableHeight,
		});
		const geometryPx = mapGeometryToCanvas(orientedGeometryWorld, {
			worldMinX: orientedMinX,
			worldMaxX: orientedMaxX,
			worldMinY: orientedMinY,
			worldMaxY: orientedMaxY,
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
			? Math.max(
					config.terminalRadius * 2 + 6,
					geometryPxBounds.maxY - geometryPxBounds.minY,
				)
			: draft.syntheticHeight;

		const baseStrip: TerminalStripLayout = {
			...draft.base,
			width,
			height,
			geometryPx: geometryPx.length > 0 ? geometryPx : undefined,
			xLabel: px + width * 0.5,
			yLabel: py - 9,
			px,
			py,
		};
		const anchors = deriveStripTerminalAnchors(baseStrip);
		const strip: TerminalStripLayout = {
			...baseStrip,
			terminalRowCentersY: anchors.rowCentersY,
			terminalSideColumnsX: anchors.sideColumnsX,
		};
		strips.push(strip);

		const terminalX = sideTerminalX(strip);
		const stripBounds = stripVisualBounds(strip);
		const fallbackRows = defaultRowCenters(stripBounds, strip.terminalCount);
		const terminalInset = clamp(
			Math.max(config.terminalRadius + 1.5, height * 0.08),
			config.terminalRadius + 1.5,
			12,
		);
		const usableTerminalHeight = Math.max(1, height - terminalInset * 2);

		for (
			let terminalIndex = 0;
			terminalIndex < strip.terminalCount;
			terminalIndex += 1
		) {
			const termId = `T${String(terminalIndex + 1).padStart(2, "0")}`;
			const customLabelRaw = strip.terminalLabels?.[terminalIndex];
			const customLabel =
				typeof customLabelRaw === "string" ? customLabelRaw.trim() : "";
			const heuristicY =
				py +
				terminalInset +
				((terminalIndex + 0.5) / Math.max(1, strip.terminalCount)) *
					usableTerminalHeight;
			const y = clamp(
				strip.terminalRowCentersY?.[terminalIndex] ??
					fallbackRows[terminalIndex] ??
					heuristicY,
				stripBounds.minY,
				stripBounds.maxY,
			);
			terminals.push({
				id: `${strip.stripId}:${termId}`,
				stripId: strip.stripId,
				panelId: strip.panelId,
				panelColor: strip.panelColor,
				side: strip.side,
				termId,
				index: terminalIndex,
				label: customLabel || String(terminalIndex + 1),
				x: terminalX,
				y,
			});
		}
	}

	return {
		canvasWidth,
		canvasHeight,
		transform,
		orientation: orientation.mode,
		strips,
		terminals,
	};
}

export function canvasPointToWorld(
	point: Point2D,
	transform: TerminalCanvasTransform,
): Point2D {
	const width = Math.max(1, transform.usableWidth);
	const height = Math.max(1, transform.usableHeight);
	const nxRaw = (point.x - transform.padding) / width;
	const nyRaw = (point.y - transform.padding) / height;
	const nx = Number.isFinite(nxRaw) ? nxRaw : 0.5;
	const ny = Number.isFinite(nyRaw) ? nyRaw : 0.5;
	const worldSpanX = transform.worldMaxX - transform.worldMinX;
	const worldSpanY = transform.worldMaxY - transform.worldMinY;
	const orientedPoint = {
		x: transform.worldMinX + nx * worldSpanX,
		y: transform.worldMinY + ny * worldSpanY,
	};
	if (transform.orientation === "rotated_cw_90") {
		return rotateWorldPointCounterClockwise(orientedPoint, {
			centerX: transform.rotationCenterX,
			centerY: transform.rotationCenterY,
		});
	}
	return orientedPoint;
}

export function worldPointToCanvas(
	point: Point2D,
	transform: TerminalCanvasTransform,
): Point2D {
	const orientedPoint =
		transform.orientation === "rotated_cw_90"
			? rotateWorldPointClockwise(point, {
					centerX: transform.rotationCenterX,
					centerY: transform.rotationCenterY,
				})
			: point;

	return {
		x:
			transform.padding +
			normalizeRange(orientedPoint.x, transform.worldMinX, transform.worldMaxX) *
				Math.max(1, transform.usableWidth),
		y:
			transform.padding +
			normalizeRange(orientedPoint.y, transform.worldMinY, transform.worldMaxY) *
				Math.max(1, transform.usableHeight),
	};
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

export function terminalStripEdgePoint(
	terminal: TerminalNode,
	strips: TerminalStripLayout[],
	target: Point2D,
): Point2D {
	const strip = strips.find((entry) => entry.stripId === terminal.stripId);
	if (!strip) {
		return { x: terminal.x, y: terminal.y };
	}

	const bounds = stripVisualBounds(strip);
	const y = clamp(terminal.y, bounds.minY, bounds.maxY);
	if (terminal.side === "L") {
		return { x: bounds.minX, y };
	}
	if (terminal.side === "R") {
		return { x: bounds.maxX, y };
	}
	const towardRight = target.x >= terminal.x;
	return {
		x: towardRight ? bounds.maxX : bounds.minX,
		y,
	};
}

export function terminalLeadFromEdge(
	edge: Point2D,
	side: string,
	target: Point2D,
	leadLength = 24,
): Point2D {
	if (side === "L") {
		return { x: edge.x - leadLength, y: edge.y };
	}
	if (side === "R") {
		return { x: edge.x + leadLength, y: edge.y };
	}
	const towardRight = target.x >= edge.x;
	return {
		x: edge.x + (towardRight ? leadLength : -leadLength),
		y: edge.y,
	};
}

function dedupeClosePoints(path: Point2D[], minDistance = 0.1): Point2D[] {
	if (path.length <= 1) return path;
	const output: Point2D[] = [path[0]];
	for (let index = 1; index < path.length; index += 1) {
		const prev = output[output.length - 1];
		const point = path[index];
		if (Math.hypot(point.x - prev.x, point.y - prev.y) >= minDistance) {
			output.push(point);
		}
	}
	return output;
}

export function smoothTerminalPath(
	path: Point2D[],
	cornerRadius = 11,
	segmentsPerCorner = 5,
): Point2D[] {
	const points = dedupeClosePoints(path, 0.05);
	if (points.length < 3) {
		return points;
	}

	const radius = Math.max(1, cornerRadius);
	const segments = clamp(Math.trunc(segmentsPerCorner), 2, 12);
	const smoothed: Point2D[] = [points[0]];

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
			smoothed.push(current);
			continue;
		}

		const inUx = inX / inLen;
		const inUy = inY / inLen;
		const outUx = outX / outLen;
		const outUy = outY / outLen;
		const cross = inUx * outUy - inUy * outUx;
		const dot = inUx * outUx + inUy * outUy;

		if (Math.abs(cross) <= 0.001 || dot <= -0.999) {
			smoothed.push(current);
			continue;
		}

		const fillet = Math.min(radius, inLen * 0.45, outLen * 0.45);
		if (fillet < 0.75) {
			smoothed.push(current);
			continue;
		}

		const entry = {
			x: current.x - inUx * fillet,
			y: current.y - inUy * fillet,
		};
		const exit = {
			x: current.x + outUx * fillet,
			y: current.y + outUy * fillet,
		};
		if (Math.hypot(entry.x - smoothed[smoothed.length - 1].x, entry.y - smoothed[smoothed.length - 1].y) >= 0.05) {
			smoothed.push(entry);
		}

		for (let step = 1; step < segments; step += 1) {
			const t = step / segments;
			const inv = 1 - t;
			const qx = inv * inv * entry.x + 2 * inv * t * current.x + t * t * exit.x;
			const qy = inv * inv * entry.y + 2 * inv * t * current.y + t * t * exit.y;
			const last = smoothed[smoothed.length - 1];
			if (Math.hypot(qx - last.x, qy - last.y) >= 0.05) {
				smoothed.push({ x: qx, y: qy });
			}
		}

		const last = smoothed[smoothed.length - 1];
		if (Math.hypot(exit.x - last.x, exit.y - last.y) >= 0.05) {
			smoothed.push(exit);
		}
	}

	const tail = points[points.length - 1];
	const last = smoothed[smoothed.length - 1];
	if (Math.hypot(tail.x - last.x, tail.y - last.y) >= 0.05) {
		smoothed.push(tail);
	}
	return smoothed;
}

export function routeTerminalPath(
	start: Point2D,
	end: Point2D,
	strips: TerminalStripLayout[],
	canvasWidth: number,
	canvasHeight: number,
	obstacles: Obstacle[] = [],
): Point2D[] {
	const step = 8;
	const cols = Math.max(2, Math.ceil(canvasWidth / step));
	const rows = Math.max(2, Math.ceil(canvasHeight / step));
	const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

	const applyCellCost = (col: number, row: number, value: number) => {
		if (row < 0 || row >= rows || col < 0 || col >= cols) return;
		if (grid[row][col] >= 999) return;
		if (value >= 999) {
			grid[row][col] = 999;
			return;
		}
		if (value < 0) {
			grid[row][col] = grid[row][col] < 0 ? Math.min(grid[row][col], value) : value;
			return;
		}
		grid[row][col] = Math.max(grid[row][col], value);
	};

	const markRectCost = (rect: Rect, value: number, preserveEndpoints = false) => {
		const x0 = clamp(Math.floor(rect.x / step), 0, cols - 1);
		const y0 = clamp(Math.floor(rect.y / step), 0, rows - 1);
		const x1 = clamp(Math.ceil((rect.x + rect.w) / step), 0, cols - 1);
		const y1 = clamp(Math.ceil((rect.y + rect.h) / step), 0, rows - 1);
		for (let row = y0; row <= y1; row += 1) {
			for (let col = x0; col <= x1; col += 1) {
				const world = fromGrid({ x: col, y: row }, step);
				if (!pointInRect(world, rect)) continue;
				if (preserveEndpoints) {
					const closeToStart = Math.hypot(world.x - start.x, world.y - start.y) <= 12;
					const closeToEnd = Math.hypot(world.x - end.x, world.y - end.y) <= 12;
					if (closeToStart || closeToEnd) continue;
				}
				applyCellCost(col, row, value);
			}
		}
	};

	for (const strip of strips) {
		const blockedRect = stripBlockRect(strip, 8);
		markRectCost(blockedRect, 999, true);
	}

	for (const obstacle of obstacles) {
		if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y)) continue;
		if (!Number.isFinite(obstacle.w) || !Number.isFinite(obstacle.h)) continue;
		if (obstacle.w <= 0 || obstacle.h <= 0) continue;

		const baseRect: Rect = {
			x: obstacle.x,
			y: obstacle.y,
			w: obstacle.w,
			h: obstacle.h,
		};
		if (obstacle.type === "fence") {
			continue;
		}
		if (obstacle.type === "trench") {
			markRectCost(baseRect, -0.55);
			continue;
		}

		const hardRect: Rect = {
			x: baseRect.x - 4,
			y: baseRect.y - 4,
			w: baseRect.w + 8,
			h: baseRect.h + 8,
		};
		const softRect: Rect = {
			x: baseRect.x - 10,
			y: baseRect.y - 10,
			w: baseRect.w + 20,
			h: baseRect.h + 20,
		};
		markRectCost(hardRect, 999, true);
		const x0 = clamp(Math.floor(softRect.x / step), 0, cols - 1);
		const y0 = clamp(Math.floor(softRect.y / step), 0, rows - 1);
		const x1 = clamp(Math.ceil((softRect.x + softRect.w) / step), 0, cols - 1);
		const y1 = clamp(Math.ceil((softRect.y + softRect.h) / step), 0, rows - 1);
		for (let row = y0; row <= y1; row += 1) {
			for (let col = x0; col <= x1; col += 1) {
				const world = fromGrid({ x: col, y: row }, step);
				if (!pointInRect(world, softRect) || pointInRect(world, hardRect)) continue;
				applyCellCost(col, row, 1.8);
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
			path.unshift(fromGrid({ x: current.x, y: current.y }, step));
			while (parents.has(walkKey)) {
				const parent = parents.get(walkKey);
				if (!parent) break;
				path.unshift(fromGrid({ x: parent.x, y: parent.y }, step));
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
			const cellCost = grid[ny][nx];
			if (cellCost >= 999) continue;
			const nextKey = gridKey(nx, ny);
			if (closed.has(nextKey)) continue;

			let movementCost = 1 + Math.max(0, cellCost * 2.2);
			if (cellCost < 0) {
				movementCost = Math.max(0.1, movementCost - Math.abs(cellCost));
			}
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
	const points = dedupeClosePoints(path, 0.05);
	if (points.length < 2) return "";
	let svgPath = `M ${points[0].x} ${points[0].y}`;
	for (let index = 1; index < points.length; index += 1) {
		svgPath += ` L ${points[index].x} ${points[index].y}`;
	}
	return svgPath;
}
