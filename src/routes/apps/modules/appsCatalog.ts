import type { LucideIcon } from "lucide-react";
import {
	BookOpen,
	CalendarDays,
	FolderKanban,
	Replace,
	ShieldCheck,
	SquareLibrary,
	Workflow,
} from "lucide-react";
import type { AppAudience, AppReleaseState } from "@/lib/audience";

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
	audience: AppAudience;
	releaseState: AppReleaseState;
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
		audience: "customer",
		releaseState: "released",
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
		audience: "customer",
		releaseState: "released",
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
		audience: "customer",
		releaseState: "released",
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
		audience: "customer",
		releaseState: "released",
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
		audience: "customer",
		releaseState: "released",
	},
	{
		id: "knowledge",
		title: "Knowledge",
		description: "Reference guides, formulas, and delivery notes for the active workspace.",
		to: "/app/knowledge",
		status: "active",
		icon: BookOpen,
		lane: "intelligence",
		signal: "Reference library",
		audience: "customer",
		releaseState: "released",
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
		audience: "customer",
		releaseState: "released",
	},
];
