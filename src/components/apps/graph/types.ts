import type { ColorScheme } from "@/lib/palette";

export interface GraphNode {
	id: string;
	label: string;
	group: string;
	source: "architecture" | "memory" | "mixed";
	x: number;
	y: number;
	z: number;
	data?: Record<string, unknown>;
}

export interface GraphLink {
	source: string;
	target: string;
	weight: number;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export type ViewMode = "2d" | "3d";

export type SourceFilter = "architecture" | "memory" | "both";

export const getGroupColor = (group: string, palette: ColorScheme): string => {
	switch (group) {
		case "dash":
			return palette.primary;
		case "know":
			return palette.secondary;
		case "apps":
			return palette.accent;
		case "equip":
			return palette.tertiary;
		case "std":
			return palette.secondary;
		case "proj":
			return palette.primary;
		case "preference":
			return palette.tertiary;
		case "knowledge":
			return palette.secondary;
		case "pattern":
			return palette.accent;
		case "relationship":
			return palette.accent;
		default:
			return palette.primary;
	}
};
