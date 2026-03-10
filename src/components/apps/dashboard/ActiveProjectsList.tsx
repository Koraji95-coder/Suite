// src/components/apps/dashboard/ActiveProjectsList.tsx
import {
	AlertCircle,
	AlertTriangle,
	ChevronRight,
	FolderKanban,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";

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
	isLoading?: boolean;
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

export function ActiveProjectsList({
	projects,
	projectTaskCounts,
	isLoading = false,
	onNavigateToProject,
	onNavigateToProjectsHub,
}: ActiveProjectsListProps) {
	const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

	return (
		<Panel variant="default" padding="lg">
			<Stack gap={5}>
				{/* Header */}
				<HStack justify="between" align="center">
					<HStack gap={3} align="center">
						<div
							className={cn(
								"suite-dashboard-icon-mark",
								"suite-dashboard-icon-mark-sm",
								"suite-dashboard-active-projects-mark",
							)}
						>
							<FolderKanban size={18} />
						</div>
						<Text size="lg" weight="bold" color="primary">
							Active Projects
						</Text>
						<Badge variant="soft" size="sm">
							{projects.length} active
						</Badge>
					</HStack>

					<Button
						variant="secondary"
						size="sm"
						onClick={() => onNavigateToProjectsHub?.()}
						iconRight={<ChevronRight size={14} />}
					>
						View All
					</Button>
				</HStack>

				{/* Project list */}
				<Stack gap={3}>
					{isLoading ? (
						<>
							{[1, 2, 3].map((item) => (
								<div
									key={item}
									className="suite-dashboard-active-projects-skeleton"
								/>
							))}
						</>
					) : projects.length === 0 ? (
						<Text size="sm" color="muted">
							No active projects
						</Text>
					) : (
						projects.map((project) => {
							const taskCount = projectTaskCounts.get(project.id);
							const catColor = getCategoryColor(project.category);
							const isHovered = hoveredProjectId === project.id;

							return (
								<button
									key={project.id}
									type="button"
									onClick={() => onNavigateToProject?.(project.id)}
									onMouseEnter={() => setHoveredProjectId(project.id)}
									onMouseLeave={() => setHoveredProjectId(null)}
									className={cn(
										"suite-dashboard-active-project-card",
										isHovered &&
											"suite-dashboard-active-project-card-hovered",
									)}
								>
									<HStack
										justify="between"
										align="start"
										className="suite-dashboard-active-project-row"
									>
										<HStack
											gap={3}
											align="start"
											className="suite-dashboard-active-project-content"
										>
											{/* Category dot */}
											<div
												className="suite-dashboard-active-project-dot"
												style={{
													backgroundColor: catColor,
													boxShadow: `0 0 8px ${catColor}50`,
												}}
											/>

											{/* Project info */}
											<Stack gap={2} className="suite-dashboard-active-project-info">
												<Text size="sm" weight="semibold">
													{project.name}
												</Text>

												<HStack gap={3} align="center">
													<Text
														size="sm"
														style={{ color: getUrgencyColor(project.deadline) }}
													>
														{formatDeadline(project.deadline)}
													</Text>
													{taskCount && (
														<Text size="xs" color="muted">
															{taskCount.completed}/{taskCount.total} tasks
														</Text>
													)}
												</HStack>

												{/* Overdue warning */}
												{taskCount?.hasOverdue && (
													<HStack gap={2} align="center">
														<AlertCircle
															size={12}
															className="suite-dashboard-text-danger"
														/>
														<Text size="xs" color="danger">
															Overdue tasks
														</Text>
													</HStack>
												)}

												{/* Next due task */}
												{taskCount?.nextDue && (
													<HStack gap={2} align="center">
														<AlertTriangle
															size={12}
															className="suite-dashboard-text-warning"
														/>
														<Text
															size="xs"
															style={{
																color: getTaskUrgencyColor(
																	taskCount.nextDue.date,
																),
															}}
														>
															Task: "{taskCount.nextDue.name}" Due{" "}
															{formatDateOnly(taskCount.nextDue.date)}
														</Text>
													</HStack>
												)}
											</Stack>
										</HStack>

										<ChevronRight
											size={18}
											className="suite-dashboard-chevron-soft"
										/>
									</HStack>
								</button>
							);
						})
					)}
				</Stack>
			</Stack>
		</Panel>
	);
}
