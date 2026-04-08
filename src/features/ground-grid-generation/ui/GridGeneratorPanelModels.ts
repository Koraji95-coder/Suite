import type { GridConductor, GridPlacement, GridRod } from "./types";

export interface ProjectOption {
	id: string;
	name: string;
	color: string;
}

export type PasteMode = "rods" | "conductors";

export type PreviewMode = "2d" | "contour" | "editor";

export interface GridDataSnapshot {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
}

export interface PlotValidationIssue {
	severity: "error" | "warning" | "info";
	message: string;
}

export interface PlotDiffPreview {
	hasBaseline: boolean;
	conductorsAdded: number;
	conductorsRemoved: number;
	placementsAdded: number;
	placementsRemoved: number;
	placementsRotationChanged: number;
	placementTypeSwaps: number;
	issues: PlotValidationIssue[];
	canPlot: boolean;
}
