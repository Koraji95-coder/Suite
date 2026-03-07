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
		id: "autodraft-studio",
		title: "AutoDraft Studio",
		description:
			"Recognize Bluebeam markups and generate deterministic CAD action plans.",
		to: "/app/apps/autodraft-studio",
		status: "active",
	},
	{
		id: "conduit-route",
		title: "Conduit Route",
		description:
			"Route conduit and cable runs with clash-aware paths, schedule output, and NEC snapshots.",
		to: "/app/apps/conduit-route",
		status: "active",
	},
	{
		id: "etap-dxf-cleanup",
		title: "ETAP DXF Cleanup",
		description:
			"Trigger ETAPFIX and related AutoCAD cleanup commands through the local bridge.",
		to: "/app/apps/etap-dxf-cleanup",
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
			"Unified standards validation workflow for engineering deliverables.",
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
