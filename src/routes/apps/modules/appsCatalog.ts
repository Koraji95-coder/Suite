export type AppsCatalogItem = {
	id: string;
	title: string;
	description: string;
	to: string;
	status: "active" | "in-progress";
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
		title: "Ground Grid Generator",
		description: "Capture AutoCAD coordinates and generate grounding grid layouts.",
		to: "/app/apps/ground-grid",
		status: "active",
	},
	{
		id: "transmittal-builder",
		title: "Transmittal Builder",
		description: "Assemble transmittal packages with contacts and document lists.",
		to: "/app/apps/transmittal",
		status: "active",
	},
	{
		id: "agent",
		title: "Agent",
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
];
