import { FolderKanban } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import type { StatusFilter, ViewMode } from "@/features/project-core";
import { ProjectDetail } from "@/features/project-detail";
import { WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE } from "@/services/watchdogService";
import { ProjectList } from "./ProjectList";
import { ProjectManagerHeader } from "./ProjectManagerHeader";
import styles from "./ProjectManagerWorkspace.module.css";
import { useProjectManagerState } from "./useProjectManagerState";

const ProjectFormModal = lazy(async () => ({
	default: (await import("./ProjectFormModal")).ProjectFormModal,
}));
const TaskFormModal = lazy(async () => ({
	default: (await import("./TaskFormModal")).TaskFormModal,
}));
const ProjectManagerDeleteDialogs = lazy(async () => ({
	default: (await import("./ProjectManagerDeleteDialogs"))
		.ProjectManagerDeleteDialogs,
}));

export interface ProjectManagerWorkspaceProps {
	initialProjectId?: string;
	initialIssueSetId?: string;
	initialViewMode?: ViewMode;
	selectedCalendarDate?: string | null;
	onCalendarDateChange?: (date: string | null) => void;
	calendarMonth?: Date;
	onCalendarMonthChange?: (month: Date) => void;
	onSelectedProjectIdChange?: (projectId: string | null) => void;
	onViewModeChange?: (viewMode: ViewMode) => void;
	onActiveIssueSetIdChange?: (issueSetId: string | null) => void;
}

export function ProjectManagerWorkspace({
	initialProjectId,
	initialIssueSetId,
	initialViewMode,
	selectedCalendarDate: externalSelectedDate,
	onCalendarDateChange,
	calendarMonth: externalMonth,
	onCalendarMonthChange,
	onSelectedProjectIdChange,
	onViewModeChange,
	onActiveIssueSetIdChange,
}: ProjectManagerWorkspaceProps = {}) {
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

	useEffect(() => {
		onSelectedProjectIdChange?.(selectedProject?.id ?? null);
	}, [onSelectedProjectIdChange, selectedProject?.id]);

	useEffect(() => {
		onViewModeChange?.(viewMode);
	}, [onViewModeChange, viewMode]);

	useEffect(() => {
		onActiveIssueSetIdChange?.(activeIssueSetId);
	}, [activeIssueSetId, onActiveIssueSetIdChange]);

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

			{showProjectModal ? (
				<Suspense fallback={null}>
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
						folderPickerUnavailable={folderPickerAvailability === "unavailable"}
						folderPickerHelpMessage={
							folderPickerAvailability === "unavailable"
								? WATCHDOG_FOLDER_PICKER_UNAVAILABLE_MESSAGE
								: null
						}
					/>
				</Suspense>
			) : null}

			{showTaskModal ? (
				<Suspense fallback={null}>
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
				</Suspense>
			) : null}

			<div className={styles.contentGrid}>
				<div className={styles.listPaneShell}>
					<div className={styles.listPaneHeader}>
						<div>
							<p className={styles.listPaneEyebrow}>Projects</p>
							<h3 className={styles.listPaneTitle}>Project list</h3>
							<p className={styles.listPaneCopy}>
								Open a project notebook to manage overview, calendar, files,
								release, and review work.
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
							onFilterChange={(filter) => setStatusFilter(filter as StatusFilter)}
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
								Select a project to open the notebook
							</p>
							<p className={styles.emptyCopy}>
								Pick a project to open overview, review, release, files, and
								calendar context.
							</p>
						</div>
					)}
				</div>
			</div>

			{projectIdPendingDelete || taskIdPendingDelete ? (
				<Suspense fallback={null}>
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
				</Suspense>
			) : null}
		</div>
	);
}
