import { ChevronRight, Filter, Home, Plus, Search } from "lucide-react";
import {
	type ColorScheme,
	glassCardInnerStyle,
	hexToRgba,
} from "@/lib/palette";
import { PanelInfoDialog } from "../../../data/PanelInfoDialog";
import { projectsInfo } from "../../../data/panelInfo";
import { GlassPanel } from "../ui/GlassPanel";
import type { StatusFilter } from "./projectmanagertypes";

interface ProjectManagerHeaderProps {
	palette: ColorScheme;
	currentCrumb: string;
	statusFilter: StatusFilter;
	onStatusFilterChange: (status: StatusFilter) => void;
	projectSearch: string;
	onProjectSearchChange: (value: string) => void;
	activeProjects: number;
	archivedProjects: number;
	totalProjects: number;
	onCreateProject: () => void;
	onGoWorkspace: () => void;
	onGoProjects: () => void;
}

export function ProjectManagerHeader({
	palette,
	currentCrumb,
	statusFilter,
	onStatusFilterChange,
	projectSearch,
	onProjectSearchChange,
	activeProjects,
	archivedProjects,
	totalProjects,
	onCreateProject,
	onGoWorkspace,
	onGoProjects,
}: ProjectManagerHeaderProps) {
	const primaryActionStyle = {
		...glassCardInnerStyle(palette, palette.primary),
		color: hexToRgba(palette.text, 0.9),
	};
	const subtleActionStyle = {
		...glassCardInnerStyle(palette, palette.secondary),
		color: hexToRgba(palette.text, 0.75),
	};
	const searchInputStyle = {
		background: hexToRgba(palette.surface, 0.45),
		border: `1px solid ${hexToRgba(palette.primary, 0.22)}`,
		color: hexToRgba(palette.text, 0.9),
		"--tw-ring-color": hexToRgba(palette.primary, 0.45),
	} as React.CSSProperties;

	return (
		<GlassPanel
			variant="toolbar"
			padded
			hoverEffect={false}
			tint={palette.primary}
			className="p-6 xl:p-8"
		>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em]">
							<button
								type="button"
								onClick={onGoWorkspace}
								className="flex items-center gap-1.5 hover:underline"
								style={{ color: hexToRgba(palette.text, 0.45) }}
							>
								<Home className="h-3.5 w-3.5" />
								Workspace
							</button>
							<ChevronRight
								className="h-3 w-3"
								style={{ color: hexToRgba(palette.text, 0.35) }}
							/>
							<button
								type="button"
								onClick={onGoProjects}
								className="hover:underline"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Projects
							</button>
							<ChevronRight
								className="h-3 w-3"
								style={{ color: hexToRgba(palette.text, 0.35) }}
							/>
							<span style={{ color: hexToRgba(palette.text, 0.7) }}>
								{currentCrumb}
							</span>
						</div>
						<div>
							<h2
								className="text-2xl font-semibold tracking-tight"
								style={{ color: hexToRgba(palette.text, 0.95) }}
							>
								Project Manager
							</h2>
							<p
								className="text-sm"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Track workstreams, deadlines, and deliverables in one place.
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							onClick={onCreateProject}
							className="px-6 py-3 rounded-xl transition-all flex items-center space-x-2 font-semibold text-sm hover:scale-[1.02]"
							style={primaryActionStyle}
						>
							<Plus className="w-4 h-4" />
							<span>New Project</span>
						</button>
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
								style={subtleActionStyle}
							>
								<Filter className="h-3.5 w-3.5" />
								Filters
							</button>
							<PanelInfoDialog
								title={projectsInfo.title}
								sections={projectsInfo.sections}
								colorScheme={projectsInfo.colorScheme}
							/>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex flex-wrap gap-2">
						{(["active", "all", "on-hold", "archived"] as StatusFilter[]).map(
							(status) => {
								const isActive = statusFilter === status;
								return (
									<button
										key={status}
										onClick={() => onStatusFilterChange(status)}
										className="px-4 py-2 text-xs font-semibold rounded-full transition-all"
										style={{
											background: isActive
												? hexToRgba(palette.primary, 0.22)
												: hexToRgba(palette.surface, 0.32),
											border: `1px solid ${hexToRgba(
												isActive ? palette.primary : palette.text,
												isActive ? 0.5 : 0.08,
											)}`,
											color: hexToRgba(palette.text, isActive ? 0.92 : 0.6),
										}}
									>
										{status.charAt(0).toUpperCase() +
											status.slice(1).replace("-", " ")}
									</button>
								);
							},
						)}
					</div>

					<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
						<div className="relative w-full sm:max-w-sm">
							<Search
								className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
								style={{ color: hexToRgba(palette.primary, 0.8) }}
							/>
							<input
								type="text"
								value={projectSearch}
								onChange={(event) => onProjectSearchChange(event.target.value)}
								placeholder="Search projects..."
								className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-white/30 focus:outline-none focus:ring-2"
								style={searchInputStyle}
							/>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span
								className="rounded-full px-3 py-1"
								style={{
									background: hexToRgba(palette.surface, 0.4),
									border: `1px solid ${hexToRgba(palette.text, 0.1)}`,
									color: hexToRgba(palette.text, 0.65),
								}}
							>
								{activeProjects} active
							</span>
							<span
								className="rounded-full px-3 py-1"
								style={{
									background: hexToRgba(palette.surface, 0.4),
									border: `1px solid ${hexToRgba(palette.text, 0.1)}`,
									color: hexToRgba(palette.text, 0.65),
								}}
							>
								{archivedProjects} archived
							</span>
							<span
								className="rounded-full px-3 py-1"
								style={{
									background: hexToRgba(palette.primary, 0.18),
									border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
									color: hexToRgba(palette.primary, 0.9),
								}}
							>
								{totalProjects} total
							</span>
						</div>
					</div>
				</div>
			</div>
		</GlassPanel>
	);
}
