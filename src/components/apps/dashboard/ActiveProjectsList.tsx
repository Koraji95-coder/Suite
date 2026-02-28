import { AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import { bubbleStyle, softButtonStyle } from "./dashboardStyles";
import {
	formatDateOnly,
	formatDeadline,
	getCategoryColor,
	getTaskUrgencyColor,
	getUrgencyColor,
} from "./dashboardUtils";

interface Project {
	id: string;
	name: string;
	deadline: string | null;
	status: string;
	priority: string;
	color: string;
	category: string | null;
}

interface TaskCount {
	total: number;
	completed: number;
	nextDue: { name: string; date: string } | null;
	hasOverdue: boolean;
}

interface ActiveProjectsListProps {
	projects: Project[];
	projectTaskCounts: Map<string, TaskCount>;
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

export function ActiveProjectsList({
	projects,
	projectTaskCounts,
	onNavigateToProject,
	onNavigateToProjectsHub,
}: ActiveProjectsListProps) {
	const { palette } = useTheme();
	const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
	return (
		<GlassPanel
			tint={palette.secondary}
			hoverEffect={false}
			specular={false}
			bevel={false}
			className="p-8 xl:p-9 group"
		>
			<div className="relative z-10">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<h3
							className="text-xl font-bold"
							style={{ color: palette.primary }}
						>
							Active Projects
						</h3>
						<span
							className="text-xs px-2.5 py-1 rounded-full border"
							style={{
								color: hexToRgba(palette.text, 0.65),
								borderColor: hexToRgba(palette.text, 0.1),
								background: hexToRgba(palette.surface, 0.4),
							}}
						>
							{projects.length} active
						</span>
					</div>
					<button
						onClick={() => onNavigateToProjectsHub?.()}
						className="text-sm flex items-center space-x-1 px-3 py-1 rounded-lg transition-all hover:opacity-90"
						style={{
							...softButtonStyle(palette, palette.primary),
							color: palette.primary,
						}}
					>
						<span>View All</span>
						<ChevronRight className="w-4 h-4" />
					</button>
				</div>

				<div className="space-y-4">
					{projects.length === 0 ? (
						<p
							className="text-sm"
							style={{ color: hexToRgba(palette.text, 0.3) }}
						>
							No active projects
						</p>
					) : (
						projects.map((project) => {
							const taskCount = projectTaskCounts.get(project.id);
							const catColor = getCategoryColor(project.category);
							const isHovered = hoveredProjectId === project.id;

							const baseStyle = bubbleStyle(palette, catColor);
							return (
								<div
									key={project.id}
									className="px-5 py-4 cursor-pointer transition-all duration-300 hover:-translate-y-1.5"
									style={{
										...baseStyle,
										border: `1px solid ${
											isHovered
												? hexToRgba(catColor, 0.3)
												: hexToRgba(palette.text, 0.08)
										}`,
										boxShadow: isHovered
											? `0 16px 34px ${hexToRgba(catColor, 0.22)}`
											: `0 10px 26px ${hexToRgba("#000000", 0.18)}`,
									}}
									onClick={() => onNavigateToProject?.(project.id)}
									onMouseEnter={() => setHoveredProjectId(project.id)}
									onMouseLeave={() => setHoveredProjectId(null)}
								>
									<div className="flex items-start justify-between">
										<div className="flex items-start space-x-3 flex-1">
											<div
												className="w-3 h-3 rounded-full mt-1"
												style={{
													backgroundColor: catColor,
													boxShadow: `0 0 8px ${hexToRgba(catColor, 0.5)}`,
												}}
											/>
											<div className="flex-1">
												<h4
													className="font-semibold"
													style={{ color: hexToRgba(palette.text, 0.9) }}
												>
													{project.name}
												</h4>
												<div className="flex items-center space-x-3 mt-2.5">
													<span
														className="text-sm"
														style={{ color: getUrgencyColor(project.deadline) }}
													>
														{formatDeadline(project.deadline)}
													</span>
													{taskCount && (
														<span
															className="text-xs"
															style={{ color: hexToRgba(palette.text, 0.4) }}
														>
															{taskCount.completed}/{taskCount.total} tasks
														</span>
													)}
												</div>
												{taskCount?.hasOverdue && (
													<div className="flex items-center space-x-2 mt-1.5">
														<AlertCircle
															className="w-3 h-3"
															style={{ color: palette.tertiary }}
														/>
														<span
															className="text-xs"
															style={{
																color: hexToRgba(palette.tertiary, 0.9),
															}}
														>
															Overdue tasks
														</span>
													</div>
												)}
												{taskCount?.nextDue && (
													<div className="flex items-center space-x-2 mt-1.5">
														<AlertTriangle
															className="w-3 h-3"
															style={{ color: palette.secondary }}
														/>
														<span
															className="text-xs leading-relaxed"
															style={{
																color: getTaskUrgencyColor(
																	taskCount.nextDue.date,
																),
															}}
														>
															Task: &quot;{taskCount.nextDue.name}&quot; Due{" "}
															{formatDateOnly(taskCount.nextDue.date)}
														</span>
													</div>
												)}
											</div>
										</div>
										<ChevronRight
											className="w-5 h-5"
											style={{ color: hexToRgba(palette.primary, 0.6) }}
										/>
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
