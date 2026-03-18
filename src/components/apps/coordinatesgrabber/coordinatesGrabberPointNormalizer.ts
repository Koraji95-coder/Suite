import type { ExecutionResultPoint } from "../ground-grid-generator/coordinatesGrabberService";
import type { CoordinatePoint } from "./types";

interface PointFallbackOptions {
	pointPrefix: string;
	startNumber: number;
	layerName: string;
	pointsCreated: number;
}

function toNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function toText(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

export function normalizeCoordinatePoints(
	points: ExecutionResultPoint[] | undefined,
	fallback: PointFallbackOptions,
): CoordinatePoint[] {
	if (Array.isArray(points) && points.length > 0) {
		return points.map((point) => ({
			east: toNumber(point.east),
			elevation: toNumber(point.elevation),
			id: toText(
				point.id,
				`${fallback.pointPrefix}${fallback.startNumber}`,
			),
			layer: toText(point.layer, fallback.layerName),
			north: toNumber(point.north),
		}));
	}

	return Array.from({ length: fallback.pointsCreated }, (_, index) => ({
		east: 0,
		elevation: 0,
		id: `${fallback.pointPrefix}${fallback.startNumber + index}`,
		layer: fallback.layerName,
		north: 0,
	}));
}
