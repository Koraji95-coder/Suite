import { Activity } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { ActivityLogRow } from "@/services/activityService";
import { GlassPanel } from "../ui/GlassPanel";
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
		<GlassPanel
			tint={palette.accent}
			hoverEffect={false}
			specular={false}
			bevel={false}
			className="p-8 xl:p-9 group"
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
					<h3 className="text-xl font-bold" style={{ color: palette.primary }}>
						Recent Activity
					</h3>
				</div>

				<div className="relative space-y-4">
					<div
						className="absolute left-3.5 top-2 bottom-2 w-px"
						style={{
							background: `linear-gradient(180deg, ${hexToRgba(palette.primary, 0.15)} 0%, ${hexToRgba(palette.text, 0.08)} 100%)`,
						}}
					/>
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
									className="relative flex items-start gap-4 px-5 py-4 ps-10 transition-all duration-300 hover:-translate-y-1"
									style={{
										...bubbleStyle(palette, palette.accent),
										boxShadow: `0 10px 24px ${hexToRgba("#000000", 0.18)}`,
									}}
								>
									<div className="absolute left-2.5 top-5">
										<div
											className="w-2.5 h-2.5 rounded-full border"
											style={{
												backgroundColor: dotColor,
												borderColor: hexToRgba("#ffffff", 0.35),
												boxShadow: `0 0 10px ${hexToRgba(dotColor, 0.55)}`,
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
		</GlassPanel>
	);
}
