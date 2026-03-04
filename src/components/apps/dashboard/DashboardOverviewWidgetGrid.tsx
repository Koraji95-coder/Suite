// src/components/apps/dashboard/DashboardOverviewWidgetGrid.tsx
import type { ReactNode } from "react";

interface DashboardWidget {
  id: string;
  visible: boolean;
}

interface DashboardOverviewWidgetGridProps {
  visibleWidgets: DashboardWidget[];
  widgetMap: Record<string, ReactNode>;
}

export function DashboardOverviewWidgetGrid({
  visibleWidgets,
  widgetMap,
}: DashboardOverviewWidgetGridProps) {
  // Separate widgets by type for smart layout
  const statsWidget = visibleWidgets.find((w) => w.id === "stats");
  const projectsWidget = visibleWidgets.find((w) => w.id === "projects");
  const otherWidgets = visibleWidgets.filter(
    (w) => w.id !== "stats" && w.id !== "projects"
  );

  return (
    <div className="space-y-6">
      {/* Stats row - full width */}
      {statsWidget && widgetMap[statsWidget.id] && (
        <div>{widgetMap[statsWidget.id]}</div>
      )}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column - Projects (wider) */}
        {projectsWidget && widgetMap[projectsWidget.id] && (
          <div className="lg:col-span-5">
            {widgetMap[projectsWidget.id]}
          </div>
        )}

        {/* Right column - Other widgets stacked */}
        {otherWidgets.length > 0 && (
          <div className={`space-y-6 ${projectsWidget ? "lg:col-span-7" : "lg:col-span-12"}`}>
            {/* Two-column grid for smaller widgets */}
            <div className="grid gap-6 md:grid-cols-2">
              {otherWidgets.map((widget) => {
                const element = widgetMap[widget.id];
                if (!element) return null;
                return (
                  <div key={widget.id} className="min-h-75">
                    {element}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}