import { FolderKanban } from "lucide-react";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectList } from "./ProjectList";
import styles from "./ProjectManager.module.css";
import { ProjectManagerDeleteDialogs } from "./ProjectManagerDeleteDialogs";
import { ProjectManagerHeader } from "./ProjectManagerHeader";
import type { StatusFilter, ViewMode } from "./projectmanagertypes";
import { TaskFormModal } from "./TaskFormModal";
import { useProjectManagerState } from "./useProjectManagerState";

interface ProjectManagerProps {
	initialProjectId?: string;
	initialIssueSetId?: string;
	initialViewMode?: ViewMode;
	selectedCalendarDate?: string | null;
	onCalendarDateChange?: (date: string | null) => void;
	calendarMonth?: Date;
	onCalendarMonthChange?: (month: Date) => void;
}

export function ProjectManager({
	initialProjectId,
	initialIssueSetId,
	initialViewMode,
	selectedCalendarDate: externalSelectedDate,
	onCalendarDateChange,
	calendarMonth: externalMonth,
	onCalendarMonthChange,
}: ProjectManagerProps = {}) {
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
		pendingProjectName,
		pendingTaskName,
	} = useProjectManagerState({
		initialProjectId,
		initialIssueSetId,
		initialViewMode,
		externalSelectedDate,
		onCalendarDateChange,
		externalMonth,
		onCalendarMonthChange,
	});

	return (
		<div className={styles.root}>
			<ProjectManagerHeader
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
			/>

			<ProjectFormModal
				isOpen={showProjectModal}
				projectId={editingProject?.id ?? null}
				onClose={() => {
					setShowProjectModal(false);
					setEditingProject(null);
					resetProjectForm();
				}}
				onSubmit={editingProject ? updateProject : createProject}
				onSubmitAndOpenAcade={
					editingProject
						? updateProjectAndOpenAcade
						: createProjectAndOpenAcade
				}
				formData={projectForm}
				setFormData={setProjectForm}
				isEditing={Boolean(editingProject)}
				onBrowseRootPath={pickProjectRootPath}
				isBrowsingRootPath={isPickingProjectRoot}
				onBrowsePdfRootPath={pickProjectPdfPackageRootPath}
				isBrowsingPdfRootPath={isPickingPdfPackageRoot}
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
							<p className={styles.listPaneEyebrow}>Projects</p>
							<h3 className={styles.listPaneTitle}>Project list</h3>
							<p className={styles.listPaneCopy}>
								Open a project to manage setup, readiness, review, issue
								sets, and files.
							</p>
						</div>
					</div>
					<div className={styles.listPane}>
						<ProjectList
							projects={projects}
							selectedProject={selectedProject}
							projectTaskCounts={projectTaskCounts}
							onSelectProject={(project) => {
								setSelectedProject(project);
								setActiveIssueSetId(null);
								setViewMode("setup");
							}}
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
							activeIssueSetId={activeIssueSetId}
							onActiveIssueSetIdChange={setActiveIssueSetId}
							selectedCalendarDate={selectedCalendarDate}
							onCalendarDateSelect={setSelectedCalendarDate}
							currentMonth={currentMonth}
							onMonthChange={setCurrentMonth}
							fileFilter={fileFilter}
							onFileFilterChange={setFileFilter}
							onFileUpload={handleFileUpload}
							onDownloadFile={downloadFile}
							onProjectWatchdogRootChange={updateProjectWatchdogRootPath}
						/>
					) : (
						<div className={styles.emptyDetail}>
							<FolderKanban className={styles.emptyIcon} />
							<p className={styles.emptyTitle}>
								Select a project to view details
							</p>
							<p className={styles.emptyCopy}>
								Pick a project to open setup, review, issue sets, and project
								activity.
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
