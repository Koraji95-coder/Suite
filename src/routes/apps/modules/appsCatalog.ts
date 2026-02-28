export type AppsCatalogItem = {
	id: string;
	title: string;
	description: string;
	to?: string;
	status: "active" | "in-progress" | "coming-soon";
};

export const APPS_CATALOG: AppsCatalogItem[] = [
	{
		id: "projects",
		title: "Projects",
		description: "Manage active and archived project workspaces.",
		to: "/app/projects",
		status: "active",
	},
	{
		id: "calendar",
		title: "Calendar",
		description: "Schedule events, deadlines, and reminders.",
		to: "/app/calendar",
		status: "active",
	},
	{
		id: "ground-grid",
		title: "Ground Grid Generation",
		description:
			"Coordinates capture backend and interactive generation in one app.",
		to: "/app/apps/ground-grid-generation",
		status: "active",
	},
	{
		id: "transmittal-builder",
		title: "Transmittal Builder",
		description:
			"Assemble transmittal packages with contacts and document lists.",
		to: "/app/apps/transmittal-builder",
		status: "active",
	},
	{
		id: "drawing-list-manager",
		title: "Drawing List Manager",
		description:
			"Generate, validate, and export structured drawing lists from project files.",
		to: "/app/apps/drawing-list-manager",
		status: "active",
	},
	{
		id: "graph-explorer",
		title: "Graph Explorer",
		description:
			"Visualize architecture modules and agent memory graph relationships.",
		to: "/app/apps/graph",
		status: "active",
	},
	{
		id: "batch-find-replace",
		title: "Batch Find and Replace",
		description:
			"Run bulk find/replace jobs through the backend bridge with preview support.",
		to: "/app/apps/batch-find-replace",
		status: "active",
	},
	{
		id: "standards-checker",
		title: "Standards Checker",
		description:
			"Unified QA/QC and standards validation workflow for engineering deliverables.",
		to: "/app/apps/standards-checker",
		status: "active",
	},
	{
		id: "agent",
		title: "Koro Agent",
		description: "Pair and run automation workflows through the gateway.",
		to: "/app/agent",
		status: "active",
	},
	{
		id: "architecture",
		title: "Architecture Map",
		description: "System structure, service boundaries, and module map.",
		to: "/app/architecture-map",
		status: "active",
	},
	{
		id: "knowledge",
		title: "Knowledge",
		description: "Standards, security notes, and implementation docs.",
		to: "/app/knowledge",
		status: "active",
	},
	{
		id: "block-library",
		title: "Block Library",
		description: "Central catalog for reusable engineering block assets.",
		status: "coming-soon",
	},
];
