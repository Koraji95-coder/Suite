import type { ReactNode } from "react";

interface DashboardWidget {
	id: string;
	visible: boolean;
}

interface DashboardOverviewWidgetGridProps {
	visibleWidgets: DashboardWidget[];
	widgetMap: Record<string, ReactNode>;
}

const gridWidgetIds = new Set(["calendar", "activity", "recent-files"]);

export function DashboardOverviewWidgetGrid({
	visibleWidgets,
	widgetMap,
}: DashboardOverviewWidgetGridProps) {
	const elements: ReactNode[] = [];
	let index = 0;

	while (index < visibleWidgets.length) {
		const currentWidget = visibleWidgets[index];
		const currentElement = widgetMap[currentWidget.id];

		if (!currentElement) {
			index += 1;
			continue;
		}

		if (gridWidgetIds.has(currentWidget.id)) {
			const gridChildren: ReactNode[] = [currentElement];
			const nextWidget = visibleWidgets[index + 1];
			if (nextWidget && gridWidgetIds.has(nextWidget.id)) {
				const nextElement = widgetMap[nextWidget.id];
				if (nextElement) gridChildren.push(nextElement);
				index += 2;
			} else {
				index += 1;
			}

			elements.push(
				<div
					key={`grid-${currentWidget.id}`}
					className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
				>
					{gridChildren}
				</div>,
			);
		} else {
			elements.push(currentElement);
			index += 1;
		}
	}

	return <>{elements}</>;
}
