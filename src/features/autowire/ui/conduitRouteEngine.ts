import { CANVAS_HEIGHT, CANVAS_WIDTH, GRID_STEP } from "./conduitRouteData";
import type { Obstacle, Point2D, RoutingMode } from "./conduitRouteTypes";

interface CostGrid {
	grid: number[][];
	cols: number;
	rows: number;
	step: number;
}

interface GridPoint {
	x: number;
	y: number;
}

export interface RoutePathResult {
	path: Point2D[];
	valid: boolean;
	fallbackUsed: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function gridKey(x: number, y: number): string {
	return `${x},${y}`;
}

function toGridPoint(
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

function fromGridPoint(point: GridPoint, step: number): Point2D {
	return {
		x: point.x * step,
		y: point.y * step,
	};
}

function inflateObstacle(obstacle: Obstacle, clearance: number) {
	return {
		x: obstacle.x - clearance,
		y: obstacle.y - clearance,
		w: obstacle.w + clearance * 2,
		h: obstacle.h + clearance * 2,
	};
}

function pointInRect(
	point: Point2D,
	rect: { x: number; y: number; w: number; h: number },
): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.w &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.h
	);
}

export function buildCostGrid(
	obstacles: Obstacle[],
	clearance: number,
	mode: RoutingMode,
): CostGrid {
	const step = GRID_STEP;
	const cols = Math.ceil(CANVAS_WIDTH / step);
	const rows = Math.ceil(CANVAS_HEIGHT / step);
	const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

	for (const obstacle of obstacles) {
		if (obstacle.type === "fence") {
			continue;
		}
		if (mode === "schematic" && obstacle.type !== "building") {
			continue;
		}
		if (obstacle.type === "trench") {
			const x0 = clamp(Math.floor(obstacle.x / step), 0, cols - 1);
			const y0 = clamp(Math.floor(obstacle.y / step), 0, rows - 1);
			const x1 = clamp(
				Math.ceil((obstacle.x + obstacle.w) / step),
				0,
				cols - 1,
			);
			const y1 = clamp(
				Math.ceil((obstacle.y + obstacle.h) / step),
				0,
				rows - 1,
			);
			for (let row = y0; row <= y1; row += 1) {
				for (let col = x0; col <= x1; col += 1) {
					if (grid[row]?.[col] === undefined || grid[row][col] >= 999) {
						continue;
					}
					grid[row][col] = Math.min(grid[row][col], -0.55);
				}
			}
			continue;
		}

		const effectiveClearance = mode === "schematic" ? 8 : clearance;
		const hard = inflateObstacle(obstacle, effectiveClearance);
		const soft = inflateObstacle(obstacle, effectiveClearance * 1.75);

		const hardX0 = clamp(Math.floor(hard.x / step), 0, cols - 1);
		const hardY0 = clamp(Math.floor(hard.y / step), 0, rows - 1);
		const hardX1 = clamp(Math.ceil((hard.x + hard.w) / step), 0, cols - 1);
		const hardY1 = clamp(Math.ceil((hard.y + hard.h) / step), 0, rows - 1);
		for (let row = hardY0; row <= hardY1; row += 1) {
			for (let col = hardX0; col <= hardX1; col += 1) {
				grid[row][col] = 999;
			}
		}

		const softX0 = clamp(Math.floor(soft.x / step), 0, cols - 1);
		const softY0 = clamp(Math.floor(soft.y / step), 0, rows - 1);
		const softX1 = clamp(Math.ceil((soft.x + soft.w) / step), 0, cols - 1);
		const softY1 = clamp(Math.ceil((soft.y + soft.h) / step), 0, rows - 1);
		for (let row = softY0; row <= softY1; row += 1) {
			for (let col = softX0; col <= softX1; col += 1) {
				if (grid[row][col] >= 999) {
					continue;
				}
				const world = fromGridPoint({ x: col, y: row }, step);
				if (!pointInRect(world, soft) || pointInRect(world, hard)) {
					continue;
				}
				grid[row][col] = Math.max(grid[row][col], 1.8);
			}
		}
	}

	return { grid, cols, rows, step };
}

export function routePath(
	start: Point2D,
	end: Point2D,
	costGrid: CostGrid,
	mode: RoutingMode,
): RoutePathResult {
	const { cols, rows, step, grid } = costGrid;
	const startCell = toGridPoint(start, step, cols, rows);
	const endCell = toGridPoint(end, step, cols, rows);
	const turnPenalty = mode === "schematic" ? 2.4 : 4.8;
	const maxIterations = cols * rows * 3;

	const open: Array<{
		x: number;
		y: number;
		g: number;
		f: number;
		px: number;
		py: number;
	}> = [{ x: startCell.x, y: startCell.y, g: 0, f: 0, px: -1, py: -1 }];

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
	while (open.length > 0 && iterations < maxIterations) {
		iterations += 1;
		open.sort((a, b) => a.f - b.f);
		const current = open.shift();
		if (!current) {
			break;
		}
		const currentKey = gridKey(current.x, current.y);
		if (closed.has(currentKey)) {
			continue;
		}
		closed.add(currentKey);

		if (current.x === endCell.x && current.y === endCell.y) {
			const path: Point2D[] = [];
			let walkKey = currentKey;
			path.unshift(fromGridPoint({ x: current.x, y: current.y }, step));
			while (parents.has(walkKey)) {
				const parent = parents.get(walkKey);
				if (!parent) {
					break;
				}
				path.unshift(fromGridPoint({ x: parent.x, y: parent.y }, step));
				walkKey = gridKey(parent.x, parent.y);
			}
			path[0] = start;
			path[path.length - 1] = end;
			return {
				path: simplifyPath(path),
				valid: true,
				fallbackUsed: false,
			};
		}

		for (const { dx, dy } of dirs) {
			const nx = current.x + dx;
			const ny = current.y + dy;
			if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
				continue;
			}
			if (grid[ny][nx] >= 999) {
				continue;
			}
			const nextKey = gridKey(nx, ny);
			if (closed.has(nextKey)) {
				continue;
			}

			let movementCost = 1 + Math.max(0, grid[ny][nx] * 2.2);
			if (grid[ny][nx] < 0) {
				movementCost = Math.max(0.1, movementCost - Math.abs(grid[ny][nx]));
			}

			if (current.px >= 0) {
				const prevDx = current.x - current.px;
				const prevDy = current.y - current.py;
				if (prevDx !== dx || prevDy !== dy) {
					movementCost += turnPenalty;
				}
			}

			const tentativeG = current.g + movementCost;
			const prevBest = gScores.get(nextKey);
			if (prevBest !== undefined && tentativeG >= prevBest) {
				continue;
			}

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
	return {
		path: [start, { x: midpointX, y: start.y }, { x: midpointX, y: end.y }, end],
		valid: false,
		fallbackUsed: true,
	};
}

export function simplifyPath(path: Point2D[]): Point2D[] {
	if (path.length <= 2) {
		return path;
	}
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

export function pathLength(path: Point2D[]): number {
	let total = 0;
	for (let index = 1; index < path.length; index += 1) {
		total += Math.hypot(
			path[index].x - path[index - 1].x,
			path[index].y - path[index - 1].y,
		);
	}
	return total;
}

export function bendCount(path: Point2D[]): number {
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

export function routeTagPosition(
	path: Point2D[],
	text: string,
): {
	text: string;
	position: Point2D;
	angleDeg: number;
} {
	if (path.length < 2) {
		return { text, position: path[0] ?? { x: 0, y: 0 }, angleDeg: 0 };
	}
	let longestIndex = 0;
	let longestLength = -1;
	for (let index = 0; index < path.length - 1; index += 1) {
		const length = Math.hypot(
			path[index + 1].x - path[index].x,
			path[index + 1].y - path[index].y,
		);
		if (length > longestLength) {
			longestLength = length;
			longestIndex = index;
		}
	}
	const a = path[longestIndex];
	const b = path[longestIndex + 1];
	let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
	if (angle > 90) {
		angle -= 180;
	}
	if (angle < -90) {
		angle += 180;
	}
	return {
		text,
		position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
		angleDeg: angle,
	};
}

export function toRoundedPathSvg(path: Point2D[]): string {
	if (path.length < 2) {
		return "";
	}
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
		const radius = 7;
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
