// src/components/apps/dashboard/DashboardOverviewPanel.tsx
import { LayoutDashboard, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
// Primitives
import { Heading, Text } from "@/components/primitives/Text";
import { ActiveProjectsList } from "./ActiveProjectsList";
import "./dashboard.global.css";
import { DashboardCustomizer } from "./DashboardCustomizer";
import styles from "./DashboardOverviewPanel.module.css";
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
				isLoading={isLoading}
			/>
		),
		calendar: <DashboardUpcomingPanel key="calendar" />,
		projects: (
			<ActiveProjectsList
				key="projects"
				projects={projects}
				projectTaskCounts={projectTaskCounts}
				isLoading={isLoading}
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
		<div className={styles.root}>
			{/* Header */}
			<div className={styles.headerRow}>
				<div className={styles.headerIdentity}>
					<div className={styles.heroMark}>
						<LayoutDashboard size={22} />
					</div>
					<div>
						<div className={styles.titleRow}>
							<Heading level={1} className={styles.title}>
								Dashboard
							</Heading>
							{editMode && (
								<Badge color="warning" variant="soft">
									Editing
								</Badge>
							)}
						</div>
						<Text size="sm" color="muted" className={styles.subtitle}>
							Your workspace overview, tasks, and deadlines
						</Text>
					</div>
				</div>

				<Button
					variant={editMode ? "primary" : "outline"}
					size="sm"
					onClick={() => setEditMode(!editMode)}
					iconLeft={<Settings2 size={14} />}
				>
					{editMode ? "Done" : "Customize"}
				</Button>
			</div>

			{/* Customizer panel */}
			{editMode && (
				<Panel
					variant="outline"
					padding="lg"
					className={styles.customizerPanel}
				>
					<DashboardCustomizer
						widgets={widgets}
						onToggle={toggleWidget}
						onReorder={reorderWidgets}
						onReset={resetLayout}
						onClose={() => setEditMode(false)}
					/>
				</Panel>
			)}

			{/* Widget grid */}
			<DashboardOverviewWidgetGrid
				visibleWidgets={visibleWidgets}
				widgetMap={widgetMap}
			/>
		</div>
	);
}
