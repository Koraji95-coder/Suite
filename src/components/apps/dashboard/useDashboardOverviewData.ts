import type { PostgrestError } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/errorLogger";
import type { ActivityLogRow } from "@/services/activityService";
import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";
import {
	type DashboardLoadProgress,
	type DashboardOverviewPayload,
	getCachedDashboardOverviewPayload,
	loadDashboardOverviewFromBackend,
} from "./dashboardOverviewService";

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

const FALLBACK_START_PROGRESS = 12;

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
	const [loadStage, setLoadStage] = useState("queued");
	const [loadMessage, setLoadMessage] = useState("Preparing dashboard...");
	const [loadProgress, setLoadProgress] = useState(0);
	const [usingBackendProgress, setUsingBackendProgress] = useState(false);

	const applyBackendPayload = useCallback(
		(backendPayload: DashboardOverviewPayload) => {
			const backendProjects = Array.isArray(backendPayload.projects)
				? backendPayload.projects
				: [];
			const backendActivities = Array.isArray(backendPayload.activities)
				? (backendPayload.activities as ActivityLogRow[])
				: [];
			const taskCountEntries = Object.entries(
				backendPayload.projectTaskCounts ?? {},
			) as Array<[string, DashboardTaskCount]>;

			const mergedProjects =
				Array.isArray(backendPayload.allProjects) &&
				backendPayload.allProjects.length > 0
					? backendPayload.allProjects
					: backendProjects;

			setProjects(backendProjects);
			setActivities(backendActivities);
			setStorageUsed(
				Number.isFinite(backendPayload.storageUsed)
					? Number(backendPayload.storageUsed)
					: 0,
			);
			setProjectTaskCounts(new Map(taskCountEntries));
			setAllProjectsMap(
				new Map(mergedProjects.map((project) => [project.id, project])),
			);
		},
		[],
	);

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

	const loadProjectMapForActivities = useCallback(
		async (
			projectList: DashboardProject[],
			activityList: ActivityLogRow[],
			userId: string | null,
		): Promise<Map<string, DashboardProject>> => {
			const merged = new Map(
				projectList.map((project) => [project.id, project]),
			);
			if (!userId) return merged;

			const activityProjectIds = activityList
				.filter(
					(activity) => activity.project_id && !merged.has(activity.project_id),
				)
				.map((activity) => activity.project_id as string);

			if (activityProjectIds.length === 0) return merged;

			const result = await safeSupabaseQuery(
				async () =>
					(await supabase
						.from("projects")
						.select("id, name, deadline, status, priority, color, category")
						.eq("user_id", userId)
						.in("id", activityProjectIds)) as {
						data: DashboardProject[] | null;
						error: PostgrestError | null;
					},
				"MainDashboard",
			);

			if (result.data) {
				result.data.forEach((project) => {
					merged.set(project.id, project);
				});
			}

			return merged;
		},
		[],
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

		const updateProgress = (progress: DashboardLoadProgress) => {
			if (cancelled) return;
			setUsingBackendProgress(true);
			setLoadProgress(Math.max(0, Math.min(100, progress.progress)));
			setLoadStage(progress.stage || "loading");
			setLoadMessage(progress.message || "Loading dashboard...");
		};

		const run = async () => {
			setIsLoading(true);
			setLoadProgress(0);
			setLoadStage("queued");
			setLoadMessage("Preparing dashboard...");
			setUsingBackendProgress(false);

			const cachedPayload = getCachedDashboardOverviewPayload();
			if (cachedPayload) {
				applyBackendPayload(cachedPayload);
				setLoadStage("complete");
				setLoadMessage("Dashboard ready.");
				setLoadProgress(100);
				setIsLoading(false);
				return;
			}

			try {
				const backendPayload =
					await loadDashboardOverviewFromBackend(updateProgress);
				if (cancelled) return;
				applyBackendPayload(backendPayload);
				setLoadStage("complete");
				setLoadMessage("Dashboard ready.");
				setLoadProgress(100);
				return;
			} catch (backendError) {
				logger.warn(
					"MainDashboard",
					"Backend dashboard progress unavailable. Falling back to direct Supabase queries.",
					{
						error: backendError,
					},
				);
				if (cancelled) return;
				setUsingBackendProgress(false);
			}

			try {
				setLoadStage("fallback");
				setLoadMessage("Loading dashboard data...");
				setLoadProgress(FALLBACK_START_PROGRESS);

				const { projectsData, activitiesData, filesData, userId } =
					await loadDashboardData();
				if (cancelled) return;

				setProjects(projectsData);
				setActivities(activitiesData);
				setStorageUsed(
					filesData.reduce((sum, file) => sum + (file.size || 0), 0),
				);

				setLoadStage("tasks");
				setLoadMessage("Loading project task progress...");
				setLoadProgress(58);

				const counts =
					userId && projectsData.length > 0
						? await loadAllProjectTaskCounts(projectsData, userId)
						: new Map();
				if (!cancelled) setProjectTaskCounts(counts);

				setLoadStage("activity-projects");
				setLoadMessage("Resolving activity references...");
				setLoadProgress(84);
				const projectMap = await loadProjectMapForActivities(
					projectsData,
					activitiesData,
					userId,
				);
				if (!cancelled) setAllProjectsMap(projectMap);

				if (!cancelled) {
					setLoadStage("complete");
					setLoadMessage("Dashboard ready.");
					setLoadProgress(100);
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
					setAllProjectsMap(new Map());
					setLoadStage("error");
					setLoadMessage("Failed to load dashboard.");
					setLoadProgress(100);
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [
		applyBackendPayload,
		loadDashboardData,
		loadAllProjectTaskCounts,
		loadProjectMapForActivities,
	]);

	return {
		activities,
		allProjectsMap,
		isLoading,
		loadMessage,
		loadProgress,
		loadStage,
		projectTaskCounts,
		projects,
		storageUsed,
		usingBackendProgress,
	};
}
