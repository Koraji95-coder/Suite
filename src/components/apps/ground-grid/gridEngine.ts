import type {
	Direction,
	GridConductor,
	GridConfig,
	GridPlacement,
	GridRod,
	Line2D,
	Point2D,
} from "./types";

const EPS_MATCH = 1e-6;
const INCHES_PER_FOOT = 12.0;

function quant(v: number, nd = 6): number {
	return Math.round(v * 10 ** nd);
}

function qpt(p: Point2D, nd = 6): string {
	return `${quant(p[0], nd)},${quant(p[1], nd)}`;
}

function isH(line: Line2D): boolean {
	const [[x1, y1], [x2, y2]] = line;
	return Math.abs(y1 - y2) <= EPS_MATCH && Math.abs(x1 - x2) > EPS_MATCH;
}

function isV(line: Line2D): boolean {
	const [[x1, y1], [x2, y2]] = line;
	return Math.abs(x1 - x2) <= EPS_MATCH && Math.abs(y1 - y2) > EPS_MATCH;
}

function lineBounds(line: Line2D): [number, number, number, number] {
	const [[x1, y1], [x2, y2]] = line;
	return [
		Math.min(x1, x2),
		Math.max(x1, x2),
		Math.min(y1, y2),
		Math.max(y1, y2),
	];
}

export function parseRodsText(txt: string): GridRod[] {
	const rods: GridRod[] = [];
	let idx = 0;
	for (const raw of txt.split("\n")) {
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const parts = trimmed.replace(/,/g, "\t").split(/\s+/).filter(Boolean);
		if (parts.length < 3) continue;
		const label = parts[0];
		const x = parseFloat(parts[parts.length - 2]);
		const y = parseFloat(parts[parts.length - 1]);
		const depth = parts.length >= 7 ? parseFloat(parts[1]) : 20;
		const diameter = parts.length >= 7 ? parseFloat(parts[4]) : 1.5;
		if (isNaN(x) || isNaN(y)) continue;
		rods.push({
			label,
			grid_x: x,
			grid_y: y,
			depth,
			diameter,
			sort_order: idx++,
		});
	}
	return rods;
}

export function parseConductorsText(txt: string): GridConductor[] {
	const conductors: GridConductor[] = [];
	let idx = 0;
	for (const raw of txt.split("\n")) {
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const parts = trimmed.replace(/,/g, "\t").split(/\s+/).filter(Boolean);
		if (parts.length < 8) continue;
		const label = parts[1];
		const length = parseFloat(parts[2]);
		const x1 = parseFloat(parts[3]);
		const y1 = parseFloat(parts[4]);
		const x2 = parseFloat(parts[6]);
		const y2 = parseFloat(parts[7]);
		const diameter = parseFloat(parts[5]) || 1.5;
		if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue;
		conductors.push({
			label,
			length: isNaN(length) ? null : length,
			x1,
			y1,
			x2,
			y2,
			diameter,
			sort_order: idx++,
		});
	}
	return conductors;
}

export function findIntersectionPoints(lines: Line2D[]): Map<string, Point2D> {
	const pts = new Map<string, Point2D>();
	const hs = lines.filter(isH);
	const vs = lines.filter(isV);

	for (const [a, b] of lines) {
		pts.set(qpt(a), a);
		pts.set(qpt(b), b);
	}

	for (const h of hs) {
		const [hx1, hx2, hy1] = lineBounds(h);
		const y = hy1;
		for (const v of vs) {
			const [vx1, , vy1, vy2] = lineBounds(v);
			const x = vx1;
			if (
				x >= hx1 - EPS_MATCH &&
				x <= hx2 + EPS_MATCH &&
				y >= vy1 - EPS_MATCH &&
				y <= vy2 + EPS_MATCH
			) {
				const p: Point2D = [x, y];
				pts.set(qpt(p), p);
			}
		}
	}

	return pts;
}

export function splitLinesAtPoints(
	lines: Line2D[],
	pts: Map<string, Point2D>,
): Line2D[] {
	const atomic: Line2D[] = [];
	const allPts = Array.from(pts.values());

	for (const ln of lines) {
		const [bx1, bx2, by1, by2] = lineBounds(ln);

		if (isH(ln)) {
			const y = ln[0][1];
			const xs: number[] = [];
			for (const [px, py] of allPts) {
				if (
					Math.abs(py - y) <= EPS_MATCH &&
					px >= bx1 - EPS_MATCH &&
					px <= bx2 + EPS_MATCH
				) {
					xs.push(px);
				}
			}
			xs.sort((a, b) => a - b);
			const unique = [...new Set(xs)];
			for (let i = 1; i < unique.length; i++) {
				if (Math.abs(unique[i] - unique[i - 1]) > EPS_MATCH) {
					atomic.push([
						[unique[i - 1], y],
						[unique[i], y],
					]);
				}
			}
		} else if (isV(ln)) {
			const x = ln[0][0];
			const ys: number[] = [];
			for (const [px, py] of allPts) {
				if (
					Math.abs(px - x) <= EPS_MATCH &&
					py >= by1 - EPS_MATCH &&
					py <= by2 + EPS_MATCH
				) {
					ys.push(py);
				}
			}
			ys.sort((a, b) => a - b);
			const unique = [...new Set(ys)];
			for (let i = 1; i < unique.length; i++) {
				if (Math.abs(unique[i] - unique[i - 1]) > EPS_MATCH) {
					atomic.push([
						[x, unique[i - 1]],
						[x, unique[i]],
					]);
				}
			}
		}
	}

	const seen = new Set<string>();
	const out: Line2D[] = [];
	for (const [a, b] of atomic) {
		const ka = qpt(a);
		const kb = qpt(b);
		const key = ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push([a, b]);
		}
	}
	return out;
}

export function buildDirectionMap(
	segments: Line2D[],
): Map<string, Set<Direction>> {
	const dirs = new Map<string, Set<Direction>>();

	function addDir(p: Point2D, d: Direction) {
		const k = qpt(p);
		if (!dirs.has(k)) dirs.set(k, new Set());
		dirs.get(k)!.add(d);
	}

	for (const [[x1, y1], [x2, y2]] of segments) {
		if (Math.abs(y1 - y2) <= EPS_MATCH) {
			if (x2 > x1) {
				addDir([x1, y1], "E");
				addDir([x2, y2], "W");
			} else {
				addDir([x1, y1], "W");
				addDir([x2, y2], "E");
			}
		} else if (Math.abs(x1 - x2) <= EPS_MATCH) {
			if (y2 > y1) {
				addDir([x1, y1], "S");
				addDir([x2, y2], "N");
			} else {
				addDir([x1, y1], "N");
				addDir([x2, y2], "S");
			}
		}
	}

	return dirs;
}

export function classifyNodes(dirMap: Map<string, Set<Direction>>): {
	tees: Point2D[];
	crosses: Point2D[];
} {
	const tees: Point2D[] = [];
	const crosses: Point2D[] = [];

	for (const [k, ds] of dirMap) {
		const parts = k.split(",").map(Number);
		const pt: Point2D = [parts[0] / 1e6, parts[1] / 1e6];
		if (ds.size === 3) tees.push(pt);
		else if (ds.size === 4) crosses.push(pt);
	}

	return { tees, crosses };
}

export function teeRotationFromDirs(ds: Set<Direction>): number {
	const hasE = ds.has("E");
	const hasW = ds.has("W");
	const hasN = ds.has("N");
	const hasS = ds.has("S");

	let branch: Direction;
	if (hasE && hasW && hasN !== hasS) {
		branch = hasN ? "N" : "S";
	} else if (hasN && hasS && hasE !== hasW) {
		branch = hasE ? "E" : "W";
	} else {
		if (hasN && !hasS) branch = "N";
		else if (hasS && !hasN) branch = "S";
		else if (hasE && !hasW) branch = "E";
		else branch = "W";
	}

	if (branch === "N") branch = "S";
	else if (branch === "S") branch = "N";

	if (branch === "S") return 0;
	if (branch === "N") return 180;
	if (branch === "E") return 90;
	return -90;
}

export function gridToAutocad(
	gx: number,
	gy: number,
	config: GridConfig,
): Point2D {
	const originXUnits =
		config.origin_x_feet * INCHES_PER_FOOT + config.origin_x_inches;
	const originYUnits =
		config.origin_y_feet * INCHES_PER_FOOT + config.origin_y_inches;
	const yFlipped = config.grid_max_y - gy;
	return [
		originXUnits + gx * INCHES_PER_FOOT,
		originYUnits + yFlipped * INCHES_PER_FOOT,
	];
}

export function computeGridMaxY(
	rods: GridRod[],
	conductors: GridConductor[],
): number {
	let maxY = 0;
	for (const r of rods) maxY = Math.max(maxY, r.grid_y);
	for (const c of conductors) maxY = Math.max(maxY, c.y1, c.y2);
	return maxY;
}

function computeGridCorners(conductors: GridConductor[]): Set<string> {
	if (conductors.length === 0) return new Set();
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const c of conductors) {
		minX = Math.min(minX, c.x1, c.x2);
		minY = Math.min(minY, c.y1, c.y2);
		maxX = Math.max(maxX, c.x1, c.x2);
		maxY = Math.max(maxY, c.y1, c.y2);
	}
	const corners: Point2D[] = [
		[minX, minY],
		[minX, maxY],
		[maxX, minY],
		[maxX, maxY],
	];
	return new Set(corners.map((p) => qpt(p)));
}

export function generatePlacements(
	rods: GridRod[],
	conductors: GridConductor[],
	config: GridConfig,
): {
	placements: GridPlacement[];
	segmentCount: number;
	teeCount: number;
	crossCount: number;
} {
	const gridLines: Line2D[] = conductors.map((c) => [
		[c.x1, c.y1],
		[c.x2, c.y2],
	]);
	const pts = findIntersectionPoints(gridLines);
	const segments = splitLinesAtPoints(gridLines, pts);
	const dirMap = buildDirectionMap(segments);
	const { tees, crosses } = classifyNodes(dirMap);

	const rodKeys = new Set(rods.map((r) => qpt([r.grid_x, r.grid_y])));
	const cornerKeys = computeGridCorners(conductors);

	const placements: GridPlacement[] = [];

	for (const rod of rods) {
		const [ax, ay] = gridToAutocad(rod.grid_x, rod.grid_y, config);
		const key = qpt([rod.grid_x, rod.grid_y]);
		const isCorner = cornerKeys.has(key);
		placements.push({
			type: isCorner ? "GROUND_ROD_TEST_WELL" : "ROD",
			grid_x: rod.grid_x,
			grid_y: rod.grid_y,
			autocad_x: ax,
			autocad_y: ay,
			rotation_deg: 0,
		});
	}

	if (config.place_tees) {
		for (const [gx, gy] of tees) {
			const key = qpt([gx, gy]);
			if (rodKeys.has(key)) continue;
			const ds = dirMap.get(key) || new Set<Direction>();
			const rot = teeRotationFromDirs(ds);
			const [ax, ay] = gridToAutocad(gx, gy, config);
			placements.push({
				type: "TEE",
				grid_x: gx,
				grid_y: gy,
				autocad_x: ax,
				autocad_y: ay,
				rotation_deg: rot,
			});
		}
	}

	if (config.place_crosses) {
		for (const [gx, gy] of crosses) {
			const key = qpt([gx, gy]);
			if (rodKeys.has(key)) continue;
			const [ax, ay] = gridToAutocad(gx, gy, config);
			placements.push({
				type: "CROSS",
				grid_x: gx,
				grid_y: gy,
				autocad_x: ax,
				autocad_y: ay,
				rotation_deg: 0,
			});
		}
	}

	return {
		placements,
		segmentCount: segments.length,
		teeCount: tees.length,
		crossCount: crosses.length,
	};
}

export function conductorsToLines(conductors: GridConductor[]): Line2D[] {
	return conductors.map((c) => [
		[c.x1, c.y1],
		[c.x2, c.y2],
	]);
}

export function totalConductorLength(conductors: GridConductor[]): number {
	let total = 0;
	for (const c of conductors) {
		total += Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2);
	}
	return total;
}
