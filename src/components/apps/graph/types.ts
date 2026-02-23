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

export const GROUP_COLORS: Record<string, string> = {
	dash: "#00d4ff",
	know: "#4a8fff",
	apps: "#e066ff",
	equip: "#ff8c42",
	std: "#4ade80",
	proj: "#a855f7",
	preference: "#f59e0b",
	knowledge: "#3b82f6",
	pattern: "#8b5cf6",
	relationship: "#ec4899",
};
