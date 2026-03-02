import type { PostgrestError } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/errorLogger";
import type { ActivityLogRow } from "@/services/activityService";
import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";

export interface DashboardProject {
	id: string;
	name: string;
	deadline: string | null;
	status: string;
	priority: string;
	color: string;
	category: string | null;
}

export interface DashboardTaskCount {
	total: number;
	completed: number;
	nextDue: { name: string; date: string } | null;
	hasOverdue: boolean;
}

interface TaskDueItem {
	id: string;
	name: string;
	due_date: string | null;
	project_id: string;
	completed: boolean;
}

interface FileSize {
	size: number | null;
}

export function useDashboardOverviewData() {
	const [projects, setProjects] = useState<DashboardProject[]>([]);
	const [activities, setActivities] = useState<ActivityLogRow[]>([]);
	const [storageUsed, setStorageUsed] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [projectTaskCounts, setProjectTaskCounts] = useState<
		Map<string, DashboardTaskCount>
	>(new Map());
	const [allProjectsMap, setAllProjectsMap] = useState<
		Map<string, DashboardProject>
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
		const [year, month, day] = iso.split("T")[0].split("-").map(Number);
		return new Date(year, month - 1, day);
	}, []);

	const loadAllProjectTaskCounts = useCallback(
		async (
			projectList: DashboardProject[],
			userId: string,
		): Promise<Map<string, DashboardTaskCount>> => {
			if (projectList.length === 0) return new Map();

			const result = await safeSupabaseQuery(async () => {
				return (await supabase
					.from("tasks")
					.select("id, project_id, completed, due_date, name")
					.eq("user_id", userId)
					.in(
						"project_id",
						projectList.map((project) => project.id),
					)) as { data: TaskDueItem[] | null; error: PostgrestError | null };
			}, "MainDashboard");

			const { data, error } = result;
			if (error) {
				logger.debug("MainDashboard", "Task counts unavailable", { error });
				return new Map();
			}
			if (!data) return new Map();

			const tasksByProject = new Map<string, TaskDueItem[]>();
			for (const task of data) {
				const existing = tasksByProject.get(task.project_id);
				if (existing) {
					existing.push(task);
				} else {
					tasksByProject.set(task.project_id, [task]);
				}
			}

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const counts = new Map<string, DashboardTaskCount>();
			for (const project of projectList) {
				const projectTasks = tasksByProject.get(project.id) ?? [];

				let completed = 0;
				let hasOverdue = false;
				let nextDue: { name: string; date: string } | null = null;
				let nextDueDate: Date | null = null;

				for (const task of projectTasks) {
					if (task.completed) {
						completed += 1;
						continue;
					}
					if (!task.due_date) continue;

					const due = toLocalDay(task.due_date);
					if (due < today) {
						hasOverdue = true;
						continue;
					}
					if (!nextDueDate || due < nextDueDate) {
						nextDueDate = due;
						nextDue = { name: task.name, date: task.due_date };
					}
				}

				counts.set(project.id, {
					total: projectTasks.length,
					completed,
					nextDue,
					hasOverdue,
				});
			}

			return counts;
		},
		[toLocalDay],
	);

	const loadDashboardData = useCallback(async () => {
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				activitiesData: [] as ActivityLogRow[],
				filesData: [] as FileSize[],
				projectsData: [] as DashboardProject[],
				userId: null as string | null,
			};
		}

		logger.info("MainDashboard", "Loading dashboard data...");

		const [projectsResult, activitiesResult, filesResult] = await Promise.all([
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
		]);

		const { data: projectsData, error: projectsError } = projectsResult;
		const { data: activitiesData, error: activitiesError } = activitiesResult;
		const { data: filesData, error: filesError } = filesResult;

		if (projectsError && projectsError.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("MainDashboard", "Failed to load projects", {
				error: projectsError,
			});
		}
		if (activitiesError && activitiesError.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("MainDashboard", "Failed to load activities", {
				error: activitiesError,
			});
		}
		if (filesError && filesError.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("MainDashboard", "Failed to load files data", {
				error: filesError,
			});
		}

		return {
			activitiesData: (activitiesData ?? []) as ActivityLogRow[],
			filesData: (Array.isArray(filesData) ? filesData : []) as FileSize[],
			projectsData: (projectsData ?? []) as DashboardProject[],
			userId,
		};
	}, [getCurrentUserId]);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			setIsLoading(true);
			try {
				const { projectsData, activitiesData, filesData, userId } =
					await loadDashboardData();
				if (cancelled) return;

				setProjects(projectsData);
				setActivities(activitiesData);
				setStorageUsed(
					filesData.reduce((sum, file) => sum + (file.size || 0), 0),
				);

				if (userId && projectsData.length > 0) {
					const counts = await loadAllProjectTaskCounts(projectsData, userId);
					if (!cancelled) setProjectTaskCounts(counts);
				} else {
					setProjectTaskCounts(new Map());
				}
			} catch (error) {
				logger.critical(
					"MainDashboard",
					"Critical error loading dashboard data",
					{
						error,
					},
				);
				if (!cancelled) {
					setProjects([]);
					setActivities([]);
					setStorageUsed(0);
					setProjectTaskCounts(new Map());
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [loadDashboardData, loadAllProjectTaskCounts]);

	useEffect(() => {
		let cancelled = false;

		const loadProjectsForActivities = async () => {
			const userId = await getCurrentUserId();
			if (!userId) {
				if (!cancelled) setAllProjectsMap(new Map());
				return;
			}

			const activityProjectIds = activities
				.filter(
					(activity) =>
						activity.project_id &&
						!projects.some((project) => project.id === activity.project_id),
				)
				.map((activity) => activity.project_id as string);

			if (activityProjectIds.length === 0) {
				if (!cancelled) {
					setAllProjectsMap(
						new Map(projects.map((project) => [project.id, project])),
					);
				}
				return;
			}

			const { data } = (await supabase
				.from("projects")
				.select("id, name, deadline, status, priority, color, category")
				.eq("user_id", userId)
				.in("id", activityProjectIds)) as { data: DashboardProject[] | null };

			const merged = new Map(projects.map((project) => [project.id, project]));
			if (data) {
				data.forEach((project) => {
					merged.set(project.id, project);
				});
			}
			if (!cancelled) setAllProjectsMap(merged);
		};

		void loadProjectsForActivities();
		return () => {
			cancelled = true;
		};
	}, [activities, projects, getCurrentUserId]);

	return {
		activities,
		allProjectsMap,
		isLoading,
		projectTaskCounts,
		projects,
		storageUsed,
	};
}
