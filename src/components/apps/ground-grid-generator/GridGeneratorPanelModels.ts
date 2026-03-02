import type { GridConductor, GridPlacement, GridRod } from "./types";

export interface ProjectOption {
	id: string;
	name: string;
	color: string;
}

export type PasteMode = "rods" | "conductors";

export type PreviewMode = "2d" | "3d" | "contour" | "editor";

export interface GridDataSnapshot {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
}
