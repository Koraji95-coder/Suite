// src/components/apps/dashboard/DashboardOverviewPanel.tsx
import { Settings2, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ActiveProjectsList } from "./ActiveProjectsList";
import { DashboardCustomizer } from "./DashboardCustomizer";
import { DashboardOverviewWidgetGrid } from "./DashboardOverviewWidgetGrid";
import { DashboardUpcomingPanel } from "./DashboardUpcomingPanel";
import { RecentActivityList } from "./RecentActivityList";
import { RecentFilesWidget } from "./RecentFilesWidget";
import { StatsCards } from "./StatsCards";
import { useDashboardLayout } from "./useDashboardLayout";
import { useDashboardOverviewData } from "./useDashboardOverviewData";

// Primitives
import { Text, Heading } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";

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
    onNavigateToProject ?? ((projectId: string) => navigate(`/app/projects/${projectId}`));
  const handleNavigateToProjectsHub =
    onNavigateToProjectsHub ?? (() => navigate("/app/projects"));

  const openTasks = Array.from(projectTaskCounts.values()).reduce(
    (total, counts) => total + Math.max(counts.total - counts.completed, 0),
    0
  );
  const overdueProjects = Array.from(projectTaskCounts.values()).filter(
    (counts) => counts.hasOverdue
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
    calendar: <DashboardUpcomingPanel key="calendar" />,
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
    <Stack gap={6}>
      {/* Header */}
      <HStack justify="between" align="center" wrap className="gap-4">
        <HStack gap={3} align="center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-accent/20 text-primary">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <HStack gap={2} align="center">
              <Heading level={1}>Dashboard</Heading>
              {editMode && (
                <Badge color="warning" variant="soft">
                  Editing
                </Badge>
              )}
            </HStack>
            <Text size="sm" color="muted">
              Your workspace overview, tasks, and deadlines
            </Text>
          </div>
        </HStack>

        <Button
          variant={editMode ? "primary" : "outline"}
          size="sm"
          onClick={() => setEditMode(!editMode)}
          iconLeft={<Settings2 size={14} />}
        >
          {editMode ? "Done" : "Customize"}
        </Button>
      </HStack>

      {/* Customizer panel */}
      {editMode && (
        <Panel variant="outline" padding="lg" className="border-warning/30 bg-warning/5">
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
    </Stack>
  );
}