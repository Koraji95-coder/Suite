// Route computation delegated to backend (single source of truth)
// See: backend/route_groups/api_conduit_route_compute.py and conduitRouteService.ts
import type { Point2D } from "./conduitRouteTypes";

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
