import { useState } from "react";
import type {
	Project,
	ProjectFormData,
	StatusFilter,
	Task,
	TaskFilter,
	TaskFormData,
	ViewMode,
} from "./projectmanagertypes";

const DEFAULT_PROJECT_FORM: ProjectFormData = {
	name: "",
	description: "",
	deadline: "",
	priority: "medium",
	status: "active",
	category: "Other",
};

const DEFAULT_TASK_FORM: TaskFormData = {
	name: "",
	description: "",
	due_date: "",
	priority: "medium",
};

export function useProjectManagerUiState() {
	const [showProjectModal, setShowProjectModal] = useState(false);
	const [showTaskModal, setShowTaskModal] = useState(false);
	const [editingProject, setEditingProject] = useState<Project | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [parentTaskForSubtask, setParentTaskForSubtask] = useState<
		string | null
	>(null);
	const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
	const [viewMode, setViewMode] = useState<ViewMode>("tasks");
	const [fileFilter, setFileFilter] = useState("");
	const [projectSearch, setProjectSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
	const [projectIdPendingDelete, setProjectIdPendingDelete] = useState<
		string | null
	>(null);
	const [taskIdPendingDelete, setTaskIdPendingDelete] = useState<string | null>(
		null,
	);
	const [projectForm, setProjectForm] =
		useState<ProjectFormData>(DEFAULT_PROJECT_FORM);
	const [taskForm, setTaskForm] = useState<TaskFormData>(DEFAULT_TASK_FORM);

	const resetProjectForm = () => {
		setProjectForm(DEFAULT_PROJECT_FORM);
	};

	const resetTaskForm = () => {
		setTaskForm(DEFAULT_TASK_FORM);
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

	const requestDeleteProject = (projectId: string) => {
		setProjectIdPendingDelete(projectId);
	};

	const requestDeleteTask = (taskId: string) => {
		setTaskIdPendingDelete(taskId);
	};

	return {
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
	};
}
