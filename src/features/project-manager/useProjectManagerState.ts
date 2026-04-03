import {
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import {
	buildProjectInsertPayload,
	buildProjectUpdatePayload,
	getMissingProjectSetupColumns,
	normalizeProjectRootPath,
	stripProjectSetupColumns,
	withDerivedAcadeProjectFilePath,
} from "./projectPersistence";
import {
	createProjectSetupInAcade,
	ensureProjectSetupArtifacts,
	openProjectSetupInAcade,
	persistProjectSetupProfile,
} from "@/features/project-setup";
import { buildTitleBlockSyncFailureMessage } from "@/features/project-setup/workflowMessages";
import { logger } from "@/lib/logger";
import { logActivity } from "@/services/activityService";
import { syncSharedProjectWatchdogRulesToLocalRuntime } from "@/services/projectWatchdogService";
import {
	getWatchdogFolderPickerAvailability,
	isWatchdogFolderPickerUnavailableError,
	type WatchdogFolderPickerAvailability,
	watchdogService,
} from "@/services/watchdogService";
import {
	loadSetting,
	migrateFromLocalStorage,
	saveSetting,
} from "@/settings/userSettings";
import { triggerAutoBackup } from "@/supabase/backupManager";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { deriveProjectManagerSummary } from "@/features/project-core";
import {
	type CalendarEvent,
	type Project,
	type ProjectFile,
	type ProjectStatus,
	type Task,
	type TaskCount,
	type ViewMode,
} from "@/features/project-core";
import { toDateOnly } from "@/features/project-core";
import { useProjectManagerUiState } from "./useProjectManagerUiState";

interface TaskSummary {
	id: string;
	project_id: string | null;
	completed: boolean;
	due_date: string | null;
	name: string;
}

interface UseProjectManagerStateArgs {
	initialProjectId?: string;
	initialIssueSetId?: string;
	initialViewMode?: ViewMode;
	externalSelectedDate?: string | null;
	onCalendarDateChange?: (date: string | null) => void;
	externalMonth?: Date;
	onCalendarMonthChange?: (month: Date) => void;
}

export function useProjectManagerState({
	initialProjectId,
	initialIssueSetId,
	initialViewMode,
	externalSelectedDate,
	onCalendarDateChange,
	externalMonth,
	onCalendarMonthChange,
}: UseProjectManagerStateArgs) {
	const { showToast } = useToast();
	// State
	const [projects, setProjects] = useState<Project[]>([]);
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
	const {
		showProjectModal,
		setShowProjectModal,
		showTaskModal,
		setShowTaskModal,
		editingProject,
		setEditingProject,
		editingTask,
		setEditingTask,
		parentTaskForSubtask,
		setParentTaskForSubtask,
		expandedTasks,
		setExpandedTasks,
		viewMode,
		setViewMode,
		activeIssueSetId,
		setActiveIssueSetId,
		fileFilter,
		setFileFilter,
		projectSearch,
		setProjectSearch,
		statusFilter,
		setStatusFilter,
		taskFilter,
		setTaskFilter,
		projectIdPendingDelete,
		setProjectIdPendingDelete,
		taskIdPendingDelete,
		setTaskIdPendingDelete,
		projectForm,
		setProjectForm,
		taskForm,
		setTaskForm,
		resetProjectForm,
		resetTaskForm,
		openEditProject,
		openEditTask,
		openAddSubtask,
		requestDeleteProject,
		requestDeleteTask,
	} = useProjectManagerUiState(initialViewMode, initialIssueSetId ?? null);
	const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
	const [internalSelectedDate, setInternalSelectedDate] = useState<
		string | null
	>(null);
	const [projectTaskCounts, setProjectTaskCounts] = useState<
		Map<string, TaskCount>
	>(new Map());
	const [isPickingProjectRoot, setIsPickingProjectRoot] = useState(false);
	const [isPickingPdfPackageRoot, setIsPickingPdfPackageRoot] = useState(false);
	const [folderPickerAvailability, setFolderPickerAvailability] =
		useState<WatchdogFolderPickerAvailability>(
			getWatchdogFolderPickerAvailability(),
		);
	const currentUserIdRef = useRef<string | null | undefined>(undefined);

	const syncWatchdogRulesAfterProjectMutation = useCallback(async () => {
		try {
			await syncSharedProjectWatchdogRulesToLocalRuntime();
		} catch (error) {
			logger.warn(
				"Failed to sync shared watchdog project rules to the local runtime.",
				"ProjectManager",
				error,
			);
		}
	}, []);

	const ensureProjectAcadeSupportArtifacts = useCallback(
		async (args: {
			projectId: string;
			projectRootPath: string | null;
			form: typeof projectForm;
		}) => {
			const result = await ensureProjectSetupArtifacts({
				projectId: args.projectId,
				projectRootPath: args.projectRootPath,
				form: args.form,
			});
			if (!result) {
				return;
			}
			if (!result.success) {
				const message = buildTitleBlockSyncFailureMessage(
					result,
					"Project saved, but Suite could not prepare ACADE support files.",
				);
				showToast("warning", message);
			}
		},
		[showToast],
	);

	const openProjectInAcade = useCallback(
		async (args: {
			projectId: string;
			projectRootPath: string | null;
			form: typeof projectForm;
		}) => {
			const result = await openProjectSetupInAcade({
				projectId: args.projectId,
				projectRootPath: args.projectRootPath,
				form: args.form,
			});
			if (!result) {
				showToast(
					"warning",
					"Project saved, but no project root is set for opening the ACADE project.",
				);
				return false;
			}
			if (!result.success) {
				const message = buildTitleBlockSyncFailureMessage(
					result,
					"Support files are ready, but ACADE did not register/open the project.",
				);
				showToast("warning", message);
				return false;
			}
			showToast(
				"success",
				result.message || "ACADE opened and project activated.",
			);
			return true;
		},
		[showToast],
	);

	const createProjectInAcade = useCallback(
		async (args: {
			projectId: string;
			projectRootPath: string | null;
			form: typeof projectForm;
		}) => {
			const result = await createProjectSetupInAcade({
				projectId: args.projectId,
				projectRootPath: args.projectRootPath,
				form: args.form,
			});
			if (!result.success) {
				const message = buildTitleBlockSyncFailureMessage(
					result,
					"Support files are ready, but ACADE did not create/register the project.",
				);
				showToast("warning", message);
				return result;
			}
			showToast(
				"success",
				result.message || "ACADE created and activated the project.",
			);
			return result;
		},
		[showToast],
	);

	const getCurrentUserId = useCallback(async (): Promise<string | null> => {
		if (currentUserIdRef.current !== undefined) {
			if (!currentUserIdRef.current) {
				showToast("error", "Please sign in to access project data.");
			}
			return currentUserIdRef.current;
		}

		const {
			data: { session },
			error: sessionError,
		} = await supabase.auth.getSession();
		if (sessionError) {
			logger.debug(
				"Session lookup was unavailable while resolving project user scope.",
				"ProjectManager",
				sessionError,
			);
		}
		const sessionUserId = session?.user?.id ?? null;
		if (sessionUserId) {
			currentUserIdRef.current = sessionUserId;
			return sessionUserId;
		}

		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();

		if (error || !user) {
			currentUserIdRef.current = null;
			showToast("error", "Please sign in to access project data.");
			return null;
		}

		currentUserIdRef.current = user.id;
		return user.id;
	}, [showToast]);

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			currentUserIdRef.current = session?.user?.id ?? null;
		});
		return () => {
			subscription.unsubscribe();
		};
	}, []);

	const writeProjectRecord = useCallback(
		async <
			T extends Database["public"]["Tables"]["projects"]["Insert"] | Database["public"]["Tables"]["projects"]["Update"],
			R,
		>(
			payload: T,
			run: (nextPayload: T) => Promise<{ data?: R; error: unknown }>,
		) => {
			let nextPayload = payload;
			let result = await run(nextPayload);

			if (result.error) {
				const missingColumns = getMissingProjectSetupColumns(result.error);
				if (missingColumns.length > 0) {
					logger.warn(
						"Projects",
						"Projects table is missing newer setup columns; retrying with the legacy payload.",
						{
							missingColumns,
							error:
								result.error instanceof Error
									? result.error.message
									: String(result.error),
						},
					);
					nextPayload = stripProjectSetupColumns(nextPayload, missingColumns);
					result = await run(nextPayload);
				}
			}

			return {
				payload: nextPayload,
				data: result.data,
				error: result.error,
			};
		},
		[],
	);

	// Calendar sync
	const currentMonth = externalMonth ?? internalCurrentMonth;
	const setCurrentMonth = (month: Date) => {
		if (onCalendarMonthChange) onCalendarMonthChange(month);
		else setInternalCurrentMonth(month);
	};

	const selectedCalendarDate =
		externalSelectedDate !== undefined
			? externalSelectedDate
			: internalSelectedDate;
	const setSelectedCalendarDate = (date: string | null) => {
		if (onCalendarDateChange) onCalendarDateChange(date);
		else setInternalSelectedDate(date);
	};

	// Sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const loadProjects = useCallback(async () => {
		try {
			const userId = await getCurrentUserId();
			if (!userId) {
				setProjects([]);
				setSelectedProject(null);
				return;
			}

			const { data, error } = await supabase
				.from("projects")
				.select("*")
				.eq("user_id", userId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			if (data) {
				setProjects(data);
				setSelectedProject((current) => {
					if (!data.length) {
						return null;
					}
					if (current) {
						const matchedProject =
							data.find((project) => project.id === current.id) ?? null;
						if (matchedProject) {
							return matchedProject;
						}
					}
					return data[0];
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to load projects: ${message}`);
		}
	}, [showToast, getCurrentUserId]);

	// Load initial data
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	useEffect(() => {
		if (!initialProjectId || projects.length === 0) return;

		const matched = projects.find((project) => project.id === initialProjectId);
		if (matched) {
			if (matched.id !== selectedProject?.id) {
				setSelectedProject(matched);
			}
			if (initialViewMode && viewMode !== initialViewMode) {
				setViewMode(initialViewMode);
			}
			if ((initialIssueSetId ?? null) !== activeIssueSetId) {
				setActiveIssueSetId(initialIssueSetId ?? null);
			}
		}
	}, [
		activeIssueSetId,
		initialProjectId,
		initialIssueSetId,
		initialViewMode,
		projects,
		selectedProject?.id,
		setActiveIssueSetId,
		setViewMode,
		viewMode,
	]);

	const loadTasks = useCallback(
		async (projectId: string) => {
			try {
				const userId = await getCurrentUserId();
				if (!userId) {
					setTasks([]);
					return;
				}

				const { data, error } = await supabase
					.from("tasks")
					.select("*")
					.eq("project_id", projectId)
					.eq("user_id", userId)
					.order("order", { ascending: true });

				if (error) throw error;
				if (data) setTasks(data);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An error occurred";
				showToast("error", `Failed to load tasks: ${message}`);
			}
		},
		[showToast, getCurrentUserId],
	);

	const loadFiles = useCallback(
		async (projectId: string) => {
			try {
				const userId = await getCurrentUserId();
				if (!userId) {
					setFiles([]);
					return;
				}

				const { data, error } = await supabase
					.from("files")
					.select("*")
					.eq("project_id", projectId)
					.eq("user_id", userId)
					.order("uploaded_at", { ascending: false });

				if (error) throw error;
				if (data) setFiles(data);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An error occurred";
				showToast("error", `Failed to load files: ${message}`);
			}
		},
		[showToast, getCurrentUserId],
	);

	const loadCalendarEvents = useCallback(
		async (projectId: string) => {
			try {
				const userId = await getCurrentUserId();
				if (!userId) {
					setCalendarEvents([]);
					return;
				}

				const { data, error } = await supabase
					.from("calendar_events")
					.select("*")
					.eq("project_id", projectId)
					.eq("user_id", userId)
					.order("due_date", { ascending: true });

				if (error) throw error;
				if (data) setCalendarEvents(data);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An error occurred";
				showToast("error", `Failed to load calendar events: ${message}`);
			}
		},
		[showToast, getCurrentUserId],
	);

	const loadExpandedTasks = useCallback(
		async (projectId: string) => {
			try {
				await migrateFromLocalStorage(
					`expanded-tasks-${projectId}`,
					"expanded_tasks",
					projectId,
				);
				const stored = await loadSetting<string[]>(
					"expanded_tasks",
					projectId,
					[],
				);
				setExpandedTasks(new Set(stored || []));
			} catch (error) {
				logger.error("Failed to load expanded tasks", "ProjectManager", error);
				setExpandedTasks(new Set());
			}
		},
		[setExpandedTasks],
	);

	useEffect(() => {
		const projectId = selectedProject?.id ?? null;
		if (!projectId) {
			setTasks([]);
			setFiles([]);
			setCalendarEvents([]);
			setExpandedTasks(new Set());
			return;
		}

		setTasks([]);
		setFiles([]);
		setCalendarEvents([]);
		setExpandedTasks(new Set());
		setTaskFilter("all");
		void loadTasks(projectId);
	}, [selectedProject?.id, loadTasks, setExpandedTasks, setTaskFilter]);

	useEffect(() => {
		const projectId = selectedProject?.id ?? null;
		if (!projectId) {
			setFiles([]);
			return;
		}
		if (viewMode !== "files" && viewMode !== "revisions") {
			return;
		}
		setFiles([]);
		void loadFiles(projectId);
	}, [selectedProject?.id, viewMode, loadFiles]);

	useEffect(() => {
		const projectId = selectedProject?.id ?? null;
		if (!projectId) {
			setCalendarEvents([]);
			return;
		}
		if (viewMode !== "calendar") {
			return;
		}
		setCalendarEvents([]);
		void loadCalendarEvents(projectId);
	}, [selectedProject?.id, viewMode, loadCalendarEvents]);

	useEffect(() => {
		const projectId = selectedProject?.id ?? null;
		if (!projectId) {
			setExpandedTasks(new Set());
			return;
		}
		if (viewMode !== "tasks") {
			return;
		}
		void loadExpandedTasks(projectId);
	}, [selectedProject?.id, viewMode, loadExpandedTasks, setExpandedTasks]);

	// Load task counts for all projects
	const loadAllProjectTaskCounts = useCallback(
		async (projectList: Project[]) => {
			if (projectList.length === 0) return;
			try {
				const userId = await getCurrentUserId();
				if (!userId) return;

				const { data, error } = await supabase
					.from("tasks")
					.select("id, project_id, completed, due_date, name")
					.eq("user_id", userId)
					.in(
						"project_id",
						projectList.map((p) => p.id),
					);
				if (error) throw error;
				if (data) {
					const taskData = data as TaskSummary[];
					const counts = new Map<string, TaskCount>();
					const now = new Date();
					now.setHours(0, 0, 0, 0);
					for (const p of projectList) {
						const projectTasks = taskData.filter(
							(t: TaskSummary) => t.project_id === p.id,
						);
						const total = projectTasks.length;
						const completed = projectTasks.filter(
							(t: TaskSummary) => t.completed,
						).length;
						let nextDue: { name: string; date: string } | null = null;
						const upcoming = projectTasks
							.filter(
								(t): t is TaskSummary & { due_date: string } =>
									!t.completed && Boolean(t.due_date),
							)
							.map((t) => ({ name: t.name, date: t.due_date }))
							.sort((a, b) => a.date.localeCompare(b.date))
							.find((t) => {
								const [y, m, d] = t.date.split("T")[0].split("-").map(Number);
								return new Date(y, m - 1, d) >= now;
							});
						if (upcoming) nextDue = upcoming;
						const hasOverdue = projectTasks.some((t: TaskSummary) => {
							if (!t.completed && t.due_date) {
								const [oy, om, od] = t.due_date
									.split("T")[0]
									.split("-")
									.map(Number);
								return new Date(oy, om - 1, od) < now;
							}
							return false;
						});
						counts.set(p.id, { total, completed, nextDue, hasOverdue });
					}
					setProjectTaskCounts(counts);
				}
			} catch (error) {
				logger.debug(
					"Project task count refresh skipped because task data could not be loaded.",
					"ProjectManager",
					error,
				);
			}
		},
		[getCurrentUserId],
	);

	useEffect(() => {
		if (projects.length > 0) loadAllProjectTaskCounts(projects);
	}, [projects, loadAllProjectTaskCounts]);

	// CRUD operations for projects
	const createProject = async (options?: { openAcadeAfter?: boolean }) => {
		if (!projectForm.name) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const rawFormSnapshot = { ...projectForm };
			const watchdogRootPath = normalizeProjectRootPath(
				rawFormSnapshot.watchdogRootPath,
			);
			const formSnapshot = withDerivedAcadeProjectFilePath(
				rawFormSnapshot,
				watchdogRootPath,
			);
			const payload = buildProjectInsertPayload({
				form: formSnapshot,
				watchdogRootPath,
				userId,
			});

			const { data, error, payload: persistedPayload } =
				await writeProjectRecord(payload, async (nextPayload) => {
					const { data, error } = await supabase
						.from("projects")
						.insert([nextPayload])
						.select();
					return { data, error };
				});

			if (error) throw error;

			if (data) {
				let resolvedProjectRootPath = watchdogRootPath;
				let resolvedAcadeProjectFilePath =
					formSnapshot.titleBlockAcadeProjectFilePath.trim() || null;

				await persistProjectSetupProfile({
					projectId: data[0].id,
					projectRootPath: watchdogRootPath,
					form: formSnapshot,
				});

				if (options?.openAcadeAfter) {
					const createResult = await createProjectInAcade({
						projectId: data[0].id,
						projectRootPath: watchdogRootPath,
						form: formSnapshot,
					});

					if (createResult.success) {
						const nativeProjectRootPath =
							createResult.data?.projectRootPath?.trim() || null;
						const nativeWdpPath =
							createResult.data?.createProject?.wdpPath?.trim() ||
							createResult.data?.artifacts?.wdpPath?.trim() ||
							null;

						if (nativeProjectRootPath) {
							resolvedProjectRootPath = nativeProjectRootPath;
						}
						if (nativeWdpPath) {
							resolvedAcadeProjectFilePath = nativeWdpPath;
						}

						if (
							resolvedProjectRootPath &&
							resolvedProjectRootPath !== watchdogRootPath
						) {
							const { error: projectRootUpdateError } = await supabase
								.from("projects")
								.update({ watchdog_root_path: resolvedProjectRootPath })
								.eq("id", data[0].id)
								.eq("user_id", userId);

							if (projectRootUpdateError) {
								showToast(
									"warning",
									`ACADE created the project, but Suite could not persist the resolved local project root: ${projectRootUpdateError.message}`,
								);
							}
						}

						await persistProjectSetupProfile({
							projectId: data[0].id,
							projectRootPath: resolvedProjectRootPath,
							form: {
								...formSnapshot,
								titleBlockAcadeProjectFilePath:
									resolvedAcadeProjectFilePath ||
									formSnapshot.titleBlockAcadeProjectFilePath,
							},
						});
					}
				} else {
					await ensureProjectAcadeSupportArtifacts({
						projectId: data[0].id,
						projectRootPath: watchdogRootPath,
						form: formSnapshot,
					});
				}

				await logActivity({
					action: "create",
					description: `Created project: ${formSnapshot.name}`,
					projectId: data[0].id,
				});
				const createdProject = {
					...data[0],
					...persistedPayload,
					watchdog_root_path: resolvedProjectRootPath,
				} as Project;
				setProjects([createdProject, ...projects]);
				setSelectedProject(createdProject);
				setActiveIssueSetId(null);
				setViewMode("setup");
				setShowProjectModal(false);
				resetProjectForm();
				await syncWatchdogRulesAfterProjectMutation();
				showToast("success", `Project "${formSnapshot.name}" created`);
				triggerAutoBackup();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to create project: ${message}`);
		}
	};

	const updateProject = async (options?: { openAcadeAfter?: boolean }) => {
		if (!editingProject) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const rawFormSnapshot = { ...projectForm };
			const watchdogRootPath = normalizeProjectRootPath(
				rawFormSnapshot.watchdogRootPath,
			);
			const formSnapshot = withDerivedAcadeProjectFilePath(
				rawFormSnapshot,
				watchdogRootPath,
			);
			const payload = buildProjectUpdatePayload({
				form: formSnapshot,
				watchdogRootPath,
			});

			const { error, payload: persistedPayload } = await writeProjectRecord(
				payload,
				async (nextPayload) => {
					const { error } = await supabase
						.from("projects")
						.update(nextPayload)
						.eq("id", editingProject.id)
						.eq("user_id", userId);
					return { error };
				},
			);

			if (error) throw error;

			await persistProjectSetupProfile({
				projectId: editingProject.id,
				projectRootPath: watchdogRootPath,
				form: formSnapshot,
			});
			await ensureProjectAcadeSupportArtifacts({
				projectId: editingProject.id,
				projectRootPath: watchdogRootPath,
				form: formSnapshot,
			});

			await logActivity({
				action: "update",
				description: `Updated project: ${formSnapshot.name}`,
				projectId: editingProject.id,
			});
			const updatedProjects = projects.map((p) =>
				p.id === editingProject.id ? { ...p, ...persistedPayload } : p,
			);
			setProjects(updatedProjects);
			setSelectedProject((prev) =>
				prev?.id === editingProject.id
					? ({ ...prev, ...persistedPayload } as Project)
					: prev,
			);
			setActiveIssueSetId(null);
			setViewMode("setup");
			setShowProjectModal(false);
			setEditingProject(null);
			resetProjectForm();
			await syncWatchdogRulesAfterProjectMutation();
			showToast("success", `Project updated`);
			if (options?.openAcadeAfter) {
				await openProjectInAcade({
					projectId: editingProject.id,
					projectRootPath: watchdogRootPath,
					form: formSnapshot,
				});
			}
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to update project: ${message}`);
		}
	};

	const createProjectAndOpenAcade = async () => {
		await createProject({ openAcadeAfter: true });
	};

	const updateProjectAndOpenAcade = async () => {
		await updateProject({ openAcadeAfter: true });
	};

	const confirmDeleteProject = async () => {
		if (!projectIdPendingDelete) return;
		const projectId = projectIdPendingDelete;
		setProjectIdPendingDelete(null);
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const { error } = await supabase
				.from("projects")
				.delete()
				.eq("id", projectId)
				.eq("user_id", userId);
			if (error) throw error;

			await logActivity({
				action: "delete",
				description: "Deleted a project",
				projectId,
			});
			const remaining = projects.filter((p) => p.id !== projectId);
			setProjects(remaining);

			if (selectedProject?.id === projectId) {
				setSelectedProject(remaining.length > 0 ? remaining[0] : null);
				setActiveIssueSetId(null);
				if (remaining.length > 0) {
					setViewMode("setup");
				}
			}
			await syncWatchdogRulesAfterProjectMutation();
			showToast("success", "Project deleted");
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to delete project: ${message}`);
		}
	};

	const toggleArchiveProject = async (project: Project) => {
		const isArchived = project.status === "completed";
		const newStatus: ProjectStatus = isArchived ? "active" : "completed";
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const { error } = await supabase
				.from("projects")
				.update({ status: newStatus })
				.eq("id", project.id)
				.eq("user_id", userId);

			if (error) throw error;

			await logActivity({
				action: "update",
				description: `${isArchived ? "Unarchived" : "Archived"} project: ${project.name}`,
				projectId: project.id,
			});
			const updatedProjects = projects.map((p) =>
				p.id === project.id ? { ...p, status: newStatus } : p,
			);
			setProjects(updatedProjects);
			setSelectedProject((prev) =>
				prev?.id === project.id
					? ({ ...prev, status: newStatus } as Project)
					: prev,
			);
			showToast("success", `Project ${isArchived ? "unarchived" : "archived"}`);
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to update project: ${message}`);
		}
	};

	const exportProjectMarkdown = () => {
		if (!selectedProject) return;
		const lines: string[] = [];
		lines.push(`# ${selectedProject.name}`);
		lines.push("");
		if (selectedProject.description) lines.push(selectedProject.description);
		lines.push("");
		if (selectedProject.deadline) {
			lines.push(`**Deadline:** ${selectedProject.deadline}`);
		}
		lines.push(`**Priority:** ${selectedProject.priority}`);
		lines.push(
			`**Status:** ${selectedProject.status === "completed" ? "Archived" : selectedProject.status}`,
		);
		lines.push("");

		if (tasks.length > 0) {
			lines.push("## Tasks");
			lines.push("");
			lines.push("| Status | Task | Priority | Due Date |");
			lines.push("|--------|------|----------|----------|");
			tasks.forEach((t) => {
				const status = t.completed ? "✅" : "⬜";
				const indent = t.parent_task_id ? "↳ " : "";
				const due = t.due_date ? t.due_date : "-";
				lines.push(
					`| ${status} | ${indent}${t.name} | ${t.priority} | ${due} |`,
				);
			});
		}

		const md = lines.join("\n");
		navigator.clipboard
			.writeText(md)
			.then(() => {
				showToast("success", "Project exported to clipboard as Markdown");
			})
			.catch(() => {
				showToast("error", "Failed to copy to clipboard");
			});
	};

	// CRUD for tasks
	const createTask = async () => {
		if (!taskForm.name || !selectedProject) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const parentId = parentTaskForSubtask;
			let maxOrder = -1;
			if (parentId) {
				const siblings = tasks.filter((t) => t.parent_task_id === parentId);
				maxOrder =
					siblings.length > 0 ? Math.max(...siblings.map((t) => t.order)) : -1;
			} else {
				const roots = tasks.filter((t) => !t.parent_task_id);
				maxOrder =
					roots.length > 0 ? Math.max(...roots.map((t) => t.order)) : -1;
			}

			const { data, error } = await supabase
				.from("tasks")
				.insert([
					{
						project_id: selectedProject.id,
						name: taskForm.name,
						description: taskForm.description,
						due_date: toDateOnly(taskForm.due_date) || null,
						priority: taskForm.priority,
						parent_task_id: parentTaskForSubtask,
						order: maxOrder + 1,
						user_id: userId,
					},
				])
				.select();

			if (error) throw error;

			if (data) {
				await logActivity({
					action: "create",
					description: `Added task: ${taskForm.name}`,
					projectId: selectedProject.id,
					taskId: data[0].id,
				});

				if (taskForm.due_date) {
					await supabase.from("calendar_events").insert([
						{
							project_id: selectedProject.id,
							task_id: data[0].id,
							due_date: toDateOnly(taskForm.due_date),
							title: taskForm.name,
							type: "deadline",
							user_id: userId,
						},
					]);
				}

				setTasks([...tasks, data[0]]);
				setShowTaskModal(false);
				setParentTaskForSubtask(null);
				resetTaskForm();
				loadCalendarEvents(selectedProject.id);
				showToast("success", `Task "${taskForm.name}" created`);
				triggerAutoBackup();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to create task: ${message}`);
		}
	};

	const updateTask = async () => {
		if (!editingTask || !selectedProject) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const { error } = await supabase
				.from("tasks")
				.update({
					name: taskForm.name,
					description: taskForm.description,
					due_date: toDateOnly(taskForm.due_date) || null,
					priority: taskForm.priority,
				})
				.eq("id", editingTask.id)
				.eq("user_id", userId);

			if (error) throw error;

			await logActivity({
				action: "update",
				description: `Updated task: ${taskForm.name}`,
				projectId: selectedProject.id,
				taskId: editingTask.id,
			});

			if (taskForm.due_date) {
				const existingEvent = calendarEvents.find(
					(e) => e.task_id === editingTask.id,
				);
				if (existingEvent) {
					await supabase
						.from("calendar_events")
						.update({
							due_date: toDateOnly(taskForm.due_date),
							title: taskForm.name,
						})
						.eq("id", existingEvent.id)
						.eq("user_id", userId);
				} else {
					await supabase.from("calendar_events").insert([
						{
							project_id: selectedProject.id,
							task_id: editingTask.id,
							due_date: toDateOnly(taskForm.due_date),
							title: taskForm.name,
							type: "deadline",
							user_id: userId,
						},
					]);
				}
			} else {
				await supabase
					.from("calendar_events")
					.delete()
					.eq("task_id", editingTask.id)
					.eq("user_id", userId);
			}

			if (editingTask.project_id) {
				loadTasks(editingTask.project_id);
			}
			loadCalendarEvents(selectedProject.id);
			setShowTaskModal(false);
			setEditingTask(null);
			resetTaskForm();
			showToast("success", "Task updated");
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to update task: ${message}`);
		}
	};

	const toggleTaskComplete = async (task: Task) => {
		const previousTasks = [...tasks];
		const newCompleted = !task.completed;

		setTasks(
			tasks.map((t) =>
				t.id === task.id ? { ...t, completed: newCompleted } : t,
			),
		);

		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const { error } = await supabase
				.from("tasks")
				.update({ completed: newCompleted })
				.eq("id", task.id)
				.eq("user_id", userId);

			if (error) throw error;

			await logActivity({
				action: "update",
				description: `${newCompleted ? "Completed" : "Uncompleted"} task: ${task.name}`,
				projectId: selectedProject?.id || null,
				taskId: task.id,
			});
			triggerAutoBackup();
		} catch (err) {
			setTasks(previousTasks);
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to update task: ${message}`);
		}
	};

	const collectTaskIds = (rootId: string): string[] => {
		const ids = new Set<string>();
		const walk = (id: string) => {
			ids.add(id);
			tasks.filter((t) => t.parent_task_id === id).forEach((st) => walk(st.id));
		};
		walk(rootId);
		return Array.from(ids);
	};

	const confirmDeleteTask = async () => {
		if (!taskIdPendingDelete) return;
		const taskId = taskIdPendingDelete;
		setTaskIdPendingDelete(null);
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const idsToDelete = collectTaskIds(taskId);
			const { error } = await supabase
				.from("tasks")
				.delete()
				.eq("user_id", userId)
				.in("id", idsToDelete);
			if (error) throw error;

			await supabase
				.from("calendar_events")
				.delete()
				.eq("user_id", userId)
				.in("task_id", idsToDelete);

			if (selectedProject) {
				await logActivity({
					action: "delete",
					description: `Deleted task and ${idsToDelete.length - 1} subtasks`,
					projectId: selectedProject.id,
					taskId,
				});
				loadTasks(selectedProject.id);
				loadCalendarEvents(selectedProject.id);
			}
			showToast("success", "Task deleted");
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to delete task: ${message}`);
		}
	};

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;
			if (
				!over ||
				active.id === over.id ||
				!selectedProject ||
				selectedProject.status === "completed"
			)
				return;

			const activeId = String(active.id);
			const overId = String(over.id);

			const activeTask = tasks.find((t) => t.id === activeId);
			const overTask = tasks.find((t) => t.id === overId);
			if (!activeTask || !overTask) return;

			if (activeTask.parent_task_id !== overTask.parent_task_id) return;

			const parentId = activeTask.parent_task_id ?? null;
			const siblings = tasks
				.filter((t) => t.parent_task_id === parentId)
				.sort((a, b) => a.order - b.order);
			const oldIndex = siblings.findIndex((t) => t.id === activeId);
			const newIndex = siblings.findIndex((t) => t.id === overId);

			if (oldIndex === -1 || newIndex === -1) return;

			const reordered = arrayMove(siblings, oldIndex, newIndex);

			// Use functional setState to avoid closure issues
			const updatedTasks = tasks.map((t) => {
				const idx = reordered.findIndex((r) => r.id === t.id);
				if (idx !== -1) return { ...t, order: idx };
				return t;
			});
			setTasks(updatedTasks);

			try {
				const updates = reordered.map((t, idx) => ({ id: t.id, order: idx }));
				for (const u of updates) {
					await supabase
						.from("tasks")
						.update({ order: u.order })
						.eq("id", u.id);
				}
				triggerAutoBackup();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An error occurred";
				showToast("error", `Failed to reorder tasks: ${message}`);
				if (selectedProject) loadTasks(selectedProject.id);
			}
		},
		[tasks, selectedProject, showToast, loadTasks],
	);

	const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
		if (!selectedProject || !event.target.files?.length) return;
		const selectedFiles = Array.from(event.target.files);

		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			for (const file of selectedFiles) {
				const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
				const fileName = `${userId}/${selectedProject.id}/${Date.now()}_${safeFileName}`;

				const { data: uploadData, error: uploadError } = await supabase.storage
					.from("project-files")
					.upload(fileName, file);

				if (uploadError) throw uploadError;

				if (uploadData) {
					const payload: Database["public"]["Tables"]["files"]["Insert"] = {
						project_id: selectedProject.id,
						name: file.name,
						file_path: uploadData.path,
						size: file.size,
						mime_type: file.type,
						user_id: userId,
					};

					const { error: dbError } = await supabase.from("files").insert(payload);

					if (dbError) throw dbError;

					await logActivity({
						action: "upload",
						description: `Uploaded file: ${file.name}`,
						projectId: selectedProject.id,
					});
				}
			}
			loadFiles(selectedProject.id);
			showToast(
				"success",
				selectedFiles.length === 1
					? `File "${selectedFiles[0]?.name}" uploaded`
					: `${selectedFiles.length} files uploaded`,
			);
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to upload file: ${message}`);
		} finally {
			event.target.value = "";
		}
	};

	const downloadFile = async (file: ProjectFile) => {
		try {
			const { data, error } = await supabase.storage
				.from("project-files")
				.createSignedUrl(file.file_path, 60);
			if (error) throw error;
			if (data?.signedUrl) window.open(data.signedUrl, "_blank");
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to download: ${message}`);
		}
	};

	const pickProjectRootPath = useCallback(async () => {
		if (isPickingProjectRoot) return;
		setIsPickingProjectRoot(true);
		try {
			const result = await watchdogService.pickRoot(
				projectForm.watchdogRootPath || null,
			);
			setFolderPickerAvailability(getWatchdogFolderPickerAvailability());
			if (result.cancelled || !result.path) {
				return;
			}
			setProjectForm((current) => ({
				...current,
				watchdogRootPath: result.path || "",
			}));
		} catch (error) {
			if (isWatchdogFolderPickerUnavailableError(error)) {
				setFolderPickerAvailability("unavailable");
			}
			const message =
				error instanceof Error
					? error.message
					: "Unable to browse for a project root folder.";
			showToast("error", message);
		} finally {
			setIsPickingProjectRoot(false);
		}
	}, [
		isPickingProjectRoot,
		projectForm.watchdogRootPath,
		setProjectForm,
		showToast,
	]);

	const pickProjectPdfPackageRootPath = useCallback(async () => {
		if (isPickingPdfPackageRoot) return;
		setIsPickingPdfPackageRoot(true);
		try {
			const result = await watchdogService.pickRoot(
				projectForm.pdfPackageRootPath || null,
			);
			setFolderPickerAvailability(getWatchdogFolderPickerAvailability());
			if (result.cancelled || !result.path) {
				return;
			}
			setProjectForm((current) => ({
				...current,
				pdfPackageRootPath: result.path || "",
			}));
		} catch (error) {
			if (isWatchdogFolderPickerUnavailableError(error)) {
				setFolderPickerAvailability("unavailable");
			}
			const message =
				error instanceof Error
					? error.message
					: "Unable to browse for a PDF package folder.";
			showToast("error", message);
		} finally {
			setIsPickingPdfPackageRoot(false);
		}
	}, [
		isPickingPdfPackageRoot,
		projectForm.pdfPackageRootPath,
		setProjectForm,
		showToast,
	]);

	const toggleTaskExpansion = async (taskId: string) => {
		const newExpanded = new Set(expandedTasks);
		if (newExpanded.has(taskId)) {
			newExpanded.delete(taskId);
		} else {
			newExpanded.add(taskId);
		}
		setExpandedTasks(newExpanded);

		// Save to Supabase
		if (selectedProject) {
			try {
				await saveSetting(
					"expanded_tasks",
					Array.from(newExpanded),
					selectedProject.id,
				);
			} catch (error) {
				logger.error("Failed to save expanded tasks", "ProjectManager", error);
			}
		}
	};

	const updateProjectWatchdogRootPath = (
		projectId: string,
		rootPath: string | null,
	) => {
		const normalizedRootPath = normalizeProjectRootPath(rootPath ?? "");
		setProjects((previous) =>
			previous.map((project) =>
				project.id === projectId
					? { ...project, watchdog_root_path: normalizedRootPath }
					: project,
			),
		);
		setSelectedProject((previous) =>
			previous?.id === projectId
				? { ...previous, watchdog_root_path: normalizedRootPath }
				: previous,
		);
	};

	const {
		totalProjects,
		archivedProjects,
		activeProjects,
		currentCrumb,
		pendingProjectName,
		pendingTaskName,
	} = deriveProjectManagerSummary({
		projects,
		selectedProject,
		tasks,
		projectIdPendingDelete,
		taskIdPendingDelete,
	});

	return {
		projects,
		selectedProject,
		setSelectedProject,
		tasks,
		files,
		calendarEvents,
		showProjectModal,
		setShowProjectModal,
		showTaskModal,
		setShowTaskModal,
		editingProject,
		setEditingProject,
		editingTask,
		setEditingTask,
		parentTaskForSubtask,
		setParentTaskForSubtask,
		expandedTasks,
		viewMode,
		setViewMode,
		activeIssueSetId,
		setActiveIssueSetId,
		currentMonth,
		setCurrentMonth,
		selectedCalendarDate,
		setSelectedCalendarDate,
		fileFilter,
		setFileFilter,
		projectSearch,
		setProjectSearch,
		statusFilter,
		setStatusFilter,
		taskFilter,
		setTaskFilter,
		projectTaskCounts,
		projectIdPendingDelete,
		setProjectIdPendingDelete,
		taskIdPendingDelete,
		setTaskIdPendingDelete,
		projectForm,
		setProjectForm,
		taskForm,
		setTaskForm,
		createProject,
		createProjectAndOpenAcade,
		updateProject,
		updateProjectAndOpenAcade,
		requestDeleteProject,
		confirmDeleteProject,
		toggleArchiveProject,
		exportProjectMarkdown,
		createTask,
		updateTask,
		toggleTaskComplete,
		requestDeleteTask,
		confirmDeleteTask,
		handleDragEnd,
		handleFileUpload,
		downloadFile,
		pickProjectRootPath,
		isPickingProjectRoot,
		pickProjectPdfPackageRootPath,
		isPickingPdfPackageRoot,
		folderPickerAvailability,
		updateProjectWatchdogRootPath,
		resetProjectForm,
		resetTaskForm,
		openEditProject,
		openEditTask,
		openAddSubtask,
		toggleTaskExpansion,
		sensors,
		totalProjects,
		archivedProjects,
		activeProjects,
		currentCrumb,
		pendingProjectName,
		pendingTaskName,
	};
}
