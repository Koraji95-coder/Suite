import type { Point2D } from "./conduitRouteTypes";
import { TERMINAL_LAYOUT_CONFIG } from "./conduitTerminalData";
import type {
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

interface PathNode {
	x: number;
	y: number;
	g: number;
	f: number;
	px: number;
	py: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
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

	const canvasWidth = config.gridWidth * config.scale + config.padding * 2;
	const canvasHeight = config.gridHeight * config.scale + config.padding * 2;

	for (const [panelId, panel] of Object.entries(scanData.panels)) {
		for (const [side, sideData] of Object.entries(panel.sides)) {
			for (const strip of sideData.strips) {
				const px = config.padding + strip.x * config.scale;
				const py = config.padding + strip.y * config.scale;
				const height = Math.max(
					config.terminalSpacing * (strip.terminalCount - 1),
					config.terminalRadius * 2 + 6,
				);
				const width = config.stripWidth;

				strips.push({
					...strip,
					panelId,
					panelFullName: panel.fullName,
					panelColor: panel.color,
					side,
					xLabel: px + width / 2,
					yLabel: py - 9,
					px,
					py,
					width,
					height,
				});

				for (
					let terminalIndex = 0;
					terminalIndex < strip.terminalCount;
					terminalIndex += 1
				) {
					const termId = `T${String(terminalIndex + 1).padStart(2, "0")}`;
					const y = py + terminalIndex * config.terminalSpacing;
					const x = px + width / 2;
					terminals.push({
						id: `${strip.stripId}:${termId}`,
						stripId: strip.stripId,
						panelId,
						panelColor: panel.color,
						side,
						termId,
						index: terminalIndex,
						label: `${strip.stripId}:${termId}`,
						x,
						y,
					});
				}
			}
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
	let svgPath = `M ${path[0].x} ${path[0].y}`;
	for (let index = 1; index < path.length - 1; index += 1) {
		const prev = path[index - 1];
		const current = path[index];
		const next = path[index + 1];
		const dx1 = Math.sign(current.x - prev.x);
		const dy1 = Math.sign(current.y - prev.y);
		const dx2 = Math.sign(next.x - current.x);
		const dy2 = Math.sign(next.y - current.y);
		if (dx1 === dx2 && dy1 === dy2) {
			svgPath += ` L ${current.x} ${current.y}`;
			continue;
		}
		const radius = 6;
		const ax = current.x - dx1 * radius;
		const ay = current.y - dy1 * radius;
		const bx = current.x + dx2 * radius;
		const by = current.y + dy2 * radius;
		const sweep = dx1 * dy2 - dy1 * dx2 > 0 ? 1 : 0;
		svgPath += ` L ${ax} ${ay} A ${radius} ${radius} 0 0 ${sweep} ${bx} ${by}`;
	}
	svgPath += ` L ${path[path.length - 1].x} ${path[path.length - 1].y}`;
	return svgPath;
}
