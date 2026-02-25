import {
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { logActivity } from "@/services/activityService";
import type { Database } from "@/types/database";
import { projectsInfo } from "../../data/panelInfo";
import { triggerAutoBackup } from "../../lib/backupManager";
import { supabase } from "../../lib/supabase";
import {
	loadSetting,
	migrateFromLocalStorage,
	saveSetting,
} from "../../lib/userSettings";
import { PanelInfoDialog } from "../PanelInfoDialog";
import { useToast } from "../ToastProvider";
import { GlassPanel } from "../ui/GlassPanel";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectList } from "./ProjectList";
import {
	CalendarEvent,
	Project,
	ProjectFile,
	ProjectFormData,
	ProjectStatus,
	StatusFilter,
	Task,
	TaskCount,
	TaskFilter,
	TaskFormData,
	ViewMode,
} from "./projectmanagertypes";
import { categoryColor, toDateOnly } from "./projectmanagerutils";
import { TaskFormModal } from "./TaskFormModal";

interface TaskSummary {
	id: string;
	project_id: string | null;
	completed: boolean;
	due_date: string | null;
	name: string;
}

interface ProjectManagerProps {
	initialProjectId?: string;
	selectedCalendarDate?: string | null;
	onCalendarDateChange?: (date: string | null) => void;
	calendarMonth?: Date;
	onCalendarMonthChange?: (month: Date) => void;
}

export function ProjectManager({
	initialProjectId,
	selectedCalendarDate: externalSelectedDate,
	onCalendarDateChange,
	calendarMonth: externalMonth,
	onCalendarMonthChange,
}: ProjectManagerProps = {}) {
	const { showToast } = useToast();
	const { palette } = useTheme();

	// State
	const [projects, setProjects] = useState<Project[]>([]);
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
	const [showProjectModal, setShowProjectModal] = useState(false);
	const [showTaskModal, setShowTaskModal] = useState(false);
	const [editingProject, setEditingProject] = useState<Project | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [parentTaskForSubtask, setParentTaskForSubtask] = useState<
		string | null
	>(null);
	const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
	const [viewMode, setViewMode] = useState<ViewMode>("tasks");
	const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
	const [internalSelectedDate, setInternalSelectedDate] = useState<
		string | null
	>(null);
	const [fileFilter, setFileFilter] = useState("");
	const [projectSearch, setProjectSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
	const [projectTaskCounts, setProjectTaskCounts] = useState<
		Map<string, TaskCount>
	>(new Map());

	const getCurrentUserId = useCallback(async (): Promise<string | null> => {
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();

		if (error || !user) {
			showToast("error", "Please sign in to access project data.");
			return null;
		}

		return user.id;
	}, [showToast]);

	// Form states
	const [projectForm, setProjectForm] = useState<ProjectFormData>({
		name: "",
		description: "",
		deadline: "",
		priority: "medium",
		status: "active",
		category: "",
	});

	const [taskForm, setTaskForm] = useState<TaskFormData>({
		name: "",
		description: "",
		due_date: "",
		priority: "medium",
	});

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
				if (data.length > 0 && !selectedProject) {
					setSelectedProject(data[0]);
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to load projects: ${message}`);
		}
	}, [selectedProject, showToast, getCurrentUserId]);

	// Load initial data
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	useEffect(() => {
		if (!initialProjectId || projects.length === 0) return;

		const matched = projects.find((project) => project.id === initialProjectId);
		if (matched && matched.id !== selectedProject?.id) {
			setSelectedProject(matched);
		}
	}, [initialProjectId, projects, selectedProject?.id]);

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

	useEffect(() => {
		if (selectedProject) {
			loadTasks(selectedProject.id);
			loadFiles(selectedProject.id);
			loadCalendarEvents(selectedProject.id);

			// Restore expanded tasks from Supabase
			const loadExpandedTasks = async () => {
				try {
					// Migrate from localStorage if exists (one-time migration)
					await migrateFromLocalStorage(
						`expanded-tasks-${selectedProject.id}`,
						"expanded_tasks",
						selectedProject.id,
					);

					// Load from Supabase
					const stored = await loadSetting<string[]>(
						"expanded_tasks",
						selectedProject.id,
						[],
					);
					setExpandedTasks(new Set(stored || []));
				} catch (error) {
					console.error("Failed to load expanded tasks:", error);
					setExpandedTasks(new Set());
				}
			};

			loadExpandedTasks();
			setTaskFilter("all");
		}
	}, [selectedProject, loadTasks, loadFiles, loadCalendarEvents]);

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
			} catch {
				/* silent - non-critical */
			}
		},
		[getCurrentUserId],
	);

	useEffect(() => {
		if (projects.length > 0) loadAllProjectTaskCounts(projects);
	}, [projects, loadAllProjectTaskCounts]);

	// CRUD operations for projects
	const createProject = async () => {
		if (!projectForm.name) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const payload: Database["public"]["Tables"]["projects"]["Insert"] = {
				...projectForm,
				deadline: toDateOnly(projectForm.deadline) || null,
				category: projectForm.category || "Uncategorized",
				color: projectForm.category
					? categoryColor(projectForm.category)
					: categoryColor(null),
				user_id: userId,
			};

			const { data, error } = await supabase
				.from("projects")
				.insert([payload])
				.select();

			if (error) throw error;

			if (data) {
				await logActivity({
					action: "create",
					description: `Created project: ${projectForm.name}`,
					projectId: data[0].id,
				});
				setProjects([data[0], ...projects]);
				setSelectedProject(data[0]);
				setShowProjectModal(false);
				resetProjectForm();
				showToast("success", `Project "${projectForm.name}" created`);
				triggerAutoBackup();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to create project: ${message}`);
		}
	};

	const updateProject = async () => {
		if (!editingProject) return;
		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

			const payload: Database["public"]["Tables"]["projects"]["Update"] = {
				...projectForm,
				deadline: toDateOnly(projectForm.deadline) || null,
				category: projectForm.category || "Uncategorized",
				color: projectForm.category
					? categoryColor(projectForm.category)
					: categoryColor(null),
				priority: projectForm.priority,
				status: projectForm.status,
			};

			const { error } = await supabase
				.from("projects")
				.update(payload)
				.eq("id", editingProject.id)
				.eq("user_id", userId);

			if (error) throw error;

			await logActivity({
				action: "update",
				description: `Updated project: ${projectForm.name}`,
				projectId: editingProject.id,
			});
			const updatedProjects = projects.map((p) =>
				p.id === editingProject.id ? { ...p, ...payload } : p,
			);
			setProjects(updatedProjects);
			setSelectedProject((prev) =>
				prev?.id === editingProject.id
					? ({ ...prev, ...payload } as Project)
					: prev,
			);
			setShowProjectModal(false);
			setEditingProject(null);
			resetProjectForm();
			showToast("success", `Project updated`);
			triggerAutoBackup();
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to update project: ${message}`);
		}
	};

	const deleteProject = async (projectId: string) => {
		if (!confirm("Are you sure you want to delete this project?")) return;
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
			}
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

	const deleteTask = async (taskId: string) => {
		if (!confirm("Are you sure? This will also delete all subtasks.")) return;
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

	const handleFileUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		if (!selectedProject || !event.target.files?.length) return;
		const file = event.target.files[0];

		try {
			const userId = await getCurrentUserId();
			if (!userId) return;

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
				loadFiles(selectedProject.id);
				showToast("success", `File "${file.name}" uploaded`);
				triggerAutoBackup();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			showToast("error", `Failed to upload file: ${message}`);
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

	const resetProjectForm = () => {
		setProjectForm({
			name: "",
			description: "",
			deadline: "",
			priority: "medium",
			status: "active",
			category: "",
		});
	};

	const resetTaskForm = () => {
		setTaskForm({
			name: "",
			description: "",
			due_date: "",
			priority: "medium",
		});
	};

	const openEditProject = (project: Project) => {
		setEditingProject(project);
		setProjectForm({
			name: project.name,
			description: project.description,
			deadline: project.deadline || "",
			priority: project.priority,
			status: project.status === "completed" ? "archived" : project.status,
			category: project.category || "",
		});
		setShowProjectModal(true);
	};

	const openEditTask = (task: Task) => {
		setEditingTask(task);
		setTaskForm({
			name: task.name,
			description: task.description || "",
			due_date: task.due_date || "",
			priority: task.priority,
		});
		setShowTaskModal(true);
	};

	const openAddSubtask = (parentId: string) => {
		setParentTaskForSubtask(parentId);
		setEditingTask(null);
		resetTaskForm();
		setShowTaskModal(true);
	};

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
				console.error("Failed to save expanded tasks:", error);
			}
		}
	};

	const primaryActionStyle = {
		...glassCardInnerStyle(palette, palette.primary),
		color: hexToRgba(palette.text, 0.9),
	};

	return (
		<div className="space-y-4">
			{/* Header */}
			<GlassPanel
				variant="toolbar"
				padded
				hoverEffect={false}
				tint={palette.primary}
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<button
						onClick={() => {
							setEditingProject(null);
							resetProjectForm();
							setShowProjectModal(true);
						}}
						className="px-5 py-2.5 rounded-lg transition-all flex items-center space-x-2 font-semibold"
						style={primaryActionStyle}
					>
						<Plus className="w-5 h-5" />
						<span>New Project</span>
					</button>
					<PanelInfoDialog
						title={projectsInfo.title}
						sections={projectsInfo.sections}
						colorScheme={projectsInfo.colorScheme}
					/>
				</div>
			</GlassPanel>

			{/* Project Form Modal */}
			<ProjectFormModal
				isOpen={showProjectModal}
				onClose={() => {
					setShowProjectModal(false);
					setEditingProject(null);
					resetProjectForm();
				}}
				onSubmit={editingProject ? updateProject : createProject}
				formData={projectForm}
				setFormData={setProjectForm}
				isEditing={!!editingProject}
			/>

			{/* Task Form Modal */}
			<TaskFormModal
				isOpen={showTaskModal}
				onClose={() => {
					setShowTaskModal(false);
					setEditingTask(null);
					setParentTaskForSubtask(null);
					resetTaskForm();
				}}
				onSubmit={editingTask ? updateTask : createTask}
				formData={taskForm}
				setFormData={setTaskForm}
				isEditing={!!editingTask}
				isSubtask={!!parentTaskForSubtask}
			/>

			{/* Main Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4">
				{/* Left Column: Project List */}
				<GlassPanel
					tint={palette.secondary}
					hoverEffect={false}
					className="p-4"
				>
					<ProjectList
						projects={projects}
						selectedProject={selectedProject}
						projectTaskCounts={projectTaskCounts}
						onSelectProject={setSelectedProject}
						onEditProject={openEditProject}
						onDeleteProject={deleteProject}
						filter={statusFilter}
						onFilterChange={(f) => setStatusFilter(f as StatusFilter)}
						searchQuery={projectSearch}
						onSearchChange={setProjectSearch}
					/>
				</GlassPanel>

				{/* Right Column: Project Details */}
				<div className="space-y-4">
					{selectedProject ? (
						<ProjectDetail
							project={selectedProject}
							tasks={tasks}
							files={files}
							calendarEvents={calendarEvents}
							onToggleArchive={toggleArchiveProject}
							onExportMarkdown={exportProjectMarkdown}
							onAddTask={() => {
								setEditingTask(null);
								setParentTaskForSubtask(null);
								resetTaskForm();
								setShowTaskModal(true);
							}}
							onEditTask={openEditTask}
							onDeleteTask={deleteTask}
							onToggleTaskComplete={toggleTaskComplete}
							onAddSubtask={openAddSubtask}
							onDragEnd={handleDragEnd}
							expandedTasks={expandedTasks}
							onToggleExpand={toggleTaskExpansion}
							sensors={sensors}
							taskFilter={taskFilter}
							onTaskFilterChange={setTaskFilter}
							viewMode={viewMode}
							onViewModeChange={setViewMode}
							selectedCalendarDate={selectedCalendarDate}
							onCalendarDateSelect={setSelectedCalendarDate}
							currentMonth={currentMonth}
							onMonthChange={setCurrentMonth}
							fileFilter={fileFilter}
							onFileFilterChange={setFileFilter}
							onFileUpload={handleFileUpload}
							onDownloadFile={downloadFile}
						/>
					) : (
						<GlassPanel
							tint={palette.secondary}
							hoverEffect={false}
							className="p-12 flex flex-col items-center justify-center"
						>
							<p
								className="text-lg"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								Select a project to view details
							</p>
						</GlassPanel>
					)}
				</div>
			</div>
		</div>
	);
}
