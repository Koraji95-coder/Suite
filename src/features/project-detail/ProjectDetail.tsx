import type {
	DragEndEvent,
	SensorDescriptor,
	SensorOptions,
} from "@dnd-kit/core";
import { CheckSquare, Plus } from "lucide-react";
import { type ChangeEvent, type ReactNode, Suspense, lazy } from "react";
import {
	CalendarView,
	FilesBrowser,
	ProjectDetailHeader,
	ProjectDetailViewTabs,
	TaskList,
	useProjectDetailWorkspaceState,
} from "@/features/project-detail";
import { cn } from "@/lib/utils";
import styles from "./ProjectDetail.module.css";
import {
	type CalendarEvent,
	type Project,
	type ProjectFile,
	type Task,
	type TaskFilter,
	type ViewMode,
} from "@/features/project-core";
const ProjectDetailGroundGridsView = lazy(async () => ({
	default: (await import("@/features/project-detail/ProjectDetailGroundGridsView"))
		.ProjectDetailGroundGridsView,
}));
const ProjectIssueSetManager = lazy(async () => ({
	default: (await import("@/features/project-workflow/ProjectIssueSetManager"))
		.ProjectIssueSetManager,
}));
const ProjectReadinessWorkspace = lazy(async () => ({
	default: (await import("@/features/project-review/ProjectReadinessWorkspace"))
		.ProjectReadinessWorkspace,
}));
const ProjectReviewInboxWorkspace = lazy(async () => ({
	default: (await import("@/features/project-review/ProjectReviewInboxWorkspace"))
		.ProjectReviewInboxWorkspace,
}));
const ProjectRevisionRegisterView = lazy(async () => ({
	default: (await import("@/features/project-revisions/ProjectRevisionRegisterView"))
		.ProjectRevisionRegisterView,
}));
const ProjectSetupWorkspace = lazy(async () => ({
	default: (await import("@/features/project-setup/ProjectSetupWorkspace"))
		.ProjectSetupWorkspace,
}));
const ProjectTelemetryPanel = lazy(async () => ({
	default: (await import("@/features/project-watchdog/ProjectTelemetryPanel"))
		.ProjectTelemetryPanel,
}));

interface ProjectDetailProps {
	project: Project;
	tasks: Task[];
	files: ProjectFile[];
	calendarEvents: CalendarEvent[];
	onToggleArchive: (project: Project) => void;
	onExportMarkdown: () => void;
	onAddTask: () => void;
	onEditTask: (task: Task) => void;
	onDeleteTask: (taskId: string) => void;
	onToggleTaskComplete: (task: Task) => void;
	onAddSubtask: (parentId: string) => void;
	onDragEnd: (event: DragEndEvent) => void;
	expandedTasks: Set<string>;
	onToggleExpand: (taskId: string) => void;
	sensors: SensorDescriptor<SensorOptions>[];
	taskFilter: TaskFilter;
	onTaskFilterChange: (filter: TaskFilter) => void;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	activeIssueSetId: string | null;
	onActiveIssueSetIdChange: (issueSetId: string | null) => void;
	selectedCalendarDate: string | null;
	onCalendarDateSelect: (date: string | null) => void;
	currentMonth: Date;
	onMonthChange: (month: Date) => void;
	fileFilter: string;
	onFileFilterChange: (filter: string) => void;
	onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
	onDownloadFile: (file: ProjectFile) => void;
	onProjectWatchdogRootChange: (
		projectId: string,
		rootPath: string | null,
	) => void;
}

export function ProjectDetail({
	project,
	tasks,
	files,
	calendarEvents,
	onToggleArchive,
	onExportMarkdown,
	onAddTask,
	onEditTask,
	onDeleteTask,
	onToggleTaskComplete,
	onAddSubtask,
	onDragEnd,
	expandedTasks,
	onToggleExpand,
	sensors,
	taskFilter,
	onTaskFilterChange,
	viewMode,
	onViewModeChange,
	activeIssueSetId,
	onActiveIssueSetIdChange,
	selectedCalendarDate,
	onCalendarDateSelect,
	currentMonth,
	onMonthChange,
	fileFilter,
	onFileFilterChange,
	onFileUpload,
	onDownloadFile,
	onProjectWatchdogRootChange,
}: ProjectDetailProps) {
	const { createLinkedDesign, gridDesigns, openGridDesign, telemetry } =
		useProjectDetailWorkspaceState({
			project,
			viewMode,
		});

	const renderWorkspacePanel = (panel: ReactNode) => (
		<Suspense
			fallback={
				<div className={styles.workspaceLoading} aria-busy="true">
					<p className={styles.workspaceLoadingTitle}>Loading workspace...</p>
					<p className={styles.workspaceLoadingCopy}>
						Preparing the selected project tool.
					</p>
				</div>
			}
		>
			{panel}
		</Suspense>
	);

	return (
		<div className={styles.root}>
			<div className={styles.primaryStack}>
				<section className={styles.headerShell}>
					<ProjectDetailHeader
						project={project}
						tasks={tasks}
						telemetry={telemetry}
						onToggleArchive={onToggleArchive}
						onExportMarkdown={onExportMarkdown}
					/>
				</section>

				<section className={styles.workspaceNavShell}>
					<ProjectDetailViewTabs
						viewMode={viewMode}
						onViewModeChange={onViewModeChange}
					/>
				</section>
			</div>

			<section className={styles.workspaceShell}>
				<div className={styles.workspaceContent}>
					{viewMode === "setup" && (
						renderWorkspacePanel(
							<ProjectSetupWorkspace
								project={project}
								telemetry={telemetry}
								onOpenViewMode={onViewModeChange}
							/>,
						)
					)}

					{viewMode === "readiness" && (
						renderWorkspacePanel(
							<ProjectReadinessWorkspace
								project={project}
								telemetry={telemetry}
								preferredIssueSetId={activeIssueSetId}
								onIssueSetContextChange={onActiveIssueSetIdChange}
								onOpenViewMode={onViewModeChange}
							/>,
						)
					)}

					{viewMode === "review" && (
						renderWorkspacePanel(
							<ProjectReviewInboxWorkspace
								project={project}
								telemetry={telemetry}
								preferredIssueSetId={activeIssueSetId}
								onIssueSetContextChange={onActiveIssueSetIdChange}
								onOpenViewMode={onViewModeChange}
							/>,
						)
					)}

					{viewMode === "issue-sets" && (
						renderWorkspacePanel(
							<ProjectIssueSetManager
								project={project}
								telemetry={telemetry}
								preferredIssueSetId={activeIssueSetId}
								onIssueSetContextChange={onActiveIssueSetIdChange}
								onOpenViewMode={onViewModeChange}
							/>,
						)
					)}

					{viewMode === "tasks" && (
						<section className={styles.tasksPanel}>
							<div className={styles.tasksHead}>
								<h4 className={styles.tasksTitle}>Tasks</h4>
								<button
									onClick={onAddTask}
									className={styles.addButton}
									type="button"
								>
									<Plus className={styles.addIcon} />
									<span>Add Task</span>
								</button>
							</div>

							<div className={styles.divider} />

							{tasks.length > 0 && (
								<div className={styles.taskFilters}>
									{(["all", "pending", "completed"] as const).map((filter) => (
										<button
											key={filter}
											type="button"
											onClick={() => onTaskFilterChange(filter)}
											className={cn(
												styles.taskFilterButton,
												taskFilter === filter && styles.taskFilterActive,
											)}
										>
											{filter.charAt(0).toUpperCase() + filter.slice(1)}
										</button>
									))}
								</div>
							)}

							{tasks.length === 0 ? (
								<div className={styles.empty}>
									<CheckSquare className={styles.emptyIcon} />
									<p className={styles.emptyTitle}>No tasks in this project</p>
									<p className={styles.emptySub}>
										Click <span className={styles.emptyHint}>Add Task</span> to
										begin
									</p>
								</div>
							) : (
								<TaskList
									tasks={tasks}
									onToggleComplete={onToggleTaskComplete}
									onAddSubtask={onAddSubtask}
									onEditTask={onEditTask}
									onDeleteTask={onDeleteTask}
									onDragEnd={onDragEnd}
									expandedTasks={expandedTasks}
									onToggleExpand={onToggleExpand}
									isProjectArchived={project.status === "completed"}
									sensors={sensors}
									filter={taskFilter}
								/>
							)}
						</section>
					)}

					{viewMode === "calendar" && (
						renderWorkspacePanel(
							<CalendarView
								currentMonth={currentMonth}
								onMonthChange={onMonthChange}
								selectedDate={selectedCalendarDate}
								onDateSelect={onCalendarDateSelect}
								calendarEvents={calendarEvents}
							/>,
						)
					)}

					{viewMode === "files" && (
						renderWorkspacePanel(
							<div className={styles.supportWorkspace}>
								<ProjectTelemetryPanel
									projectId={project.id}
									telemetry={telemetry}
									onRootPathChange={(rootPath) =>
										onProjectWatchdogRootChange(project.id, rootPath)
									}
								/>
								<FilesBrowser
									files={files}
									filter={fileFilter}
									onFilterChange={onFileFilterChange}
									onUpload={onFileUpload}
									onDownload={onDownloadFile}
									projectName={project.name}
								/>
							</div>,
						)
					)}

					{viewMode === "ground-grids" && (
						renderWorkspacePanel(
							<ProjectDetailGroundGridsView
								gridDesigns={gridDesigns}
								onCreateDesign={() => {
									void createLinkedDesign();
								}}
								onOpenDesign={openGridDesign}
							/>,
						)
					)}

					{viewMode === "revisions" && (
						renderWorkspacePanel(
							<ProjectRevisionRegisterView project={project} files={files} />,
						)
					)}
				</div>
			</section>
		</div>
	);
}

