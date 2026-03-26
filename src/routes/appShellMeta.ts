import {
	AppWindow,
	BookOpen,
	Bot,
	CalendarDays,
	ClipboardList,
	FolderOpen,
	Layers3,
	LayoutDashboard,
	type LucideIcon,
	Network,
	Radar,
	Settings,
	Sparkles,
	TerminalSquare,
	Wrench,
} from "lucide-react";
import {
	DEVELOPER_TOOL_MANIFEST,
	type DeveloperToolGroup,
	getDeveloperToolGroup,
} from "./developerToolsManifest";

export interface ShellRouteMeta {
	match: string;
	title: string;
	subtitle: string;
	areaLabel: string;
	icon: LucideIcon;
}

const developerGroupIconMap: Record<DeveloperToolGroup, LucideIcon> = {
	"publishing-evidence": ClipboardList,
	"automation-lab": Wrench,
	"agent-lab": Bot,
	"architecture-code": Network,
	"developer-docs": BookOpen,
};

const developerToolShellMeta: readonly ShellRouteMeta[] =
	DEVELOPER_TOOL_MANIFEST.map((tool) => {
		const group = getDeveloperToolGroup(tool.group);
		return {
			match: tool.route,
			title: tool.title,
			subtitle: tool.description,
			areaLabel: group?.title ?? "Developer",
			icon: developerGroupIconMap[tool.group] ?? AppWindow,
		};
	});

const shellRouteMeta: readonly ShellRouteMeta[] = [
	{
		match: "/app/operations",
		title: "Developer Portal",
		subtitle: "Compatibility redirect to the developer workshop home.",
		areaLabel: "Developer",
		icon: ClipboardList,
	},
	{
		match: "/app/developer",
		title: "Developer Portal",
		subtitle:
			"Developer-only tools, staged features, and workstation workshop surfaces.",
		areaLabel: "Developer",
		icon: ClipboardList,
	},
	{
		match: "/app/apps/block-library",
		title: "Block Library",
		subtitle: "Manage your CAD block collection.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/standards-checker",
		title: "Standards Checker",
		subtitle: "Verify designs against NEC, IEEE, and IEC standards.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/knowledge/math-tools",
		title: "Math tools",
		subtitle:
			"Calculators, plots, and reference formulas tuned for electrical workflows.",
		areaLabel: "Knowledge",
		icon: BookOpen,
	},
	{
		match: "/app/agent/pairing-callback",
		title: "Agent Pairing",
		subtitle:
			"Confirm the current device before opening the developer-only agent lab.",
		areaLabel: "Developer",
		icon: Sparkles,
	},
	...developerToolShellMeta,
	{
		match: "/app/dashboard",
		title: "Dashboard",
		subtitle:
			"Mission board for active projects, drawing health, and upcoming delivery timing.",
		areaLabel: "Dashboard",
		icon: LayoutDashboard,
	},
	{
		match: "/app/watchdog",
		title: "Watchdog",
		subtitle:
			"Collector health, drawing activity, and project-attributed AutoCAD sessions.",
		areaLabel: "Watchdog",
		icon: Radar,
	},
	{
		match: "/app/projects",
		title: "Projects",
		subtitle: "Project setup, review, telemetry, and delivery workflows.",
		areaLabel: "Projects",
		icon: FolderOpen,
	},
	{
		match: "/app/calendar",
		title: "Calendar",
		subtitle: "Scheduling, commitments, and upcoming delivery timing.",
		areaLabel: "Calendar",
		icon: CalendarDays,
	},
	{
		match: "/app/apps",
		title: "Apps Hub",
		subtitle:
			"Domain tools for drafting, transmittals, and engineering workflows.",
		areaLabel: "Apps",
		icon: Layers3,
	},
	{
		match: "/app/knowledge",
		title: "Knowledge",
		subtitle: "References, formulas, standards context, and reusable guidance.",
		areaLabel: "Knowledge",
		icon: BookOpen,
	},
	{
		match: "/app/settings",
		title: "Settings",
		subtitle: "Account controls and workspace preferences.",
		areaLabel: "Settings",
		icon: Settings,
	},
	{
		match: "/app/command-center",
		title: "Command Center",
		subtitle:
			"Developer diagnostics toolshed for Suite Doctor, hosted push, and incident commands.",
		areaLabel: "Developer",
		icon: TerminalSquare,
	},
] as const;

const defaultShellMeta: ShellRouteMeta = {
	match: "/app",
	title: "Workspace",
	subtitle: "Project delivery and drawing control workspace.",
	areaLabel: "Workspace",
	icon: AppWindow,
};

export function resolveShellMeta(pathname: string): ShellRouteMeta {
	return (
		shellRouteMeta.find((item) => pathname.startsWith(item.match)) ??
		defaultShellMeta
	);
}
