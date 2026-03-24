import type { LucideIcon } from "lucide-react";
import {
	Bot,
	BookOpen,
	CalendarDays,
	CircuitBoard,
	FolderKanban,
	Network,
	Replace,
	Route,
	ScanSearch,
	ShieldCheck,
	SquareLibrary,
	Workflow,
	Wrench,
} from "lucide-react";

export type AppsCatalogLane = "workspace" | "automation" | "intelligence";

export type AppsCatalogItem = {
	id: string;
	title: string;
	description: string;
	to?: string;
	status: "active" | "in-progress" | "coming-soon";
	icon: LucideIcon;
	lane: AppsCatalogLane;
	signal: string;
};

export const APPS_CATALOG: AppsCatalogItem[] = [
	{
		id: "projects",
		title: "Projects",
		description: "Manage active and archived project workspaces.",
		to: "/app/projects",
		status: "active",
		icon: FolderKanban,
		lane: "workspace",
		signal: "Project ops",
	},
	{
		id: "calendar",
		title: "Calendar",
		description: "Schedule events, deadlines, and reminders.",
		to: "/app/calendar",
		status: "active",
		icon: CalendarDays,
		lane: "workspace",
		signal: "Scheduling",
	},
	{
		id: "ground-grid",
		title: "Ground Grid Generation",
		description:
			"Coordinates capture backend and interactive generation in one app.",
		to: "/app/apps/ground-grid-generation",
		status: "active",
		icon: Network,
		lane: "automation",
		signal: "Field geometry",
	},
	{
		id: "autodraft-studio",
		title: "AutoDraft Studio",
		description:
			"Recognize Bluebeam markups and generate deterministic CAD action plans.",
		to: "/app/apps/autodraft-studio",
		status: "active",
		icon: ScanSearch,
		lane: "automation",
		signal: "Markup automation",
	},
	{
		id: "autowire",
		title: "AutoWire",
		description:
			"Unified conduit/cable routing workspace with terminal workflows, schedule output, and NEC snapshots.",
		to: "/app/apps/autowire",
		status: "active",
		icon: Route,
		lane: "automation",
		signal: "Route planning",
	},
	{
		id: "etap-dxf-cleanup",
		title: "ETAP DXF Cleanup",
		description:
			"Trigger ETAPFIX and related AutoCAD cleanup commands through the local bridge.",
		to: "/app/apps/etap-dxf-cleanup",
		status: "active",
		icon: Wrench,
		lane: "automation",
		signal: "Cleanup bridge",
	},
	{
		id: "transmittal-builder",
		title: "Transmittal Builder",
		description:
			"Assemble transmittal packages from project metadata, PDFs, and contacts.",
		to: "/app/apps/transmittal-builder",
		status: "active",
		icon: Workflow,
		lane: "workspace",
		signal: "Package assembly",
	},
	{
		id: "drawing-list-manager",
		title: "Drawing List Manager",
		description:
			"Scan title blocks, preview ACADE mapping, and export project drawing indexes.",
		to: "/app/apps/drawing-list-manager",
		status: "active",
		icon: Replace,
		lane: "workspace",
		signal: "Issued sets",
	},
	{
		id: "graph-explorer",
		title: "Architecture Graph",
		description:
			"Alternate node-link view for architecture modules and agent memory relationships.",
		to: "/app/apps/graph",
		status: "active",
		icon: CircuitBoard,
		lane: "intelligence",
		signal: "Architecture graph",
	},
	{
		id: "batch-find-replace",
		title: "Batch Find and Replace",
		description:
			"Run text cleanup and active-drawing remediation through the backend bridge with preview support.",
		to: "/app/apps/batch-find-replace",
		status: "active",
		icon: Replace,
		lane: "automation",
		signal: "Batch execution",
	},
	{
		id: "standards-checker",
		title: "Standards Checker",
		description:
			"Unified standards validation workflow for engineering deliverables.",
		to: "/app/apps/standards-checker",
		status: "active",
		icon: ShieldCheck,
		lane: "intelligence",
		signal: "Standards QA",
	},
	{
		id: "agent",
		title: "Agents",
		description:
			"Pair and run profile-based AI workflows with deterministic model routing.",
		to: "/app/agent",
		status: "active",
		icon: Bot,
		lane: "intelligence",
		signal: "Agent orchestration",
	},
	{
		id: "knowledge",
		title: "Knowledge",
		description: "Standards, security notes, and implementation docs.",
		to: "/app/knowledge",
		status: "active",
		icon: BookOpen,
		lane: "intelligence",
		signal: "Operational memory",
	},
	{
		id: "block-library",
		title: "Block Library",
		description: "Central catalog for reusable engineering block assets.",
		to: "/app/apps/block-library",
		status: "active",
		icon: SquareLibrary,
		lane: "workspace",
		signal: "Reusable assets",
	},
];
