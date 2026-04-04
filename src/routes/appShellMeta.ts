import {
	AppWindow,
	ClipboardList,
	FolderOpen,
	House,
	type LucideIcon,
	Network,
	PencilRuler,
	Settings,
	ShieldCheck,
	TerminalSquare,
	Wrench,
} from "lucide-react";
import {
	DEVELOPER_TOOL_MANIFEST,
	type DeveloperToolGroup,
	getDeveloperToolGroup,
} from "./developer/developerToolsManifest";

export type ShellFamilyId =
	| "home"
	| "projects"
	| "draft"
	| "review"
	| "developer"
	| "settings";

export interface ShellRouteMeta {
	match: string;
	title: string;
	subtitle: string;
	areaLabel: string;
	family: ShellFamilyId;
	familyLabel: string;
	icon: LucideIcon;
}

const developerGroupIconMap: Record<DeveloperToolGroup, LucideIcon> = {
	control: TerminalSquare,
	architecture: Network,
	labs: Wrench,
};

const developerToolShellMeta: readonly ShellRouteMeta[] =
	DEVELOPER_TOOL_MANIFEST.map((tool) => {
		const group = getDeveloperToolGroup(tool.group);
		return {
			match: tool.route,
			title: tool.title,
			subtitle: tool.description,
			areaLabel: group?.title ?? "Developer",
			family: "developer",
			familyLabel: "Developer",
			icon: developerGroupIconMap[tool.group] ?? AppWindow,
		};
	});

const shellRouteMeta: readonly ShellRouteMeta[] = [
	{
		match: "/app/draft/drawing-list-manager",
		title: "Drawing List Manager",
		subtitle:
			"Issued-set indexing, title-block scans, and drawing register control.",
		areaLabel: "Draft",
		family: "draft",
		familyLabel: "Draft",
		icon: PencilRuler,
	},
	{
		match: "/app/developer",
		title: "Developer",
		subtitle:
			"Control, architecture, and lab surfaces that stay outside the released customer shell.",
		areaLabel: "Developer",
		family: "developer",
		familyLabel: "Developer",
		icon: ClipboardList,
	},
	{
		match: "/app/draft/block-library",
		title: "Block Library",
		subtitle: "Reusable CAD block catalog for released drafting work.",
		areaLabel: "Draft",
		family: "draft",
		familyLabel: "Draft",
		icon: PencilRuler,
	},
	{
		match: "/app/review/standards-checker",
		title: "Standards Checker",
		subtitle:
			"Released standards validation and readiness review for engineering deliverables.",
		areaLabel: "Review",
		family: "review",
		familyLabel: "Review",
		icon: ShieldCheck,
	},
	{
		match: "/app/projects/transmittal-builder",
		title: "Transmittal Builder",
		subtitle:
			"Project release packaging, document packets, and delivery context.",
		areaLabel: "Projects",
		family: "projects",
		familyLabel: "Projects",
		icon: FolderOpen,
	},
	{
		match: "/app/review/math-tools",
		title: "Math tools",
		subtitle: "Formulas and calculators that support review and field validation work.",
		areaLabel: "Review",
		family: "review",
		familyLabel: "Review",
		icon: ShieldCheck,
	},
	...developerToolShellMeta,
	{
		match: "/app/home",
		title: "Home",
		subtitle:
			"Calm suite board for current work, product entry points, and restrained trust signals.",
		areaLabel: "Home",
		family: "home",
		familyLabel: "Home",
		icon: House,
	},
	{
		match: "/app/projects",
		title: "Projects",
		subtitle:
			"Project notebook for notes, meetings, files, stage status, review, and release context.",
		areaLabel: "Projects",
		family: "projects",
		familyLabel: "Projects",
		icon: FolderOpen,
	},
	{
		match: "/app/draft",
		title: "Draft",
		subtitle:
			"Released drafting surfaces for drawing indexes, reusable assets, and customer-ready authoring support.",
		areaLabel: "Draft",
		family: "draft",
		familyLabel: "Draft",
		icon: PencilRuler,
	},
	{
		match: "/app/review",
		title: "Review",
		subtitle:
			"Standards validation, readiness summaries, and issue-path review work.",
		areaLabel: "Review",
		family: "review",
		familyLabel: "Review",
		icon: ShieldCheck,
	},
	{
		match: "/app/settings",
		title: "Settings",
		subtitle: "Account controls and workspace preferences.",
		areaLabel: "Settings",
		family: "settings",
		familyLabel: "Settings",
		icon: Settings,
	},
] as const;

const defaultShellMeta: ShellRouteMeta = {
	match: "/app",
	title: "Home",
	subtitle:
		"Calm suite board for projects, drafting, review, and developer handoff.",
	areaLabel: "Home",
	family: "home",
	familyLabel: "Home",
	icon: House,
};

const shellRouteMetaByPriority = [...shellRouteMeta].sort(
	(left, right) => right.match.length - left.match.length,
);

export function resolveShellMeta(pathname: string): ShellRouteMeta {
	return (
		shellRouteMetaByPriority.find((item) => pathname.startsWith(item.match)) ??
		defaultShellMeta
	);
}
