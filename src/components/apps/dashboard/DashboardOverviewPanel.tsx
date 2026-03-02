import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { PanelInfoDialog } from "../../../data/PanelInfoDialog";
import { dashboardInfo } from "../../../data/panelInfo";
import { ActiveProjectsList } from "./ActiveProjectsList";
import { DashboardCustomizer } from "./DashboardCustomizer";
import { DashboardOverviewWidgetGrid } from "./DashboardOverviewWidgetGrid";
import { DashboardUpcomingPanel } from "./DashboardUpcomingPanel";
import { RecentActivityList } from "./RecentActivityList";
import { RecentFilesWidget } from "./RecentFilesWidget";
import { StatsCards } from "./StatsCards";
import { useDashboardLayout } from "./useDashboardLayout";
import { useDashboardOverviewData } from "./useDashboardOverviewData";

interface DashboardOverviewPanelProps {
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

export function DashboardOverviewPanel({
	onNavigateToProject,
	onNavigateToProjectsHub,
}: DashboardOverviewPanelProps) {
	const { palette } = useTheme();
	const navigate = useNavigate();
	const {
		widgets,
		editMode,
		setEditMode,
		toggleWidget,
		reorderWidgets,
		resetLayout,
	} = useDashboardLayout();
	const {
		projects,
		activities,
		storageUsed,
		isLoading,
		projectTaskCounts,
		allProjectsMap,
	} = useDashboardOverviewData();

	const handleNavigateToProject =
		onNavigateToProject ??
		((projectId: string) => navigate(`/app/projects/${projectId}`));
	const handleNavigateToProjectsHub =
		onNavigateToProjectsHub ?? (() => navigate("/app/projects"));

	const openTasks = Array.from(projectTaskCounts.values()).reduce(
		(total, counts) => total + Math.max(counts.total - counts.completed, 0),
		0,
	);
	const overdueProjects = Array.from(projectTaskCounts.values()).filter(
		(counts) => counts.hasOverdue,
	).length;

	const visibleWidgets = widgets.filter((widget) => widget.visible);

	const widgetMap: Record<string, ReactNode> = {
		activity: (
			<RecentActivityList
				key="activity"
				activities={activities}
				allProjectsMap={allProjectsMap}
			/>
		),
		calendar: (
			<div key="calendar" className="min-h-[220px]">
				<DashboardUpcomingPanel />
			</div>
		),
		projects: (
			<ActiveProjectsList
				key="projects"
				projects={projects}
				projectTaskCounts={projectTaskCounts}
				onNavigateToProject={handleNavigateToProject}
				onNavigateToProjectsHub={handleNavigateToProjectsHub}
			/>
		),
		"recent-files": <RecentFilesWidget key="recent-files" />,
		stats: (
			<StatsCards
				key="stats"
				projectsCount={projects.length}
				storageUsed={storageUsed}
				openTasks={openTasks}
				overdueProjects={overdueProjects}
				isLoading={isLoading}
			/>
		),
	};

	return (
		<div className="space-y-10">
			<div className="flex justify-end gap-2">
				<button
					onClick={() => setEditMode(!editMode)}
					className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
					style={{
						...glassCardInnerStyle(palette, palette.primary),
						color: editMode ? palette.text : palette.primary,
						background: editMode ? hexToRgba(palette.primary, 0.2) : undefined,
					}}
					aria-label="Customize dashboard"
				>
					<Settings2 className="h-4 w-4" />
					Customize
				</button>
				<PanelInfoDialog
					title={dashboardInfo.title}
					sections={dashboardInfo.sections}
					colorScheme={dashboardInfo.colorScheme}
				/>
			</div>

			{editMode ? (
				<DashboardCustomizer
					widgets={widgets}
					onToggle={toggleWidget}
					onReorder={reorderWidgets}
					onReset={resetLayout}
					onClose={() => setEditMode(false)}
				/>
			) : null}

			<DashboardOverviewWidgetGrid
				visibleWidgets={visibleWidgets}
				widgetMap={widgetMap}
			/>
		</div>
	);
}
