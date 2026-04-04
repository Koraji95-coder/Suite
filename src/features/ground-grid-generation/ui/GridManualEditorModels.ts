import type { GridConductor, GridPlacement, GridRod } from "./types";

export type EditorMode =
	| "select"
	| "add-rod"
	| "add-conductor"
	| "add-tee"
	| "add-cross"
	| "delete";

export interface PlacementSuggestion {
	type: EditorMode;
	x: number;
	y: number;
	endX?: number;
	endY?: number;
}

export interface CoordInput {
	x: string;
	y: string;
}

export interface LineInput {
	x1: string;
	y1: string;
	x2: string;
	y2: string;
}

export interface SuggestionCoords {
	x: string;
	y: string;
	endX: string;
	endY: string;
}

export interface GridManualEditorProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	onRodsChange: (rods: GridRod[]) => void;
	onConductorsChange: (conductors: GridConductor[]) => void;
	onPlacementsChange: (placements: GridPlacement[]) => void;
}

export function placementKey(
	p: Pick<GridPlacement, "type" | "grid_x" | "grid_y">,
): string {
	return `${p.type}:${p.grid_x},${p.grid_y}`;
}
