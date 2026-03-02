import type {
	DragEndEvent,
	SensorDescriptor,
	SensorOptions,
} from "@dnd-kit/core";
import { CheckSquare, Plus } from "lucide-react";
import type { ChangeEvent, CSSProperties } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import { CalendarView } from "./CalendarView";
import { FilesBrowser } from "./FilesBrowser";
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
	const { palette } = useTheme();
	const { createLinkedDesign, gridDesigns, openGridDesign } =
		useProjectDetailGridDesigns(project);

	const actionButtonStyle = (tint: string): CSSProperties => ({
		...glassCardInnerStyle(palette, tint),
		color: hexToRgba(palette.text, 0.85),
	});

	const tabButtonStyle = (active: boolean): CSSProperties => ({
		background: active
			? `linear-gradient(120deg, ${hexToRgba(palette.primary, 0.2)} 0%, ${hexToRgba(palette.secondary, 0.18)} 100%)`
			: hexToRgba(palette.surface, 0.32),
		border: `1px solid ${hexToRgba(
			active ? palette.primary : palette.text,
			active ? 0.45 : 0.09,
		)}`,
		color: hexToRgba(palette.text, active ? 0.9 : 0.6),
		boxShadow: active
			? `0 8px 24px ${hexToRgba(palette.primary, 0.18)}`
			: "none",
	});

	return (
		<div className="space-y-7">
			<ProjectDetailHeader
				project={project}
				tasks={tasks}
				palette={palette}
				onToggleArchive={onToggleArchive}
				onExportMarkdown={onExportMarkdown}
			/>

			<ProjectDetailViewTabs
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
				tabButtonStyle={tabButtonStyle}
			/>

			{viewMode === "tasks" && (
				<GlassPanel
					tint={palette.secondary}
					hoverEffect={false}
					className="p-7 xl:p-8 soft-fade-up"
				>
					<div className="flex items-center justify-between mb-5">
						<h4
							className="text-xl font-bold"
							style={{ color: hexToRgba(palette.text, 0.88) }}
						>
							Tasks
						</h4>
						<button
							onClick={onAddTask}
							className="px-4 py-2.5 rounded-xl transition-all flex items-center space-x-2 font-medium"
							style={actionButtonStyle(palette.primary)}
						>
							<Plus className="w-4 h-4" />
							<span>Add Task</span>
						</button>
					</div>

					<div
						className="h-px mb-5"
						style={{ background: hexToRgba(palette.text, 0.1) }}
					/>

					{tasks.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-5">
							{(["all", "pending", "completed"] as const).map((filter) => (
								<button
									key={filter}
									onClick={() => onTaskFilterChange(filter)}
									className="px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all"
									style={tabButtonStyle(taskFilter === filter)}
								>
									{filter.charAt(0).toUpperCase() + filter.slice(1)}
								</button>
							))}
						</div>
					)}

					{tasks.length === 0 ? (
						<div
							className="text-center py-14 rounded-2xl border"
							style={{ color: hexToRgba(palette.primary, 0.6) }}
						>
							<CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
							<p className="text-lg font-medium">No tasks in this project</p>
							<p
								className="text-sm mt-1"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Click{" "}
								<span
									className="font-medium"
									style={{ color: hexToRgba(palette.text, 0.7) }}
								>
									Add Task
								</span>{" "}
								to begin
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
				</GlassPanel>
			)}

			{viewMode === "calendar" && (
				<div className="soft-fade-up">
					<CalendarView
						currentMonth={currentMonth}
						onMonthChange={onMonthChange}
						selectedDate={selectedCalendarDate}
						onDateSelect={onCalendarDateSelect}
						calendarEvents={calendarEvents}
					/>
				</div>
			)}

			{viewMode === "files" && (
				<div className="soft-fade-up">
					<FilesBrowser
						files={files}
						filter={fileFilter}
						onFilterChange={onFileFilterChange}
						onUpload={onFileUpload}
						onDownload={onDownloadFile}
						projectName={project.name}
					/>
				</div>
			)}

			{viewMode === "ground-grids" && (
				<ProjectDetailGroundGridsView
					palette={palette}
					gridDesigns={gridDesigns}
					onCreateDesign={() => {
						void createLinkedDesign();
					}}
					onOpenDesign={openGridDesign}
					actionButtonStyle={actionButtonStyle}
				/>
			)}
		</div>
	);
}
