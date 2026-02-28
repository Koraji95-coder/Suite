import type { PostgrestError } from "@supabase/supabase-js";
import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/errorLogger";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";
import type { ActivityLogRow } from "@/services/activityService";
import { dashboardInfo } from "../../../data/panelInfo";
import { PanelInfoDialog } from "../../../data/PanelInfoDialog";
import { ActiveProjectsList } from "./ActiveProjectsList";
import { DashboardCustomizer } from "./DashboardCustomizer";
import { DashboardUpcomingPanel } from "./DashboardUpcomingPanel";
import { RecentActivityList } from "./RecentActivityList";
import { RecentFilesWidget } from "./RecentFilesWidget";
import { StatsCards } from "./StatsCards";
import { useDashboardLayout } from "./useDashboardLayout";

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

interface TaskDueItem {
	id: string;
	name: string;
	due_date: string;
	project_id: string;
	completed: boolean;
}

interface FileSize {
	size: number;
}

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
	const [projects, setProjects] = useState<Project[]>([]);
	const [activities, setActivities] = useState<ActivityLogRow[]>([]);
	const [storageUsed, setStorageUsed] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [projectTaskCounts, setProjectTaskCounts] = useState<
		Map<string, TaskCount>
	>(new Map());

	const getCurrentUserId = useCallback(async (): Promise<string | null> => {
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();
		if (error || !user) {
			logger.error("MainDashboard", "Missing authenticated user", { error });
			return null;
		}
		return user.id;
	}, []);

	const toLocalDay = useCallback((iso: string) => {
		const [y, m, d] = iso.split("T")[0].split("-").map(Number);
		return new Date(y, m - 1, d);
	}, []);

	const loadAllProjectTaskCounts = useCallback(
		async (projectList: Project[]) => {
			if (projectList.length === 0) return;
			const userId = await getCurrentUserId();
			if (!userId) return;

			const result = await safeSupabaseQuery(async () => {
				return (await supabase
					.from("tasks")
					.select("id, project_id, completed, due_date, name")
					.eq("user_id", userId)
					.in(
						"project_id",
						projectList.map((p) => p.id),
					)) as { data: TaskDueItem[] | null; error: PostgrestError | null };
			}, "MainDashboard");

			const { data, error } = result;

			if (error) {
				// Silent fallback - dashboard can function without task counts
				logger.debug("MainDashboard", "Task counts unavailable", { error });
				return;
			}

			if (!data) return;

			// Group tasks by project_id once
			const byProject = new Map<string, TaskDueItem[]>();
			for (const t of data) {
				const arr = byProject.get(t.project_id);
				if (arr) arr.push(t);
				else byProject.set(t.project_id, [t]);
			}

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const counts = new Map<string, TaskCount>();

			for (const p of projectList) {
				const projectTasks = byProject.get(p.id) ?? [];
				const total = projectTasks.length;

				let completed = 0;
				let hasOverdue = false;
				let nextDue: { name: string; date: string } | null = null;
				let nextDueDate: Date | null = null;

				for (const t of projectTasks) {
					if (t.completed) {
						completed += 1;
						continue;
					}
					if (!t.due_date) continue;

					const due = toLocalDay(t.due_date);

					if (due < today) {
						hasOverdue = true;
						continue;
					}

					if (!nextDueDate || due < nextDueDate) {
						nextDueDate = due;
						nextDue = { name: t.name, date: t.due_date };
					}
				}

				counts.set(p.id, { total, completed, nextDue, hasOverdue });
			}

			setProjectTaskCounts(counts);
		},
		[toLocalDay, getCurrentUserId],
	);

	const loadDashboardData = useCallback(async () => {
		let alive = true;
		try {
			const userId = await getCurrentUserId();
			if (!userId) {
				if (alive) {
					setProjects([]);
					setActivities([]);
					setStorageUsed(0);
					setIsLoading(false);
				}
				return;
			}

			setIsLoading(true);
			logger.info("MainDashboard", "Loading dashboard data...");

			const [projectsResult, activitiesResult, filesResult] = await Promise.all(
				[
					safeSupabaseQuery(
						async () =>
							await supabase
								.from("projects")
								.select("*")
								.eq("user_id", userId)
								.eq("status", "active")
								.order("deadline", { ascending: true, nullsFirst: false })
								.limit(5),
						"MainDashboard",
					),
					safeSupabaseQuery(
						async () =>
							await supabase
								.from("activity_log")
								.select("*")
								.eq("user_id", userId)
								.order("timestamp", { ascending: false })
								.limit(7),
						"MainDashboard",
					),
					safeSupabaseQuery(
						async () =>
							await supabase.from("files").select("size").eq("user_id", userId),
						"MainDashboard",
					),
				],
			);

			if (!alive) return;

			const { data: projectsData, error: projectsError } = projectsResult;
			const { data: activitiesData, error: activitiesError } = activitiesResult;
			const { data: filesData, error: filesError } = filesResult;

			// Only log non-configuration errors
			if (projectsError && projectsError.code !== "SUPABASE_NOT_CONFIGURED") {
				logger.error("MainDashboard", "Failed to load projects", {
					error: projectsError,
				});
			}
			if (
				activitiesError &&
				activitiesError.code !== "SUPABASE_NOT_CONFIGURED"
			) {
				logger.error("MainDashboard", "Failed to load activities", {
					error: activitiesError,
				});
			}
			if (filesError && filesError.code !== "SUPABASE_NOT_CONFIGURED") {
				logger.error("MainDashboard", "Failed to load files data", {
					error: filesError,
				});
			}

			if (projectsData) {
				setProjects(projectsData);
				loadAllProjectTaskCounts(projectsData);
			} else {
				setProjects([]);
			}

			if (activitiesData) {
				setActivities(activitiesData);
			} else {
				setActivities([]);
			}

			if (filesData && Array.isArray(filesData)) {
				const totalSize = (filesData as FileSize[]).reduce(
					(sum: number, f: FileSize) => sum + (f.size || 0),
					0,
				);
				setStorageUsed(totalSize);
			} else {
				setStorageUsed(0);
			}
		} catch (error) {
			logger.critical(
				"MainDashboard",
				"Critical error loading dashboard data",
				{ error },
			);
		} finally {
			if (alive) setIsLoading(false);
		}

		return () => {
			alive = false;
		};
	}, [loadAllProjectTaskCounts, getCurrentUserId]);

	useEffect(() => {
		const cleanupPromise = loadDashboardData();
		return () => {
			cleanupPromise.then((cleanup) => {
				if (typeof cleanup === "function") cleanup();
			});
		};
	}, [loadDashboardData]);

	// Build map of all projects (including inactive) for activity colors
	const [allProjectsMap, setAllProjectsMap] = useState<Map<string, Project>>(
		new Map(),
	);
	useEffect(() => {
		const loadProjectsForActivities = async () => {
			const userId = await getCurrentUserId();
			if (!userId) {
				setAllProjectsMap(new Map());
				return;
			}

			const activityProjectIds = activities
				.filter(
					(a) => a.project_id && !projects.some((p) => p.id === a.project_id),
				)
				.map((a) => a.project_id!);
			if (activityProjectIds.length === 0) {
				setAllProjectsMap(new Map(projects.map((p) => [p.id, p])));
				return;
			}
			const { data } = (await supabase
				.from("projects")
				.select("id, name, deadline, status, priority, color, category")
				.eq("user_id", userId)
				.in("id", activityProjectIds)) as { data: Project[] | null };
			const merged = new Map(projects.map((p) => [p.id, p]));
			if (data) data.forEach((p) => merged.set(p.id, p));
			setAllProjectsMap(merged);
		};
		loadProjectsForActivities();
	}, [activities, projects, getCurrentUserId]);

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

	const visibleWidgets = widgets.filter((w) => w.visible);

	const widgetMap: Record<string, React.ReactNode> = {
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
		calendar: (
			<div key="calendar" className="min-h-[220px]">
				<DashboardUpcomingPanel />
			</div>
		),
		activity: (
			<RecentActivityList
				key="activity"
				activities={activities}
				allProjectsMap={allProjectsMap}
			/>
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
	};

	const gridIds = new Set(["calendar", "activity", "recent-files"]);

	const renderWidgets = () => {
		const elements: React.ReactNode[] = [];
		let i = 0;
		while (i < visibleWidgets.length) {
			const w = visibleWidgets[i];
			if (gridIds.has(w.id)) {
				const gridChildren: React.ReactNode[] = [widgetMap[w.id]];
				if (
					i + 1 < visibleWidgets.length &&
					gridIds.has(visibleWidgets[i + 1].id)
				) {
					gridChildren.push(widgetMap[visibleWidgets[i + 1].id]);
					i += 2;
				} else {
					i += 1;
				}
				elements.push(
					<div
						key={`grid-${w.id}`}
						className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-10"
					>
						{gridChildren}
					</div>,
				);
			} else {
				elements.push(widgetMap[w.id]);
				i += 1;
			}
		}
		return elements;
	};

	return (
		<div className="space-y-10">
			<div className="flex justify-end gap-2">
				<button
					onClick={() => setEditMode(!editMode)}
					className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
					style={{
						...glassCardInnerStyle(palette, palette.primary),
						color: editMode ? palette.text : palette.primary,
						background: editMode ? hexToRgba(palette.primary, 0.2) : undefined,
					}}
					aria-label="Customize dashboard"
				>
					<Settings2 className="w-4 h-4" />
					Customize
				</button>
				<PanelInfoDialog
					title={dashboardInfo.title}
					sections={dashboardInfo.sections}
					colorScheme={dashboardInfo.colorScheme}
				/>
			</div>

			{editMode && (
				<DashboardCustomizer
					widgets={widgets}
					onToggle={toggleWidget}
					onReorder={reorderWidgets}
					onReset={resetLayout}
					onClose={() => setEditMode(false)}
				/>
			)}

			{renderWidgets()}
		</div>
	);
}
