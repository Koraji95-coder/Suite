import { FolderKanban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectList } from "./ProjectList";
import styles from "./ProjectManager.module.css";
import { ProjectManagerDeleteDialogs } from "./ProjectManagerDeleteDialogs";
import { ProjectManagerHeader } from "./ProjectManagerHeader";
import { selectVisibleProjects } from "./projectManagerSelectors";
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

	const visibleProjects = selectVisibleProjects({
		projects,
		statusFilter,
		projectSearch,
	});

	return (
		<div className={styles.root}>
			<ProjectManagerHeader
				currentCrumb={currentCrumb}
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
				projectSearch={projectSearch}
				onProjectSearchChange={setProjectSearch}
				activeProjects={activeProjects}
				archivedProjects={archivedProjects}
				totalProjects={totalProjects}
				visibleProjectCount={visibleProjects.length}
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

			<div className={styles.contentGrid}>
				<div className={styles.listPaneShell}>
					<div className={styles.listPaneHeader}>
						<div>
							<p className={styles.listPaneEyebrow}>Project queue</p>
							<h3 className={styles.listPaneTitle}>Active portfolio</h3>
							<p className={styles.listPaneCopy}>
								Select a project to open its command center, telemetry, files,
								and task lane.
							</p>
						</div>
						<span className={styles.listPaneBadge}>
							{visibleProjects.length} visible
						</span>
					</div>
					<div className={styles.listPane}>
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
						showControls={false}
					/>
					</div>
				</div>

				<div className={styles.detailColumn}>
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
						<div className={styles.emptyDetail}>
							<FolderKanban className={styles.emptyIcon} />
							<p className={styles.emptyTitle}>
								Select a project to view details
							</p>
							<p className={styles.emptyCopy}>
								Pick one from the queue to open tasks, files, telemetry, and
								project operations.
							</p>
						</div>
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
