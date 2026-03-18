import type {
	GridConductor,
	GridPlacement,
	GridRod,
} from "./types";

export function toRodRows(designId: string, rows: GridRod[]) {
	return rows.map((rod) => ({
		design_id: designId,
		label: rod.label,
		grid_x: rod.grid_x,
		grid_y: rod.grid_y,
		depth: rod.depth,
		diameter: rod.diameter,
		sort_order: rod.sort_order,
	}));
}

export function toConductorRows(designId: string, rows: GridConductor[]) {
	return rows.map((conductor) => ({
		design_id: designId,
		label: conductor.label,
		length: conductor.length,
		x1: conductor.x1,
		y1: conductor.y1,
		x2: conductor.x2,
		y2: conductor.y2,
		diameter: conductor.diameter,
		sort_order: conductor.sort_order,
	}));
}

export function dataSignature(rods: GridRod[], conductors: GridConductor[]): string {
	return JSON.stringify({
		rods: rods.map((rod) => [rod.grid_x, rod.grid_y, rod.depth, rod.diameter]),
		conductors: conductors.map((conductor) => [
			conductor.x1,
			conductor.y1,
			conductor.x2,
			conductor.y2,
			conductor.diameter,
		]),
	});
}

function quantCoord(value: number): number {
	return Math.round(value * 1_000_000);
}

export function conductorKey(conductor: GridConductor): string {
	const p1 = `${quantCoord(conductor.x1)},${quantCoord(conductor.y1)}`;
	const p2 = `${quantCoord(conductor.x2)},${quantCoord(conductor.y2)}`;
	return p1 <= p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

export function placementBaseKey(placement: GridPlacement): string {
	return `${placement.type}|${quantCoord(placement.grid_x)},${quantCoord(placement.grid_y)}`;
}

export function coordinateBucketKey(x: number, y: number): string {
	return `${quantCoord(x)},${quantCoord(y)}`;
}

