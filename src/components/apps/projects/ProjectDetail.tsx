import type {
	DragEndEvent,
	SensorDescriptor,
	SensorOptions,
} from "@dnd-kit/core";
import {
	Archive,
	Calendar,
	CheckSquare,
	FileDown,
	MapPin,
	Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GridDesign } from "@/components/apps/ground-grid-generator/types";
import { logger } from "@/lib/errorLogger";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import { GlassPanel } from "../ui/GlassPanel";
import { CalendarView } from "./CalendarView";
import { FilesBrowser } from "./FilesBrowser";
import {
	CalendarEvent,
	Project,
	ProjectFile,
	Task,
	TaskFilter,
	ViewMode,
} from "./projectmanagertypes";
import { categoryColor, formatDateOnly } from "./projectmanagerutils";
import { TaskList } from "./TaskList";

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
	onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
	const navigate = useNavigate();
	const [gridDesigns, setGridDesigns] = useState<GridDesign[]>([]);

	useEffect(() => {
		if (!project?.id) return;
		(async () => {
			try {
				const { data, error } = await supabase
					.from("ground_grid_designs")
					.select("*")
					.eq("project_id", project.id)
					.order("updated_at", { ascending: false });
				if (error) {
					logger.error("ProjectDetail", "Failed to load ground grid designs", {
						projectId: project.id,
						error: error.message,
					});
				} else if (data) {
					setGridDesigns(data as GridDesign[]);
				}
			} catch (err: unknown) {
				logger.error(
					"ProjectDetail",
					"Unexpected error loading ground grid designs",
					{ projectId: project.id },
					err instanceof Error ? err : new Error(String(err)),
				);
			}
		})();
	}, [project?.id]);

	async function createLinkedDesign() {
		const { data } = await supabase
			.from("ground_grid_designs")
			.insert({
				name: `${project.name} - Grid Design`,
				project_id: project.id,
				config: {} as Json,
			})
			.select()
			.maybeSingle();
		if (data) {
			navigate(`/app/apps/ground-grid?design=${data.id}`);
		}
	}

	const completionPercentage =
		tasks.length > 0
			? Math.round(
					(tasks.filter((t) => t.completed).length / tasks.length) * 100,
				)
			: 0;

	const completedTaskCount = tasks.filter((task) => task.completed).length;
	const overdueTaskCount = tasks.filter((task) => {
		if (task.completed || !task.due_date) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [y, m, d] = task.due_date.split("T")[0].split("-").map(Number);
		return new Date(y, m - 1, d) < today;
	}).length;

	const actionButtonStyle = (tint: string) => ({
		...glassCardInnerStyle(palette, tint),
		color: hexToRgba(palette.text, 0.85),
	});

	const tabButtonStyle = (active: boolean) => ({
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
			{/* Project Header */}
			<GlassPanel
				tint={palette.primary}
				hoverEffect={false}
				className="p-7 xl:p-8"
			>
				<div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between mb-6">
					<div className="flex-1">
						<h3
							className="text-2xl md:text-3xl font-bold tracking-tight"
							style={{ color: hexToRgba(palette.text, 0.92) }}
						>
							{project.name}
						</h3>
						<p
							className="mt-2 leading-relaxed"
							style={{ color: hexToRgba(palette.text, 0.55) }}
						>
							{project.description}
						</p>
						<div className="flex flex-wrap items-center gap-3 mt-4">
							<span
								className="text-[11px] px-3 py-1 rounded-full border uppercase tracking-[0.2em]"
								style={{
									borderColor: hexToRgba(palette.primary, 0.32),
									color: hexToRgba(palette.primary, 0.92),
									background: hexToRgba(palette.primary, 0.16),
								}}
							>
								{(project.status === "completed" ? "archived" : project.status)
									.replace("-", " ")
									.replace(/\b\w/g, (l) => l.toUpperCase())}
							</span>
							{project.deadline && (
								<div
									className="flex items-center space-x-2"
									style={{ color: hexToRgba(palette.text, 0.6) }}
								>
									<Calendar className="w-4 h-4" />
									<span className="text-sm">
										{project.status === "completed"
											? `Archived ${formatDateOnly(project.deadline)}`
											: `Due ${formatDateOnly(project.deadline)}`}
									</span>
								</div>
							)}
							{project.category && (
								<span
									className="text-xs px-2.5 py-1 rounded border"
									style={{
										borderColor: categoryColor(project.category),
										color: categoryColor(project.category),
										background: hexToRgba(
											categoryColor(project.category),
											0.12,
										),
									}}
								>
									{project.category}
								</span>
							)}
						</div>
						<div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
							{[
								{ label: "Tasks", value: String(tasks.length) },
								{ label: "Completed", value: String(completedTaskCount) },
								{ label: "Overdue", value: String(overdueTaskCount) },
								{ label: "Progress", value: `${completionPercentage}%` },
							].map((metric) => (
								<div
									key={metric.label}
									className="rounded-xl px-3 py-2.5"
									style={{
										background: hexToRgba(palette.surface, 0.42),
										border: `1px solid ${hexToRgba(palette.text, 0.09)}`,
									}}
								>
									<p
										className="text-[11px] uppercase tracking-[0.16em]"
										style={{ color: hexToRgba(palette.text, 0.5) }}
									>
										{metric.label}
									</p>
									<p
										className="mt-1 text-lg font-semibold"
										style={{ color: hexToRgba(palette.text, 0.92) }}
									>
										{metric.value}
									</p>
								</div>
							))}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							onClick={() => onToggleArchive(project)}
							className="px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5"
							style={actionButtonStyle(
								project.status === "completed"
									? palette.secondary
									: palette.tertiary,
							)}
							title={
								project.status === "completed"
									? "Unarchive project"
									: "Archive project"
							}
						>
							<Archive className="w-3.5 h-3.5" />
							<span>
								{project.status === "completed" ? "Unarchive" : "Archive"}
							</span>
						</button>
						<button
							onClick={onExportMarkdown}
							className="px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5"
							style={actionButtonStyle(palette.primary)}
							title="Copy project as Markdown"
						>
							<FileDown className="w-3.5 h-3.5" />
							<span>Export</span>
						</button>
					</div>
				</div>

				<div className="space-y-2.5">
					<div className="flex justify-between text-sm">
						<span style={{ color: hexToRgba(palette.text, 0.6) }}>
							Progress
						</span>
						<span
							className="font-semibold"
							style={{ color: hexToRgba(palette.text, 0.9) }}
						>
							{completionPercentage}%
						</span>
					</div>
					<div
						key={project.id}
						className="w-full rounded-full h-3.5 overflow-hidden"
						style={{ background: hexToRgba(palette.surface, 0.55) }}
					>
						<div
							className="h-full transition-all duration-700 ease-out"
							style={{
								width: `${completionPercentage}%`,
								willChange: "width",
								background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.tertiary} 100%)`,
							}}
						></div>
					</div>
				</div>
			</GlassPanel>

			{/* View Mode Tabs */}
			<div className="flex flex-wrap items-center gap-2 mb-2">
				<button
					onClick={() => onViewModeChange("tasks")}
					className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
					style={tabButtonStyle(viewMode === "tasks")}
				>
					<CheckSquare className="w-4 h-4" />
					<span>Tasks</span>
				</button>
				<button
					onClick={() => onViewModeChange("calendar")}
					className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
					style={tabButtonStyle(viewMode === "calendar")}
				>
					<Calendar className="w-4 h-4" />
					<span>Calendar</span>
				</button>
				<button
					onClick={() => onViewModeChange("files")}
					className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
					style={tabButtonStyle(viewMode === "files")}
				>
					<FileDown className="w-4 h-4" />
					<span>Files</span>
				</button>
				<button
					onClick={() => onViewModeChange("ground-grids")}
					className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
					style={tabButtonStyle(viewMode === "ground-grids")}
				>
					<MapPin className="w-4 h-4" />
					<span>Ground Grids</span>
				</button>
			</div>

			{/* Content based on view mode */}
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
							{(["all", "pending", "completed"] as const).map((f) => (
								<button
									key={f}
									onClick={() => onTaskFilterChange(f)}
									className="px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all"
									style={tabButtonStyle(taskFilter === f)}
								>
									{f.charAt(0).toUpperCase() + f.slice(1)}
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
				<GlassPanel
					tint={palette.secondary}
					hoverEffect={false}
					className="p-6 soft-fade-up"
				>
					<div className="flex items-center justify-between mb-4">
						<h4
							className="text-xl font-bold"
							style={{ color: hexToRgba(palette.text, 0.88) }}
						>
							Ground Grid Designs
						</h4>
						<button
							onClick={createLinkedDesign}
							className="px-4 py-2 rounded-lg transition-all flex items-center space-x-2"
							style={actionButtonStyle(palette.primary)}
						>
							<Plus className="w-4 h-4" />
							<span>New Design</span>
						</button>
					</div>

					{gridDesigns.length === 0 ? (
						<div
							className="text-center py-12"
							style={{ color: hexToRgba(palette.primary, 0.6) }}
						>
							<MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
							<p className="text-lg font-medium">
								No ground grid designs linked
							</p>
							<p
								className="text-sm mt-1"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Create a new design or link an existing one from the Grid
								Generator
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{gridDesigns.map((d) => (
								<button
									key={d.id}
									onClick={() =>
										navigate(`/app/apps/ground-grid?design=${d.id}`)
									}
									className="w-full text-left rounded-lg p-4 transition-all flex items-center justify-between"
									style={{
										...glassCardInnerStyle(palette, palette.secondary),
										border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
									}}
								>
									<div className="flex items-center space-x-3">
										<MapPin
											className="w-5 h-5"
											style={{ color: hexToRgba(palette.primary, 0.8) }}
										/>
										<div>
											<div
												className="font-semibold"
												style={{ color: hexToRgba(palette.text, 0.85) }}
											>
												{d.name}
											</div>
											<div
												className="text-xs mt-0.5"
												style={{ color: hexToRgba(palette.text, 0.45) }}
											>
												{new Date(d.updated_at).toLocaleDateString()}
											</div>
										</div>
									</div>
									<span
										className="px-2 py-0.5 rounded text-xs font-medium border"
										style={{
											background:
												d.status === "finalized"
													? hexToRgba("#22c55e", 0.18)
													: d.status === "archived"
														? hexToRgba(palette.surface, 0.4)
														: hexToRgba(palette.primary, 0.16),
											color:
												d.status === "finalized"
													? "#86efac"
													: d.status === "archived"
														? hexToRgba(palette.text, 0.5)
														: hexToRgba(palette.text, 0.85),
											borderColor:
												d.status === "finalized"
													? hexToRgba("#22c55e", 0.35)
													: d.status === "archived"
														? hexToRgba(palette.text, 0.08)
														: hexToRgba(palette.primary, 0.3),
										}}
									>
										{d.status}
									</span>
								</button>
							))}
						</div>
					)}
				</GlassPanel>
			)}
		</div>
	);
}
