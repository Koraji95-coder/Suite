import { Activity } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { ActivityLogRow } from "@/services/activityService";
import { TieredCard } from "../ui/TieredCard";
import { bubbleStyle } from "./dashboardStyles";
import { getCategoryColor } from "./dashboardUtils";

interface ProjectSummary {
	id: string;
	category: string | null;
}

interface RecentActivityListProps {
	activities: ActivityLogRow[];
	allProjectsMap: Map<string, ProjectSummary>;
}

export function RecentActivityList({
	activities,
	allProjectsMap,
}: RecentActivityListProps) {
	const { palette } = useTheme();
	return (
		<TieredCard
			tier="solid"
			tint={palette.accent}
			className="p-7"
		>
			<div className="relative z-10">
				<div className="flex items-center space-x-2 mb-4">
					<div
						className="p-2 rounded-lg"
						style={{
							background: `linear-gradient(135deg, ${hexToRgba(palette.accent, 0.25)} 0%, ${hexToRgba(palette.accent, 0.08)} 100%)`,
							boxShadow: `0 0 16px ${hexToRgba(palette.accent, 0.12)}`,
						}}
					>
						<Activity className="w-5 h-5" style={{ color: palette.accent }} />
					</div>
					<h3
						className="text-xl font-bold"
						style={{ color: palette.primary }}
					>
						Recent Activity
					</h3>
				</div>

				<div className="space-y-3">
					{activities.length === 0 ? (
						<p
							className="text-sm"
							style={{ color: hexToRgba(palette.text, 0.3) }}
						>
							No recent activity
						</p>
					) : (
						activities.map((activity) => {
							const project = activity.project_id
								? allProjectsMap.get(activity.project_id)
								: undefined;
							const dotColor = project?.category
								? getCategoryColor(project.category)
								: palette.primary;
							return (
								<div
									key={activity.id}
									className="flex items-start space-x-3 px-5 py-4 transition-all duration-300 hover:scale-[1.01] hover:-translate-y-px"
									style={bubbleStyle(palette, palette.accent)}
								>
									<div className="mt-1.5">
										<div
											className="w-2 h-2 rounded-full"
											style={{
												backgroundColor: dotColor,
												boxShadow: `0 0 8px ${hexToRgba(dotColor, 0.5)}`,
											}}
										/>
									</div>
									<div className="flex-1">
										<p
											className="text-sm font-medium"
											style={{ color: hexToRgba(palette.text, 0.85) }}
										>
											{activity.description}
										</p>
										<p
											className="text-xs mt-1"
											style={{ color: hexToRgba(palette.text, 0.35) }}
										>
											{new Date(activity.timestamp).toLocaleString()}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</TieredCard>
	);
}
