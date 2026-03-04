export type Point = { x: number; y: number };

export type Segment = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	kind?: "line" | "curve";
};

export type ArcEntity = {
	cx: number;
	cy: number;
	r: number;
	startAngleDeg: number;
	endAngleDeg: number;
	isCircle: boolean;
	startPoint: Point;
	endPoint: Point;
};

export type PdfToCadConfig = {
	joinTolerancePt: number;
	extendMaxPt: number;
	arcMaxRelativeError: number;
	detectArcs: boolean;
	extendLines: boolean;
};

const DEFAULT_CFG: PdfToCadConfig = {
	joinTolerancePt: 2,
	extendMaxPt: 8,
	arcMaxRelativeError: 0.1,
	detectArcs: true,
	extendLines: true,
};

const snap = (value: number, tol: number) => Math.round(value / tol) * tol;

export const pointDistance = (a: Point, b: Point): number =>
	Math.hypot(b.x - a.x, b.y - a.y);

const segmentStart = (s: Segment): Point => ({ x: s.x1, y: s.y1 });
const segmentEnd = (s: Segment): Point => ({ x: s.x2, y: s.y2 });

const signedAngleAt = (p1: Point, p2: Point, p3: Point): number => {
	const dx1 = p2.x - p1.x;
	const dy1 = p2.y - p1.y;
	const dx2 = p3.x - p2.x;
	const dy2 = p3.y - p2.y;
	const cross = dx1 * dy2 - dy1 * dx2;
	const dot = dx1 * dx2 + dy1 * dy2;
	return (Math.atan2(cross, dot) * 180) / Math.PI;
};

const normalizeAngle360 = (angle: number) => ((angle % 360) + 360) % 360;

type CircleFit = {
	cx: number;
	cy: number;
	r: number;
	maxError: number;
	avgError: number;
};

const fitCircleLeastSquares = (points: Point[]): CircleFit | null => {
	if (points.length < 3) return null;

	const n = points.length;
	const sx = points.reduce((acc, p) => acc + p.x, 0) / n;
	const sy = points.reduce((acc, p) => acc + p.y, 0) / n;

	let suu = 0;
	let svv = 0;
	let suv = 0;
	let suuu = 0;
	let svvv = 0;
	let suvv = 0;
	let svuu = 0;

	for (const p of points) {
		const u = p.x - sx;
		const v = p.y - sy;
		suu += u * u;
		svv += v * v;
		suv += u * v;
		suuu += u * u * u;
		svvv += v * v * v;
		suvv += u * v * v;
		svuu += v * u * u;
	}

	const det = suu * svv - suv * suv;
	if (Math.abs(det) < 1e-10) return null;

	const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / (2 * det);
	const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / (2 * det);
	const cx = uc + sx;
	const cy = vc + sy;
	const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);

	if (!Number.isFinite(r) || r < 0.5) return null;

	const deviations = points.map((p) =>
		Math.abs(pointDistance(p, { x: cx, y: cy }) - r),
	);
	const maxError = Math.max(...deviations);
	const avgError =
		deviations.reduce((acc, value) => acc + value, 0) / deviations.length;

	return { cx, cy, r, maxError, avgError };
};

const lineRayIntersection = (
	rayStart: Point,
	rayEnd: Point,
	segA: Point,
	segB: Point,
): { point: Point; rayT: number; segU: number } | null => {
	const x1 = rayStart.x;
	const y1 = rayStart.y;
	const x2 = rayEnd.x;
	const y2 = rayEnd.y;
	const x3 = segA.x;
	const y3 = segA.y;
	const x4 = segB.x;
	const y4 = segB.y;

	const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
	if (Math.abs(denom) < 1e-10) return null;

	const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
	const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

	return {
		point: { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) },
		rayT: t,
		segU: u,
	};
};

type TracePath = { segmentIndices: number[]; points: Point[] };

const traceConnectedPaths = (segments: Segment[], tol: number): TracePath[] => {
	const graph = new Map<string, Array<{ index: number; endpoint: 0 | 1 }>>();

	const addEndpoint = (p: Point, entry: { index: number; endpoint: 0 | 1 }) => {
		const key = `${snap(p.x, tol)}:${snap(p.y, tol)}`;
		const bucket = graph.get(key) ?? [];
		bucket.push(entry);
		graph.set(key, bucket);
	};

	segments.forEach((segment, index) => {
		addEndpoint(segmentStart(segment), { index, endpoint: 0 });
		addEndpoint(segmentEnd(segment), { index, endpoint: 1 });
	});

	const used = new Set<number>();
	const paths: TracePath[] = [];

	const trace = (startIndex: number, endpoint: 0 | 1): TracePath => {
		const chain: number[] = [startIndex];
		const start = segments[startIndex];
		const points =
			endpoint === 0
				? [segmentStart(start), segmentEnd(start)]
				: [segmentEnd(start), segmentStart(start)];
		used.add(startIndex);

		while (true) {
			const tip = points[points.length - 1];
			if (!tip) break;
			const key = `${snap(tip.x, tol)}:${snap(tip.y, tol)}`;
			const neighbors = (graph.get(key) ?? []).filter(
				(entry) => !used.has(entry.index),
			);
			if (neighbors.length !== 1) break;
			const next = neighbors[0];
			used.add(next.index);
			chain.push(next.index);
			const seg = segments[next.index];
			points.push(next.endpoint === 0 ? segmentEnd(seg) : segmentStart(seg));
		}

		return { segmentIndices: chain, points };
	};

	for (const [key, entries] of graph.entries()) {
		void key;
		const active = entries.filter((entry) => !used.has(entry.index));
		if (active.length === 1) {
			paths.push(trace(active[0].index, active[0].endpoint));
		}
	}

	for (const entries of graph.values()) {
		for (const entry of entries) {
			if (!used.has(entry.index)) {
				paths.push(trace(entry.index, entry.endpoint));
			}
		}
	}

	return paths;
};

export const detectArcsFromSegments = (
	segments: Segment[],
	cfg: Partial<PdfToCadConfig> = {},
): { remainingSegments: Segment[]; arcs: ArcEntity[] } => {
	const config = { ...DEFAULT_CFG, ...cfg };
	if (!config.detectArcs) {
		return { remainingSegments: segments, arcs: [] };
	}

	const paths = traceConnectedPaths(segments, 0.3);
	const arcSegmentIndices = new Set<number>();
	const arcs: ArcEntity[] = [];

	for (const path of paths) {
		if (path.points.length < 4) continue;
		const angles: number[] = [];
		for (let i = 1; i < path.points.length - 1; i += 1) {
			angles.push(
				signedAngleAt(path.points[i - 1], path.points[i], path.points[i + 1]),
			);
		}
		if (angles.length === 0) continue;

		const totalTurn = angles.reduce((acc, value) => acc + value, 0);
		if (Math.abs(totalTurn) < 45) continue;

		const avgAngle = totalTurn / angles.length;
		if (Math.abs(avgAngle) < 5) continue;
		if (angles.some((angle) => Math.abs(angle) > 70)) continue;
		if (
			!(
				angles.every((angle) => angle > 0) || angles.every((angle) => angle < 0)
			)
		) {
			continue;
		}

		const fit = fitCircleLeastSquares(path.points);
		if (!fit) continue;
		if (fit.r < 2 || fit.maxError / fit.r > config.arcMaxRelativeError)
			continue;

		const start = path.points[0];
		const end = path.points[path.points.length - 1];
		const startEndGap = pointDistance(start, end);
		const isCircle =
			Math.abs(Math.abs(totalTurn) - 360) < 45 || startEndGap < 0.5;

		if (isCircle && path.points.length < 6) continue;
		if (!isCircle && Math.abs(totalTurn) > 270 && path.points.length < 5)
			continue;

		let startAngle = normalizeAngle360(
			(Math.atan2(start.y - fit.cy, start.x - fit.cx) * 180) / Math.PI,
		);
		let endAngle = normalizeAngle360(
			(Math.atan2(end.y - fit.cy, end.x - fit.cx) * 180) / Math.PI,
		);

		if (!isCircle) {
			if (totalTurn > 0) {
				if (endAngle <= startAngle) endAngle += 360;
			} else {
				[startAngle, endAngle] = [endAngle, startAngle];
				if (endAngle <= startAngle) endAngle += 360;
			}
		}

		for (const index of path.segmentIndices) {
			arcSegmentIndices.add(index);
		}
		arcs.push({
			cx: fit.cx,
			cy: fit.cy,
			r: fit.r,
			startAngleDeg: startAngle,
			endAngleDeg: endAngle,
			isCircle,
			startPoint: start,
			endPoint: end,
		});
	}

	const remainingSegments = segments.filter(
		(_, index) => !arcSegmentIndices.has(index),
	);
	return { remainingSegments, arcs };
};

export const extendDeadEndSegments = (
	segments: Segment[],
	cfg: Partial<PdfToCadConfig> = {},
): Segment[] => {
	const config = { ...DEFAULT_CFG, ...cfg };
	if (!config.extendLines) return segments;

	const result = [...segments];
	const tol = config.joinTolerancePt;
	const maxExtension = config.extendMaxPt;

	const endpointMap = new Map<
		string,
		Array<{ index: number; endpoint: 0 | 1 }>
	>();
	const addPoint = (point: Point, item: { index: number; endpoint: 0 | 1 }) => {
		const key = `${snap(point.x, tol)}:${snap(point.y, tol)}`;
		const bucket = endpointMap.get(key) ?? [];
		bucket.push(item);
		endpointMap.set(key, bucket);
	};

	result.forEach((segment, index) => {
		addPoint(segmentStart(segment), { index, endpoint: 0 });
		addPoint(segmentEnd(segment), { index, endpoint: 1 });
	});

	const deadEnds: Array<{ index: number; endpoint: 0 | 1 }> = [];
	for (const entries of endpointMap.values()) {
		if (entries.length === 1) deadEnds.push(entries[0]);
	}

	for (const deadEnd of deadEnds) {
		const segment = result[deadEnd.index];
		const deadPoint =
			deadEnd.endpoint === 0 ? segmentStart(segment) : segmentEnd(segment);
		const otherPoint =
			deadEnd.endpoint === 0 ? segmentEnd(segment) : segmentStart(segment);

		const dx = deadPoint.x - otherPoint.x;
		const dy = deadPoint.y - otherPoint.y;
		const length = Math.hypot(dx, dy);
		if (length < 0.5) continue;

		const rayEnd: Point = {
			x: deadPoint.x + (dx / length) * maxExtension,
			y: deadPoint.y + (dy / length) * maxExtension,
		};

		let bestDistance = maxExtension;
		let bestPoint: Point | null = null;

		for (const [candidateIndex, candidate] of result.entries()) {
			if (candidateIndex === deadEnd.index) continue;
			const intersect = lineRayIntersection(
				deadPoint,
				rayEnd,
				segmentStart(candidate),
				segmentEnd(candidate),
			);
			if (!intersect) continue;
			if (intersect.rayT < 0.01) continue;
			if (intersect.segU < -0.02 || intersect.segU > 1.02) continue;

			const dist = pointDistance(deadPoint, intersect.point);
			if (dist > 0.1 && dist < bestDistance) {
				bestDistance = dist;
				bestPoint = intersect.point;
			}
		}

		if (!bestPoint) continue;
		const resolvedPoint = bestPoint;

		if (deadEnd.endpoint === 0) {
			result[deadEnd.index] = {
				...segment,
				x1: resolvedPoint.x,
				y1: resolvedPoint.y,
			};
		} else {
			result[deadEnd.index] = {
				...segment,
				x2: resolvedPoint.x,
				y2: resolvedPoint.y,
			};
		}
	}

	return result;
};
