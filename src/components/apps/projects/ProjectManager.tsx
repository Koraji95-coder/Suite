import { FolderKanban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectList } from "./ProjectList";
import { ProjectManagerDeleteDialogs } from "./ProjectManagerDeleteDialogs";
import { ProjectManagerHeader } from "./ProjectManagerHeader";
import type { StatusFilter } from "./projectmanagertypes";
import { TaskFormModal } from "./TaskFormModal";
import { useProjectManagerState } from "./useProjectManagerState";

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
	const { palette } = useTheme();
	const navigate = useNavigate();
	const {
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
		updateProject,
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
	} = useProjectManagerState({
		initialProjectId,
		externalSelectedDate,
		onCalendarDateChange,
		externalMonth,
		onCalendarMonthChange,
	});

	return (
		<div className="mx-auto w-full max-w-[1760px] space-y-8">
			<ProjectManagerHeader
				palette={palette}
				currentCrumb={currentCrumb}
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
				projectSearch={projectSearch}
				onProjectSearchChange={setProjectSearch}
				activeProjects={activeProjects}
				archivedProjects={archivedProjects}
				totalProjects={totalProjects}
				onCreateProject={() => {
					setEditingProject(null);
					resetProjectForm();
					setShowProjectModal(true);
				}}
				onGoWorkspace={() => navigate("/app/dashboard")}
				onGoProjects={() => navigate("/app/projects")}
			/>

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
				isEditing={Boolean(editingProject)}
			/>

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
				isEditing={Boolean(editingTask)}
				isSubtask={Boolean(parentTaskForSubtask)}
			/>

			<div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-6 xl:gap-7">
				<GlassPanel
					tint={palette.secondary}
					hoverEffect={false}
					className="p-5"
				>
					<ProjectList
						projects={projects}
						selectedProject={selectedProject}
						projectTaskCounts={projectTaskCounts}
						onSelectProject={setSelectedProject}
						onEditProject={openEditProject}
						onDeleteProject={requestDeleteProject}
						filter={statusFilter}
						onFilterChange={(f) => setStatusFilter(f as StatusFilter)}
						searchQuery={projectSearch}
						onSearchChange={setProjectSearch}
					/>
				</GlassPanel>

				<div className="space-y-6">
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
							onDeleteTask={requestDeleteTask}
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
							<FolderKanban
								className="h-12 w-12 mb-4"
								style={{ color: hexToRgba(palette.primary, 0.65) }}
							/>
							<p
								className="text-lg font-medium"
								style={{ color: hexToRgba(palette.text, 0.7) }}
							>
								Select a project to view details
							</p>
							<p
								className="mt-2 text-sm"
								style={{ color: hexToRgba(palette.text, 0.48) }}
							>
								Pick one from the list to open tasks, files, and schedules.
							</p>
						</GlassPanel>
					)}
				</div>
			</div>
			<ProjectManagerDeleteDialogs
				projectIdPendingDelete={projectIdPendingDelete}
				taskIdPendingDelete={taskIdPendingDelete}
				pendingProjectName={pendingProjectName}
				pendingTaskName={pendingTaskName}
				onCancelProjectDelete={() => setProjectIdPendingDelete(null)}
				onConfirmProjectDelete={() => void confirmDeleteProject()}
				onCancelTaskDelete={() => setTaskIdPendingDelete(null)}
				onConfirmTaskDelete={() => void confirmDeleteTask()}
			/>
		</div>
	);
}
