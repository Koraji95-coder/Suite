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

export type SourceFilter = "architecture" | "memory" | "both";

/** Returns a CSS custom-property reference for the given group. */
export const getGroupColor = (group: string): string => {
	switch (group) {
		case "frontend":
		case "dash":
		case "proj":
			return "var(--primary)";
		case "backend":
		case "equip":
			return "var(--tertiary)";
		case "data":
		case "apps":
		case "pattern":
		case "relationship":
			return "var(--accent)";
		case "agent":
		case "know":
		case "std":
		case "knowledge":
			return "var(--secondary)";
		case "docs":
			return "var(--text-muted)";
		case "preference":
			return "var(--tertiary)";
		default:
			return "var(--primary)";
	}
};
