import type { CableSystemType, ConduitRouteRecord } from "./conduitRouteTypes";

export interface ConduitScheduleRow {
	id: string;
	ref: string;
	type: CableSystemType;
	fn: string;
	color: string;
	from: string;
	to: string;
	length: number;
}

export function buildConduitScheduleRows(
	routes: ConduitRouteRecord[],
): ConduitScheduleRow[] {
	return routes
		.slice()
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((route) => ({
			id: route.id,
			ref: route.ref,
			type: route.cableType,
			fn: route.wireFunction,
			color: route.color.code,
			from: `${Math.round(route.start.x)},${Math.round(route.start.y)}`,
			to: `${Math.round(route.end.x)},${Math.round(route.end.y)}`,
			length: Math.round(route.length),
		}));
}

export function buildNextConduitRef(
	cableType: CableSystemType,
	nextRef: Record<CableSystemType, number>,
): string {
	return `${cableType}-${String(nextRef[cableType]).padStart(3, "0")}`;
}
