import {
	AppWindow,
	BookOpen,
	CalendarDays,
	ClipboardList,
	FolderOpen,
	Layers3,
	LayoutDashboard,
	Radar,
	type LucideIcon,
	Settings,
	Sparkles,
	TerminalSquare,
} from "lucide-react";

export interface ShellRouteMeta {
	match: string;
	title: string;
	subtitle: string;
	areaLabel: string;
	icon: LucideIcon;
}

const shellRouteMeta: readonly ShellRouteMeta[] = [
	{
		match: "/app/apps/autowire",
		title: "AutoWire",
		subtitle:
			"Unified routing workspace for conduit and cable runs, terminal workflows, and NEC checks.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/autodraft-studio",
		title: "AutoDraft Studio",
		subtitle:
			"Bluebeam markup recognition and CAD action planning through a .NET-ready API pipeline.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/transmittal-builder",
		title: "Transmittal Builder",
		subtitle:
			"Generate transmittal packages from project metadata, reviewed PDFs, and contacts.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/drawing-list-manager",
		title: "Drawing List Manager",
		subtitle:
			"Project-wide title block scan, ACADE mapping preview, and Suite second-pass sync.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/batch-find-replace",
		title: "Batch Find & Replace",
		subtitle:
			"Use file-based replacement or active-drawing AutoCAD cleanup from one shared surface.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/block-library",
		title: "Block Library",
		subtitle: "Manage your CAD block collection.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/graph",
		title: "Architecture Graph",
		subtitle:
			"Alternate node-link view over the same architecture and memory model used by Architecture Map.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/apps/ground-grid-generation",
		title: "Ground Grid Generation",
		subtitle:
			"Coordinates capture and interactive grid generation in one workspace.",
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
		match: "/app/apps/etap-dxf-cleanup",
		title: "ETAP DXF Cleanup",
		subtitle:
			"Run ETAP cleanup commands through the AutoCAD bridge with presets, timeout control, and execution history.",
		areaLabel: "Apps",
		icon: AppWindow,
	},
	{
		match: "/app/knowledge/whiteboard",
		title: "Whiteboard",
		subtitle: "Sketch, save, and review whiteboard snapshots.",
		areaLabel: "Knowledge",
		icon: BookOpen,
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
			"Confirm the current device before opening the live agent surface.",
		areaLabel: "Agents",
		icon: Sparkles,
	},
	{
		match: "/app/dashboard",
		title: "Dashboard",
		subtitle:
			"Cross-system command center for operations, architecture, and memory.",
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
		subtitle: "Project planning, telemetry, tasks, and delivery workflows.",
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
		match: "/app/changelog",
		title: "Changelog",
		subtitle:
			"Canonical work ledger, linked checkpoints, and publish-ready notes.",
		areaLabel: "Changelog",
		icon: ClipboardList,
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
		match: "/app/agent",
		title: "Agents",
		subtitle: "Profile-driven orchestration and collaborative execution.",
		areaLabel: "Agents",
		icon: Sparkles,
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
		subtitle: "Developer diagnostics and incident-oriented controls.",
		areaLabel: "Command Center",
		icon: TerminalSquare,
	},
] as const;

const defaultShellMeta: ShellRouteMeta = {
	match: "/app",
	title: "Workspace",
	subtitle: "Suite operations and delivery workspace.",
	areaLabel: "Workspace",
	icon: AppWindow,
};

export function resolveShellMeta(pathname: string): ShellRouteMeta {
	return (
		shellRouteMeta.find((item) => pathname.startsWith(item.match)) ??
		defaultShellMeta
	);
}
