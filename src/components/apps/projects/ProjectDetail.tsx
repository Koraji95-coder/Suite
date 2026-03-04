import type {
	DragEndEvent,
	SensorDescriptor,
	SensorOptions,
} from "@dnd-kit/core";
import { CheckSquare, Plus } from "lucide-react";
import { type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { CalendarView } from "./CalendarView";
import { FilesBrowser } from "./FilesBrowser";
import styles from "./ProjectDetail.module.css";
import { ProjectDetailGroundGridsView } from "./ProjectDetailGroundGridsView";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { ProjectDetailViewTabs } from "./ProjectDetailViewTabs";
import {
	type CalendarEvent,
	type Project,
	type ProjectFile,
	type Task,
	type TaskFilter,
	type ViewMode,
} from "./projectmanagertypes";
import { TaskList } from "./TaskList";
import { useProjectDetailGridDesigns } from "./useProjectDetailGridDesigns";

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
	selectedCalendarDate: string | null;
	onCalendarDateSelect: (date: string | null) => void;
	currentMonth: Date;
	onMonthChange: (month: Date) => void;
	fileFilter: string;
	onFileFilterChange: (filter: string) => void;
	onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
	onDownloadFile: (file: ProjectFile) => void;
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
	selectedCalendarDate,
	onCalendarDateSelect,
	currentMonth,
	onMonthChange,
	fileFilter,
	onFileFilterChange,
	onFileUpload,
	onDownloadFile,
}: ProjectDetailProps) {
	const { createLinkedDesign, gridDesigns, openGridDesign } =
		useProjectDetailGridDesigns(project);

	return (
		<div className={styles.root}>
			<ProjectDetailHeader
				project={project}
				tasks={tasks}
				onToggleArchive={onToggleArchive}
				onExportMarkdown={onExportMarkdown}
			/>

			<ProjectDetailViewTabs
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
			/>

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
				<CalendarView
					currentMonth={currentMonth}
					onMonthChange={onMonthChange}
					selectedDate={selectedCalendarDate}
					onDateSelect={onCalendarDateSelect}
					calendarEvents={calendarEvents}
				/>
			)}

			{viewMode === "files" && (
				<FilesBrowser
					files={files}
					filter={fileFilter}
					onFilterChange={onFileFilterChange}
					onUpload={onFileUpload}
					onDownload={onDownloadFile}
					projectName={project.name}
				/>
			)}

			{viewMode === "ground-grids" && (
				<ProjectDetailGroundGridsView
					gridDesigns={gridDesigns}
					onCreateDesign={() => {
						void createLinkedDesign();
					}}
					onOpenDesign={openGridDesign}
				/>
			)}
		</div>
	);
}
