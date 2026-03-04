// src/components/apps/dashboard/DashboardOverviewWidgetGrid.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./DashboardOverviewWidgetGrid.module.css";

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
		(w) => w.id !== "stats" && w.id !== "projects",
	);

	return (
		<div className={styles.root}>
			{/* Stats row - full width */}
			{statsWidget && widgetMap[statsWidget.id] && (
				<div>{widgetMap[statsWidget.id]}</div>
			)}

			{/* Main content grid */}
			<div className={styles.mainGrid}>
				{/* Left column - Projects (wider) */}
				{projectsWidget && widgetMap[projectsWidget.id] && (
					<div className={styles.leftSpan}>{widgetMap[projectsWidget.id]}</div>
				)}

				{/* Right column - Other widgets stacked */}
				{otherWidgets.length > 0 && (
					<div
						className={cn(
							styles.rightColumn,
							projectsWidget ? styles.rightSpan : styles.fullSpan,
						)}
					>
						{/* Two-column grid for smaller widgets */}
						<div className={styles.widgetsGrid}>
							{otherWidgets.map((widget) => {
								const element = widgetMap[widget.id];
								if (!element) return null;
								return (
									<div key={widget.id} className={styles.widgetCell}>
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
