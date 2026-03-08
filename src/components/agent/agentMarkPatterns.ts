import type { AgentProfileId } from "./agentProfiles";
import type { AgentMarkState } from "./agentMarkState";

export type MarkExpression = "neutral" | "active" | "focus";
type OverlayPoint = readonly [number, number, number];
type OverlayPointNorm = readonly [number, number, number];
type MarkOverlayFrame = number[][];
type MarkStateFrames = Partial<Record<AgentMarkState, MarkOverlayFrame[]>>;
type FaceStateOverlays = Partial<
	Record<AgentMarkState, readonly OverlayPointNorm[]>
>;

export interface AgentMarkDefinition {
	grid: number[][];
	colors: string[];
	activeOverlay?: number[][];
	focusOverlay?: number[][];
	stateFrames?: MarkStateFrames;
}

type RawMarkDefinition = {
	grid: number[][];
	colors: string[];
	activeOverlay?: number[][];
	focusOverlay?: number[][];
	faceOverlays?: FaceStateOverlays;
	outlineColorIndex?: number;
	heroBrushes?: readonly HeroBrush[];
};

type HeroBrush = {
	row: number;
	col: number;
	radius: number;
	color: number;
	radiusX?: number;
	radiusY?: number;
};

const TARGET_GRID_ROWS = 64;
const TARGET_GRID_COLS = 64;

function clampIndex(value: number, max: number): number {
	return Math.max(0, Math.min(max - 1, value));
}

function denormalizePoints(
	points: readonly OverlayPointNorm[],
	rows: number,
	cols: number,
): OverlayPoint[] {
	return points.map(([rowNorm, colNorm, color]) => {
		const row = clampIndex(Math.round(rowNorm * (rows - 1)), rows);
		const col = clampIndex(Math.round(colNorm * (cols - 1)), cols);
		return [row, col, color] as OverlayPoint;
	});
}

function blankOverlay(rows: number, cols: number): number[][] {
	return Array.from({ length: rows }, () => Array<number>(cols).fill(0));
}

function paintEllipse(
	grid: number[][],
	centerRow: number,
	centerCol: number,
	radiusRow: number,
	radiusCol: number,
	color: number,
): void {
	if (radiusRow <= 0 || radiusCol <= 0 || color <= 0) return;
	const rowStart = Math.max(0, Math.floor(centerRow - radiusRow));
	const rowEnd = Math.min(grid.length - 1, Math.ceil(centerRow + radiusRow));
	const colStart = Math.max(0, Math.floor(centerCol - radiusCol));
	const colEnd = Math.min(grid[0].length - 1, Math.ceil(centerCol + radiusCol));
	const invRow = 1 / Math.max(radiusRow, 0.0001);
	const invCol = 1 / Math.max(radiusCol, 0.0001);

	for (let row = rowStart; row <= rowEnd; row++) {
		const rowDelta = (row - centerRow) * invRow;
		for (let col = colStart; col <= colEnd; col++) {
			const colDelta = (col - centerCol) * invCol;
			if (rowDelta * rowDelta + colDelta * colDelta <= 1) {
				grid[row][col] = color;
			}
		}
	}
}

function buildHeroGrid(
	heroBrushes: readonly HeroBrush[],
	targetRows = TARGET_GRID_ROWS,
	targetCols = TARGET_GRID_COLS,
): number[][] {
	const hero = blankOverlay(targetRows, targetCols);
	for (const brush of heroBrushes) {
		const centerRow = clampIndex(Math.round(brush.row * (targetRows - 1)), targetRows);
		const centerCol = clampIndex(Math.round(brush.col * (targetCols - 1)), targetCols);
		const radiusRow = Math.max(1, Math.round((brush.radiusY ?? brush.radius) * targetRows));
		const radiusCol = Math.max(1, Math.round((brush.radiusX ?? brush.radius) * targetCols));
		paintEllipse(hero, centerRow, centerCol, radiusRow, radiusCol, brush.color);
	}
	return hero;
}

function makeOverlay(
	points: readonly OverlayPoint[],
	rows: number,
	cols: number,
): number[][] {
	const frame = blankOverlay(rows, cols);
	for (const [row, col, color] of points) {
		if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
		frame[row][col] = color;
	}
	return frame;
}

function makeOverlayNorm(
	points: readonly OverlayPointNorm[],
	rows: number,
	cols: number,
): number[][] {
	return makeOverlay(denormalizePoints(points, rows, cols), rows, cols);
}

function mergeOverlay(
	base: number[][] | undefined,
	points: readonly OverlayPoint[],
	rows: number,
	cols: number,
): number[][] {
	const frame = base
		? base.map((row) => [...row])
		: blankOverlay(rows, cols);
	for (const [row, col, color] of points) {
		if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
		frame[row][col] = color;
	}
	return frame;
}

function mergeOverlayNorm(
	base: number[][] | undefined,
	points: readonly OverlayPointNorm[],
	rows: number,
	cols: number,
): number[][] {
	return mergeOverlay(base, denormalizePoints(points, rows, cols), rows, cols);
}

function upscaleGrid(
	base: number[][],
	targetRows = TARGET_GRID_ROWS,
	targetCols = TARGET_GRID_COLS,
): number[][] {
	const sourceRows = base.length;
	const sourceCols = base[0]?.length ?? 0;
	const scaled = blankOverlay(targetRows, targetCols);
	if (sourceRows === 0 || sourceCols === 0) return scaled;

	for (let row = 0; row < targetRows; row++) {
		const sourceRow = Math.floor((row / targetRows) * sourceRows);
		for (let col = 0; col < targetCols; col++) {
			const sourceCol = Math.floor((col / targetCols) * sourceCols);
			scaled[row][col] = base[sourceRow][sourceCol] ?? 0;
		}
	}

	return scaled;
}

function upscaleOverlay(
	overlay: number[][] | undefined,
	targetRows = TARGET_GRID_ROWS,
	targetCols = TARGET_GRID_COLS,
): number[][] | undefined {
	if (!overlay) return undefined;
	return upscaleGrid(overlay, targetRows, targetCols);
}

function neighborCount(grid: number[][], row: number, col: number): number {
	let count = 0;
	for (let r = row - 1; r <= row + 1; r++) {
		for (let c = col - 1; c <= col + 1; c++) {
			if (r === row && c === col) continue;
			if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) continue;
			if ((grid[r]?.[c] ?? 0) > 0) count += 1;
		}
	}
	return count;
}

function enhanceGrid(baseGrid: number[][], maxColorIndex: number): number[][] {
	const next = baseGrid.map((row) => [...row]);
	const rows = baseGrid.length;
	const cols = baseGrid[0]?.length ?? 0;
	if (rows === 0 || cols === 0) return next;
	const hiRes = rows >= 24 && cols >= 24;

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const idx = baseGrid[row][col];
			if (idx <= 0) continue;
			const neighbors = neighborCount(baseGrid, row, col);
			let updated = idx;

			// Crisp contour.
			if (neighbors <= 2) {
				updated = Math.max(1, updated - 1);
			}

			// Fill mass with subtle highlight.
			if (neighbors >= 6) {
				updated = Math.min(maxColorIndex, updated + 1);
			}

			// Top-light pass for a 16-bit look.
			if (
				row <= Math.floor(rows * 0.32) &&
				updated > 1 &&
				neighbors >= 4
			) {
				updated = Math.min(maxColorIndex, updated + 1);
			}

			// 32-bit pass: tiny dithering and directional highlight to smooth ramps.
			if (hiRes && neighbors >= 5 && updated > 1 && updated < maxColorIndex) {
				const shouldDither = (row + col) % 3 === 0;
				const shouldDirectional =
					col >= Math.floor(cols * 0.58) && row <= Math.floor(rows * 0.38);
				if (shouldDither || shouldDirectional) {
					updated = Math.min(maxColorIndex, updated + 1);
				}
			}

			next[row][col] = updated;
		}
	}

	return next;
}

function toneHexColor(hex: string, factor: number): string {
	if (!hex.startsWith("#")) return hex;
	const normalized = hex.length === 4
		? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
		: hex;
	if (normalized.length !== 7) return hex;
	const r = Number.parseInt(normalized.slice(1, 3), 16);
	const g = Number.parseInt(normalized.slice(3, 5), 16);
	const b = Number.parseInt(normalized.slice(5, 7), 16);
	if ([r, g, b].some((value) => Number.isNaN(value))) return hex;
	const apply = (value: number) =>
		Math.max(0, Math.min(255, Math.round(value * factor)));
	const toHex = (value: number) => value.toString(16).padStart(2, "0");
	return `#${toHex(apply(r))}${toHex(apply(g))}${toHex(apply(b))}`;
}

function tonePalette(colors: string[], outlineColorIndex?: number): string[] {
	const lastIndex = colors.length - 1;
	return colors.map((color, index) => {
		if (index === 0 || index === outlineColorIndex || color === "transparent") {
			return color;
		}
		const emphasis = lastIndex > 1 ? index / lastIndex : 0;
		const factor = 0.92 - emphasis * 0.14;
		return toneHexColor(color, factor);
	});
}

function buildStateFrames(
	rows: number,
	cols: number,
	activeOverlay?: number[][],
	focusOverlay?: number[][],
	faceOverlays?: FaceStateOverlays,
	outlineColorIndex?: number,
): MarkStateFrames {
	const faceIdle = faceOverlays?.idle ?? [];
	const faceForState = (state: AgentMarkState): readonly OverlayPointNorm[] => [
		...faceIdle,
		...(faceOverlays?.[state] ?? []),
	];
	const faceOutline = outlineColorIndex ?? 0;
	const withFace = (
		frame: number[][],
		state: AgentMarkState,
	): number[][] => {
		const pointsNorm = faceForState(state);
		if (!pointsNorm.length) return frame;
		const points = denormalizePoints(pointsNorm, rows, cols);
		const next = frame.map((row) => [...row]);

		if (faceOutline > 0) {
			const featureCells = new Set(
				points.map(([row, col]) => `${row}:${col}`),
			);
			const outlineOffsets = [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			] as const;
			for (const [row, col] of points) {
				for (const [rowOffset, colOffset] of outlineOffsets) {
					const neighborRow = row + rowOffset;
					const neighborCol = col + colOffset;
					if (
						neighborRow < 0 ||
						neighborCol < 0 ||
						neighborRow >= rows ||
						neighborCol >= cols
					) {
						continue;
					}
					if (featureCells.has(`${neighborRow}:${neighborCol}`)) continue;
					if (next[neighborRow][neighborCol] === 0) {
						next[neighborRow][neighborCol] = faceOutline;
					}
				}
			}
		}

		for (const [row, col, color] of points) {
			next[row][col] = color;
		}
		return next;
	};

	return {
		idle: [withFace(blankOverlay(rows, cols), "idle")],
		thinking: [
			withFace(
				mergeOverlayNorm(
					activeOverlay,
					[
						[0.27, 0.35, 5],
						[0.27, 0.65, 5],
					],
					rows,
					cols,
				),
				"thinking",
			),
			withFace(
				mergeOverlayNorm(
					activeOverlay,
					[
						[0.27, 0.5, 5],
						[0.5, 0.5, 4],
					],
					rows,
					cols,
				),
				"thinking",
			),
		],
		speaking: [
			withFace(
				mergeOverlayNorm(
					activeOverlay,
					[
						[0.71, 0.42, 4],
						[0.72, 0.5, 5],
						[0.71, 0.58, 4],
					],
					rows,
					cols,
				),
				"speaking",
			),
			withFace(
				mergeOverlayNorm(
					activeOverlay,
					[
						[0.7, 0.34, 4],
						[0.72, 0.5, 5],
						[0.7, 0.66, 4],
					],
					rows,
					cols,
				),
				"speaking",
			),
			withFace(
				mergeOverlayNorm(
					activeOverlay,
					[
						[0.71, 0.42, 5],
						[0.71, 0.58, 5],
						[0.8, 0.5, 4],
					],
					rows,
					cols,
				),
				"speaking",
			),
		],
		running: [
			withFace(
				makeOverlayNorm(
					[
						[0.15, 0.15, 4],
						[0.24, 0.24, 5],
						[0.33, 0.33, 4],
						[0.5, 0.5, 5],
						[0.67, 0.67, 4],
						[0.76, 0.76, 5],
					],
					rows,
					cols,
				),
				"running",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.15, 0.85, 4],
						[0.24, 0.76, 5],
						[0.33, 0.67, 4],
						[0.5, 0.5, 5],
						[0.67, 0.33, 4],
						[0.76, 0.24, 5],
					],
					rows,
					cols,
				),
				"running",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.15, 0.5, 5],
						[0.25, 0.38, 4],
						[0.25, 0.62, 4],
						[0.5, 0.25, 5],
						[0.5, 0.75, 5],
						[0.76, 0.5, 4],
					],
					rows,
					cols,
				),
				"running",
			),
		],
		waiting: [
			withFace(
				makeOverlayNorm(
					[
						[0.28, 0.5, 4],
						[0.5, 0.5, 4],
						[0.74, 0.5, 4],
					],
					rows,
					cols,
				),
				"waiting",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.28, 0.5, 4],
						[0.5, 0.5, 4],
					],
					rows,
					cols,
				),
				"waiting",
			),
		],
		success: [
			withFace(
				makeOverlayNorm(
					[
						[0.42, 0.28, 5],
						[0.5, 0.36, 5],
						[0.58, 0.45, 5],
						[0.5, 0.58, 5],
						[0.42, 0.72, 5],
					],
					rows,
					cols,
				),
				"success",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.42, 0.28, 4],
						[0.5, 0.36, 5],
						[0.58, 0.45, 5],
						[0.5, 0.58, 5],
						[0.42, 0.72, 4],
					],
					rows,
					cols,
				),
				"success",
			),
		],
		warning: [
			withFace(
				makeOverlayNorm(
					[
						[0.28, 0.5, 4],
						[0.4, 0.5, 4],
						[0.52, 0.5, 4],
						[0.74, 0.5, 4],
					],
					rows,
					cols,
				),
				"warning",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.28, 0.5, 5],
						[0.4, 0.5, 5],
						[0.52, 0.5, 5],
						[0.74, 0.5, 5],
					],
					rows,
					cols,
				),
				"warning",
			),
		],
		error: [
			withFace(
				makeOverlayNorm(
					[
						[0.3, 0.3, 3],
						[0.3, 0.7, 3],
						[0.4, 0.4, 3],
						[0.4, 0.6, 3],
						[0.5, 0.5, 3],
						[0.6, 0.4, 3],
						[0.6, 0.6, 3],
						[0.7, 0.3, 3],
						[0.7, 0.7, 3],
					],
					rows,
					cols,
				),
				"error",
			),
			withFace(
				makeOverlayNorm(
					[
						[0.3, 0.3, 2],
						[0.3, 0.7, 2],
						[0.4, 0.4, 2],
						[0.4, 0.6, 2],
						[0.5, 0.5, 2],
						[0.6, 0.4, 2],
						[0.6, 0.6, 2],
						[0.7, 0.3, 2],
						[0.7, 0.7, 2],
					],
					rows,
					cols,
				),
				"error",
			),
		],
		focus: [
			withFace(
				focusOverlay
					? focusOverlay.map((row) => [...row])
					: mergeOverlayNorm(
							activeOverlay,
							[
								[0.28, 0.28, 4],
								[0.28, 0.72, 4],
								[0.7, 0.28, 4],
								[0.7, 0.72, 4],
							],
							rows,
							cols,
						),
				"focus",
			),
			withFace(
				mergeOverlayNorm(
					focusOverlay ?? activeOverlay,
					[
						[0.42, 0.5, 5],
						[0.52, 0.5, 5],
					],
					rows,
					cols,
				),
				"focus",
			),
		],
	};
}

function buildHiResMark(raw: RawMarkDefinition): AgentMarkDefinition {
	const baseGrid =
		raw.heroBrushes && raw.heroBrushes.length > 0
			? buildHeroGrid(raw.heroBrushes, TARGET_GRID_ROWS, TARGET_GRID_COLS)
			: upscaleGrid(raw.grid, TARGET_GRID_ROWS, TARGET_GRID_COLS);
	const tonedColors = tonePalette(raw.colors, raw.outlineColorIndex);
	const maxColorIndex =
		typeof raw.outlineColorIndex === "number" && raw.outlineColorIndex > 1
			? raw.outlineColorIndex - 1
			: tonedColors.length - 1;
	const grid = enhanceGrid(baseGrid, maxColorIndex);
	const activeOverlay = upscaleOverlay(
		raw.activeOverlay,
		TARGET_GRID_ROWS,
		TARGET_GRID_COLS,
	);
	const focusOverlay = upscaleOverlay(
		raw.focusOverlay,
		TARGET_GRID_ROWS,
		TARGET_GRID_COLS,
	);
	return {
		...raw,
		colors: tonedColors,
		grid,
		activeOverlay,
		focusOverlay,
		stateFrames: buildStateFrames(
			TARGET_GRID_ROWS,
			TARGET_GRID_COLS,
			activeOverlay,
			focusOverlay,
			raw.faceOverlays,
			raw.outlineColorIndex,
		),
	};
}

const KORO_RAW: RawMarkDefinition = {
	colors: [
		"transparent",
		"#20102f",
		"#ff4d63",
		"#ff8c5d",
		"#ffbf4a",
		"#ffe28a",
		"#fff1c2",
		"#05060b",
	],
	outlineColorIndex: 7,
	heroBrushes: [
		{ row: 0.48, col: 0.5, radius: 0.17, color: 3 },
		{ row: 0.6, col: 0.5, radius: 0.12, color: 4 },
		{ row: 0.35, col: 0.5, radius: 0.14, color: 3 },
		{ row: 0.29, col: 0.5, radius: 0.1, color: 5 },
		{ row: 0.17, col: 0.36, radius: 0.07, radiusX: 0.055, radiusY: 0.1, color: 2 },
		{ row: 0.17, col: 0.64, radius: 0.07, radiusX: 0.055, radiusY: 0.1, color: 2 },
		{ row: 0.2, col: 0.36, radius: 0.04, color: 4 },
		{ row: 0.2, col: 0.64, radius: 0.04, color: 4 },
		{ row: 0.54, col: 0.31, radius: 0.07, radiusX: 0.05, radiusY: 0.1, color: 2 },
		{ row: 0.54, col: 0.69, radius: 0.07, radiusX: 0.05, radiusY: 0.1, color: 2 },
		{ row: 0.75, col: 0.42, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.75, col: 0.58, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.68, col: 0.5, radius: 0.085, radiusX: 0.11, radiusY: 0.07, color: 3 },
		{ row: 0.59, col: 0.5, radius: 0.05, color: 5 },
	],
	grid: [
		[0, 1, 0, 0, 0, 0, 0, 1, 0],
		[1, 2, 1, 0, 0, 0, 1, 2, 1],
		[1, 3, 2, 1, 0, 1, 2, 3, 1],
		[0, 1, 3, 4, 4, 4, 3, 1, 0],
		[0, 0, 3, 5, 4, 5, 3, 0, 0],
		[0, 0, 1, 3, 3, 3, 1, 0, 0],
		[0, 2, 0, 1, 0, 1, 0, 2, 0],
		[0, 2, 2, 0, 0, 0, 2, 2, 0],
	],
	activeOverlay: [
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 5, 0, 5, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 4, 4, 4, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 3, 3, 0, 0, 0, 3, 3, 0],
	],
	focusOverlay: makeOverlayNorm(
		[
			[0.28, 0.3, 4],
			[0.28, 0.7, 4],
			[0.5, 0.5, 5],
			[0.62, 0.42, 4],
			[0.62, 0.58, 4],
		],
		8,
		9,
	),
	faceOverlays: {
		idle: [
			[0.29, 0.39, 4],
			[0.29, 0.61, 4],
			[0.33, 0.38, 1],
			[0.33, 0.41, 6],
			[0.36, 0.38, 1],
			[0.36, 0.41, 6],
			[0.33, 0.59, 6],
			[0.33, 0.62, 1],
			[0.36, 0.59, 6],
			[0.36, 0.62, 1],
			[0.47, 0.5, 3],
			[0.57, 0.44, 3],
			[0.6, 0.5, 4],
			[0.57, 0.56, 3],
		],
		thinking: [
			[0.24, 0.5, 5],
			[0.31, 0.39, 4],
			[0.31, 0.61, 4],
			[0.35, 0.5, 1],
		],
		speaking: [
			[0.62, 0.46, 3],
			[0.62, 0.54, 3],
			[0.68, 0.5, 6],
			[0.69, 0.5, 4],
		],
		error: [
			[0.32, 0.39, 2],
			[0.32, 0.61, 2],
			[0.36, 0.39, 2],
			[0.36, 0.61, 2],
			[0.5, 0.5, 2],
			[0.58, 0.44, 2],
			[0.58, 0.56, 2],
		],
		success: [
			[0.33, 0.4, 6],
			[0.33, 0.6, 6],
			[0.37, 0.4, 6],
			[0.37, 0.6, 6],
			[0.56, 0.43, 6],
			[0.59, 0.5, 6],
			[0.56, 0.57, 6],
		],
		waiting: [
			[0.31, 0.39, 4],
			[0.31, 0.61, 4],
			[0.55, 0.5, 3],
		],
		running: [
			[0.28, 0.5, 5],
			[0.34, 0.4, 6],
			[0.34, 0.6, 6],
			[0.62, 0.44, 4],
			[0.65, 0.5, 6],
			[0.62, 0.56, 4],
		],
		warning: [
			[0.33, 0.4, 4],
			[0.33, 0.6, 4],
			[0.5, 0.5, 4],
			[0.6, 0.5, 3],
		],
		focus: [
			[0.3, 0.35, 6],
			[0.3, 0.65, 6],
			[0.35, 0.5, 1],
			[0.58, 0.5, 6],
		],
	},
};

const DEVSTRAL_RAW: RawMarkDefinition = {
	colors: [
		"transparent",
		"#0f2a20",
		"#1f7f4c",
		"#29b86b",
		"#67e8a2",
		"#b8ffd8",
		"#edfff5",
		"#05060b",
	],
	outlineColorIndex: 7,
	heroBrushes: [
		{ row: 0.46, col: 0.5, radius: 0.18, color: 3 },
		{ row: 0.58, col: 0.5, radius: 0.13, color: 4 },
		{ row: 0.34, col: 0.5, radius: 0.14, color: 3 },
		{ row: 0.3, col: 0.5, radius: 0.1, color: 5 },
		{ row: 0.22, col: 0.28, radius: 0.06, radiusX: 0.05, radiusY: 0.08, color: 2 },
		{ row: 0.22, col: 0.72, radius: 0.06, radiusX: 0.05, radiusY: 0.08, color: 2 },
		{ row: 0.42, col: 0.24, radius: 0.08, radiusX: 0.06, radiusY: 0.11, color: 2 },
		{ row: 0.42, col: 0.76, radius: 0.08, radiusX: 0.06, radiusY: 0.11, color: 2 },
		{ row: 0.73, col: 0.42, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.73, col: 0.58, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.67, col: 0.5, radius: 0.07, radiusX: 0.11, radiusY: 0.06, color: 3 },
		{ row: 0.56, col: 0.5, radius: 0.05, color: 6 },
	],
	grid: [
		[0, 0, 1, 0, 0, 0, 1, 0, 0],
		[0, 1, 2, 1, 0, 1, 2, 1, 0],
		[1, 2, 3, 3, 3, 3, 3, 2, 1],
		[0, 2, 4, 1, 4, 1, 4, 2, 0],
		[0, 1, 3, 3, 5, 3, 3, 1, 0],
		[0, 0, 2, 3, 3, 3, 2, 0, 0],
		[0, 0, 1, 2, 0, 2, 1, 0, 0],
		[0, 1, 1, 0, 0, 0, 1, 1, 0],
	],
	activeOverlay: [
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 4, 0, 4, 0, 4, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 4, 0, 4, 0, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 3, 0, 3, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
	],
	focusOverlay: makeOverlayNorm(
		[
			[0.28, 0.3, 4],
			[0.28, 0.7, 4],
			[0.42, 0.5, 5],
			[0.62, 0.5, 5],
		],
		8,
		9,
	),
	faceOverlays: {
		idle: [
			[0.29, 0.36, 4],
			[0.29, 0.5, 4],
			[0.29, 0.64, 4],
			[0.34, 0.36, 1],
			[0.34, 0.4, 6],
			[0.34, 0.5, 6],
			[0.34, 0.6, 6],
			[0.34, 0.64, 1],
			[0.38, 0.5, 6],
			[0.57, 0.44, 2],
			[0.6, 0.5, 3],
			[0.57, 0.56, 2],
		],
		thinking: [
			[0.24, 0.5, 4],
			[0.3, 0.36, 5],
			[0.3, 0.64, 5],
			[0.35, 0.5, 1],
		],
		speaking: [
			[0.63, 0.44, 3],
			[0.63, 0.56, 3],
			[0.69, 0.5, 6],
			[0.74, 0.5, 4],
		],
		error: [
			[0.33, 0.36, 2],
			[0.33, 0.64, 2],
			[0.36, 0.36, 2],
			[0.36, 0.64, 2],
			[0.5, 0.5, 2],
			[0.58, 0.44, 2],
			[0.58, 0.56, 2],
		],
		success: [
			[0.33, 0.36, 6],
			[0.33, 0.64, 6],
			[0.37, 0.36, 6],
			[0.37, 0.64, 6],
			[0.57, 0.43, 6],
			[0.6, 0.5, 6],
			[0.57, 0.57, 6],
		],
		waiting: [
			[0.31, 0.36, 4],
			[0.31, 0.64, 4],
			[0.53, 0.5, 3],
		],
		running: [
			[0.27, 0.5, 5],
			[0.33, 0.36, 6],
			[0.33, 0.64, 6],
			[0.61, 0.44, 3],
			[0.64, 0.5, 6],
			[0.61, 0.56, 3],
		],
		warning: [
			[0.33, 0.36, 4],
			[0.33, 0.64, 4],
			[0.5, 0.5, 3],
			[0.58, 0.5, 2],
		],
		focus: [
			[0.29, 0.34, 6],
			[0.29, 0.66, 6],
			[0.36, 0.5, 1],
			[0.58, 0.5, 6],
		],
	},
};

const SENTINEL_RAW: RawMarkDefinition = {
	colors: [
		"transparent",
		"#10243d",
		"#2a4a6d",
		"#4ea8ff",
		"#91ccff",
		"#e5f3ff",
		"#f4fbff",
		"#05060b",
	],
	outlineColorIndex: 7,
	heroBrushes: [
		{ row: 0.45, col: 0.5, radius: 0.19, color: 3 },
		{ row: 0.45, col: 0.5, radius: 0.15, color: 4 },
		{ row: 0.33, col: 0.5, radius: 0.12, color: 5 },
		{ row: 0.25, col: 0.5, radius: 0.07, color: 6 },
		{ row: 0.41, col: 0.29, radius: 0.06, color: 2 },
		{ row: 0.41, col: 0.71, radius: 0.06, color: 2 },
		{ row: 0.58, col: 0.28, radius: 0.055, radiusX: 0.05, radiusY: 0.08, color: 2 },
		{ row: 0.58, col: 0.72, radius: 0.055, radiusX: 0.05, radiusY: 0.08, color: 2 },
		{ row: 0.77, col: 0.41, radius: 0.07, radiusX: 0.05, radiusY: 0.11, color: 2 },
		{ row: 0.77, col: 0.59, radius: 0.07, radiusX: 0.05, radiusY: 0.11, color: 2 },
		{ row: 0.71, col: 0.5, radius: 0.06, radiusX: 0.1, radiusY: 0.055, color: 3 },
	],
	grid: [
		[0, 0, 0, 1, 5, 1, 0, 0, 0],
		[0, 0, 1, 3, 4, 3, 1, 0, 0],
		[0, 1, 3, 4, 5, 4, 3, 1, 0],
		[1, 2, 3, 1, 4, 1, 3, 2, 1],
		[0, 1, 2, 3, 3, 3, 2, 1, 0],
		[0, 0, 1, 2, 3, 2, 1, 0, 0],
		[0, 1, 0, 1, 2, 1, 0, 1, 0],
		[1, 2, 0, 0, 0, 0, 0, 2, 1],
	],
	activeOverlay: [
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 5, 0, 5, 0, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 3, 0, 3, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 3, 0, 0, 0, 0, 0, 3, 0],
	],
	focusOverlay: makeOverlayNorm(
		[
			[0.14, 0.5, 5],
			[0.28, 0.4, 4],
			[0.28, 0.6, 4],
			[0.56, 0.5, 5],
			[0.84, 0.5, 4],
		],
		8,
		9,
	),
	faceOverlays: {
		idle: [
			[0.27, 0.5, 4],
			[0.33, 0.44, 4],
			[0.33, 0.5, 6],
			[0.33, 0.56, 4],
			[0.37, 0.5, 1],
			[0.54, 0.46, 3],
			[0.58, 0.5, 2],
			[0.54, 0.54, 3],
		],
		thinking: [
			[0.3, 0.5, 6],
			[0.34, 0.46, 4],
			[0.34, 0.54, 4],
			[0.24, 0.5, 5],
		],
		speaking: [
			[0.62, 0.46, 3],
			[0.62, 0.54, 3],
			[0.68, 0.5, 4],
		],
		error: [
			[0.33, 0.44, 2],
			[0.33, 0.56, 2],
			[0.37, 0.5, 2],
			[0.52, 0.5, 2],
			[0.58, 0.46, 2],
			[0.58, 0.54, 2],
		],
		success: [
			[0.33, 0.5, 6],
			[0.37, 0.5, 6],
			[0.56, 0.46, 6],
			[0.6, 0.5, 6],
			[0.56, 0.54, 6],
		],
		waiting: [
			[0.31, 0.5, 4],
			[0.52, 0.5, 3],
		],
		running: [
			[0.29, 0.5, 5],
			[0.33, 0.44, 6],
			[0.33, 0.56, 6],
			[0.6, 0.46, 3],
			[0.63, 0.5, 6],
			[0.6, 0.54, 3],
		],
		warning: [
			[0.33, 0.44, 4],
			[0.33, 0.56, 4],
			[0.5, 0.5, 3],
			[0.58, 0.5, 2],
		],
		focus: [
			[0.31, 0.42, 6],
			[0.31, 0.58, 6],
			[0.37, 0.5, 1],
			[0.56, 0.5, 6],
		],
	},
};

const FORGE_RAW: RawMarkDefinition = {
	colors: [
		"transparent",
		"#4a1f02",
		"#b45309",
		"#fb923c",
		"#fbbf24",
		"#ffef9a",
		"#fff8cf",
		"#05060b",
	],
	outlineColorIndex: 7,
	heroBrushes: [
		{ row: 0.5, col: 0.5, radius: 0.18, radiusX: 0.2, radiusY: 0.16, color: 3 },
		{ row: 0.6, col: 0.5, radius: 0.13, radiusX: 0.16, radiusY: 0.12, color: 4 },
		{ row: 0.35, col: 0.5, radius: 0.14, radiusX: 0.16, radiusY: 0.12, color: 3 },
		{ row: 0.3, col: 0.5, radius: 0.09, radiusX: 0.12, radiusY: 0.08, color: 5 },
		{ row: 0.2, col: 0.33, radius: 0.06, radiusX: 0.05, radiusY: 0.09, color: 2 },
		{ row: 0.2, col: 0.67, radius: 0.06, radiusX: 0.05, radiusY: 0.09, color: 2 },
		{ row: 0.49, col: 0.24, radius: 0.08, radiusX: 0.06, radiusY: 0.1, color: 2 },
		{ row: 0.49, col: 0.76, radius: 0.08, radiusX: 0.06, radiusY: 0.1, color: 2 },
		{ row: 0.76, col: 0.41, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.76, col: 0.59, radius: 0.08, radiusX: 0.055, radiusY: 0.11, color: 2 },
		{ row: 0.7, col: 0.5, radius: 0.07, radiusX: 0.12, radiusY: 0.06, color: 3 },
		{ row: 0.56, col: 0.5, radius: 0.05, color: 6 },
	],
	grid: [
		[0, 0, 1, 0, 5, 0, 1, 0, 0],
		[0, 1, 3, 1, 4, 1, 3, 1, 0],
		[1, 2, 3, 4, 5, 4, 3, 2, 1],
		[0, 2, 3, 1, 4, 1, 3, 2, 0],
		[0, 1, 2, 3, 3, 3, 2, 1, 0],
		[0, 0, 1, 2, 3, 2, 1, 0, 0],
		[0, 2, 1, 0, 1, 0, 1, 2, 0],
		[2, 3, 0, 0, 0, 0, 0, 3, 2],
	],
	activeOverlay: [
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 4, 0, 0, 0, 4, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 4, 0, 4, 0, 0, 0],
		[0, 0, 0, 0, 4, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
		[3, 0, 0, 0, 0, 0, 0, 0, 3],
	],
	focusOverlay: makeOverlayNorm(
		[
			[0.14, 0.5, 5],
			[0.28, 0.28, 4],
			[0.28, 0.72, 4],
			[0.56, 0.5, 5],
			[0.84, 0.5, 4],
		],
		8,
		9,
	),
	faceOverlays: {
		idle: [
			[0.29, 0.4, 4],
			[0.29, 0.6, 4],
			[0.34, 0.39, 1],
			[0.34, 0.42, 6],
			[0.37, 0.42, 6],
			[0.34, 0.58, 6],
			[0.34, 0.61, 1],
			[0.37, 0.58, 6],
			[0.5, 0.44, 4],
			[0.56, 0.5, 3],
			[0.5, 0.56, 4],
		],
		thinking: [
			[0.24, 0.5, 5],
			[0.31, 0.4, 4],
			[0.31, 0.6, 4],
			[0.35, 0.5, 1],
		],
		speaking: [
			[0.65, 0.44, 4],
			[0.68, 0.5, 6],
			[0.65, 0.56, 4],
			[0.73, 0.5, 3],
		],
		error: [
			[0.34, 0.4, 2],
			[0.34, 0.6, 2],
			[0.37, 0.4, 2],
			[0.37, 0.6, 2],
			[0.56, 0.5, 2],
			[0.62, 0.44, 2],
			[0.62, 0.56, 2],
		],
		success: [
			[0.34, 0.4, 6],
			[0.34, 0.6, 6],
			[0.38, 0.4, 6],
			[0.38, 0.6, 6],
			[0.58, 0.43, 6],
			[0.61, 0.5, 6],
			[0.58, 0.57, 6],
		],
		waiting: [
			[0.31, 0.4, 4],
			[0.31, 0.6, 4],
			[0.54, 0.5, 3],
		],
		running: [
			[0.27, 0.5, 5],
			[0.34, 0.42, 6],
			[0.34, 0.58, 6],
			[0.62, 0.44, 4],
			[0.66, 0.5, 6],
			[0.62, 0.56, 4],
		],
		warning: [
			[0.34, 0.42, 4],
			[0.34, 0.58, 4],
			[0.52, 0.5, 3],
			[0.6, 0.5, 2],
		],
		focus: [
			[0.3, 0.37, 6],
			[0.3, 0.63, 6],
			[0.37, 0.5, 1],
			[0.58, 0.5, 6],
		],
	},
};

const DRAFTSMITH_RAW: RawMarkDefinition = {
	colors: [
		"transparent",
		"#25183f",
		"#4f34a8",
		"#6d4bde",
		"#9f82ff",
		"#c8b6ff",
		"#ece4ff",
		"#05060b",
	],
	outlineColorIndex: 7,
	heroBrushes: [
		{ row: 0.48, col: 0.5, radius: 0.17, radiusX: 0.16, radiusY: 0.18, color: 3 },
		{ row: 0.58, col: 0.5, radius: 0.12, radiusX: 0.14, radiusY: 0.12, color: 4 },
		{ row: 0.33, col: 0.5, radius: 0.13, radiusX: 0.13, radiusY: 0.11, color: 3 },
		{ row: 0.28, col: 0.5, radius: 0.09, radiusX: 0.1, radiusY: 0.08, color: 5 },
		{ row: 0.2, col: 0.3, radius: 0.055, radiusX: 0.045, radiusY: 0.08, color: 2 },
		{ row: 0.2, col: 0.7, radius: 0.055, radiusX: 0.045, radiusY: 0.08, color: 2 },
		{ row: 0.43, col: 0.24, radius: 0.075, radiusX: 0.055, radiusY: 0.105, color: 2 },
		{ row: 0.43, col: 0.76, radius: 0.075, radiusX: 0.055, radiusY: 0.105, color: 2 },
		{ row: 0.74, col: 0.42, radius: 0.075, radiusX: 0.05, radiusY: 0.11, color: 2 },
		{ row: 0.74, col: 0.58, radius: 0.075, radiusX: 0.05, radiusY: 0.11, color: 2 },
		{ row: 0.68, col: 0.5, radius: 0.07, radiusX: 0.11, radiusY: 0.06, color: 3 },
		{ row: 0.56, col: 0.5, radius: 0.05, color: 6 },
	],
	grid: [
		[0, 0, 1, 1, 5, 1, 1, 0, 0],
		[0, 1, 2, 3, 4, 3, 2, 1, 0],
		[1, 2, 3, 4, 5, 4, 3, 2, 1],
		[1, 3, 4, 1, 4, 1, 4, 3, 1],
		[0, 2, 3, 4, 5, 4, 3, 2, 0],
		[0, 1, 2, 3, 4, 3, 2, 1, 0],
		[1, 2, 1, 0, 1, 0, 1, 2, 1],
		[0, 1, 0, 0, 0, 0, 0, 1, 0],
	],
	activeOverlay: [
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 4, 0, 0, 0, 4, 0, 0],
		[0, 0, 0, 0, 5, 0, 0, 0, 0],
		[0, 0, 0, 4, 0, 4, 0, 0, 0],
		[0, 0, 3, 0, 0, 0, 3, 0, 0],
		[0, 0, 0, 0, 4, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0],
	],
	focusOverlay: makeOverlayNorm(
		[
			[0.14, 0.5, 5],
			[0.28, 0.4, 4],
			[0.28, 0.6, 4],
			[0.56, 0.5, 5],
			[0.7, 0.5, 4],
		],
		8,
		9,
	),
	faceOverlays: {
		idle: [
			[0.29, 0.38, 4],
			[0.29, 0.62, 4],
			[0.34, 0.36, 1],
			[0.34, 0.4, 6],
			[0.34, 0.6, 6],
			[0.34, 0.64, 1],
			[0.38, 0.5, 5],
			[0.55, 0.46, 3],
			[0.6, 0.5, 4],
			[0.55, 0.54, 3],
		],
		thinking: [
			[0.24, 0.5, 4],
			[0.31, 0.38, 5],
			[0.31, 0.62, 5],
			[0.35, 0.5, 1],
		],
		speaking: [
			[0.65, 0.44, 3],
			[0.65, 0.56, 3],
			[0.71, 0.5, 6],
			[0.76, 0.5, 4],
		],
		error: [
			[0.34, 0.38, 2],
			[0.34, 0.62, 2],
			[0.37, 0.38, 2],
			[0.37, 0.62, 2],
			[0.52, 0.5, 2],
			[0.58, 0.46, 2],
			[0.58, 0.54, 2],
		],
		success: [
			[0.34, 0.38, 6],
			[0.34, 0.62, 6],
			[0.38, 0.38, 6],
			[0.38, 0.62, 6],
			[0.58, 0.44, 6],
			[0.62, 0.5, 6],
			[0.58, 0.56, 6],
		],
		waiting: [
			[0.31, 0.38, 4],
			[0.31, 0.62, 4],
			[0.54, 0.5, 3],
		],
		running: [
			[0.27, 0.5, 5],
			[0.34, 0.4, 6],
			[0.34, 0.6, 6],
			[0.6, 0.44, 3],
			[0.64, 0.5, 6],
			[0.6, 0.56, 3],
		],
		warning: [
			[0.34, 0.4, 4],
			[0.34, 0.6, 4],
			[0.52, 0.5, 3],
			[0.6, 0.5, 2],
		],
		focus: [
			[0.3, 0.36, 6],
			[0.3, 0.64, 6],
			[0.37, 0.5, 1],
			[0.58, 0.5, 6],
		],
	},
};

export const AGENT_MARKS: Record<AgentProfileId, AgentMarkDefinition> = {
	koro: buildHiResMark(KORO_RAW),
	devstral: buildHiResMark(DEVSTRAL_RAW),
	sentinel: buildHiResMark(SENTINEL_RAW),
	forge: buildHiResMark(FORGE_RAW),
	draftsmith: buildHiResMark(DRAFTSMITH_RAW),
};
