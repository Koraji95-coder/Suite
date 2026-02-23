import type { LucideIcon } from "lucide-react";
import {
	Activity,
	AppWindow,
	Binary,
	BookOpen,
	Bot,
	Calculator,
	CalendarDays,
	CheckCircle,
	CircuitBoard,
	Compass,
	Cpu,
	FileText,
	FlaskConical,
	FolderOpen,
	GitBranch,
	HardDrive,
	LayoutDashboard,
	Network,
	Settings,
	Waves,
	Zap,
} from "lucide-react";

export interface MenuItem {
	id: string;
	icon: LucideIcon;
	label: string;
	color: "cyan" | "teal" | "blue" | "green" | "orange" | "purple";
	isCategory?: boolean;
}

export interface MenuDivider {
	divider: true;
}

export type SidebarNavItem = MenuItem | MenuDivider;

export interface MenuSection {
	title: string;
	items: MenuItem[];
	subsections?: Array<{
		subtitle: string;
		items: MenuItem[];
	}>;
}

export const menuSections: MenuSection[] = [
	{
		title: "Main",
		items: [
			{
				id: "dashboard",
				icon: LayoutDashboard,
				label: "Dashboard",
				color: "cyan",
			},
			{
				id: "projects",
				icon: FolderOpen,
				label: "Project Manager",
				color: "cyan",
			},
			{ id: "storage", icon: HardDrive, label: "Storage", color: "cyan" },
		],
	},
	{
		title: "Apps & Automation",
		items: [], // Items will be filled in the grid from category 'apps'
	},
	{
		title: "Knowledge & Standards",
		items: [
			{
				id: "calculator",
				icon: Calculator,
				label: "Calculations",
				color: "blue",
			},
			{ id: "vectors", icon: Compass, label: "Vector Analysis", color: "blue" },
			{
				id: "threephase",
				icon: Zap,
				label: "Three-Phase Systems",
				color: "blue",
			},
			{
				id: "symmetrical",
				icon: GitBranch,
				label: "Symmetrical Components",
				color: "blue",
			},
			{
				id: "sinusoidal",
				icon: Activity,
				label: "Sinusoidal & Per-Unit",
				color: "blue",
			},
			{ id: "mathref", icon: BookOpen, label: "Math Reference", color: "blue" },
			{ id: "plots", icon: Zap, label: "Plot Diagrams", color: "blue" },
			{
				id: "circuits",
				icon: CircuitBoard,
				label: "Circuit Generator",
				color: "blue",
			},
			{ id: "formulas", icon: BookOpen, label: "Formula Bank", color: "blue" },
			{ id: "electronics", icon: Cpu, label: "Electronics", color: "blue" },
			{
				id: "digital-logic",
				icon: Binary,
				label: "Digital Logic Design",
				color: "blue",
			},
			{
				id: "electromagnetics",
				icon: Waves,
				label: "Electromagnetics",
				color: "blue",
			},
			{
				id: "qaqc",
				icon: CheckCircle,
				label: "QA/QC Standards Checker",
				color: "blue",
			},
			{
				id: "nec",
				icon: FileText,
				label: "National Electric Code",
				color: "blue",
			},
			{ id: "ieee", icon: FileText, label: "IEEE Standards", color: "blue" },
			{
				id: "equipment-library",
				icon: Settings,
				label: "Equipment Library",
				color: "blue",
			},
		],
	},
];

// Category definitions for the main navigation icons (sidebar)
export const sidebarNavItems: SidebarNavItem[] = [
	{ id: "dashboard", icon: LayoutDashboard, label: "Dashboard", color: "cyan" },
	{ id: "projects", icon: FolderOpen, label: "Projects", color: "cyan" },
	{ id: "storage", icon: HardDrive, label: "Storage", color: "cyan" },
	{ id: "calendar", icon: CalendarDays, label: "Calendar", color: "cyan" },
	{ divider: true },
	{ id: "appshub", icon: AppWindow, label: "Apps", color: "teal" },
	{
		id: "knowledge",
		icon: BookOpen,
		label: "Knowledge",
		color: "blue",
		isCategory: true,
	},
	{ divider: true },
	{ id: "agent", icon: Bot, label: "Agent", color: "purple" },
	{ id: "architecture-map", icon: Network, label: "Arch Map", color: "purple" },
	{ divider: true },
	{
		id: "test-preview",
		icon: FlaskConical,
		label: "Test Preview",
		color: "purple",
	},
];
