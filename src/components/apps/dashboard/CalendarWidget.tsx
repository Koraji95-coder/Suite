import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import {
	getCalendarDayUrgencyStyle,
	getUrgencyLevel,
} from "../calendar/urgencyUtils";
import { GlassPanel } from "../ui/GlassPanel";
import { formatDateOnly, formatDateString } from "./dashboardUtils";

interface TaskDueItem {
	id: string;
	name: string;
	due_date: string;
	project_id: string;
	completed: boolean;
}

interface Project {
	id: string;
	name: string;
	deadline: string | null;
	status: string;
	priority: string;
	color: string;
	category: string | null;
}

interface CalendarWidgetProps {
	calendarMonth: Date;
	onMonthChange: (month: Date) => void;
	selectedDate: string | null;
	onDateSelect: (date: string | null) => void;
	projects: Project[];
	allTasksWithDates: TaskDueItem[];
	allProjectsMap: Map<string, Project>;
	onNavigateToProject?: (projectId: string) => void;
}

export function CalendarWidget({
	calendarMonth,
	onMonthChange,
	selectedDate,
	onDateSelect,
	projects,
	allTasksWithDates,
	allProjectsMap,
	onNavigateToProject,
}: CalendarWidgetProps) {
	const { palette } = useTheme();
	const year = calendarMonth.getFullYear();
	const month = calendarMonth.getMonth();
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const daysInMonth = lastDay.getDate();
	const startingDayOfWeek = firstDay.getDay();
	const today = new Date();
	const todayStr = formatDateString(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);

	const navigateMonth = (direction: number) => {
		const newMonth = new Date(year, month + direction, 1);
		onMonthChange(newMonth);
		// Adjust selected date if needed
		if (selectedDate) {
			const selectedDay = parseInt(selectedDate.split("-")[2]);
			const daysInNew = new Date(year, month + direction + 1, 0).getDate();
			onDateSelect(
				formatDateString(
					year,
					month + direction,
					Math.min(selectedDay, daysInNew),
				),
			);
		}
	};

	const handleToday = () => {
		const now = new Date();
		onMonthChange(now);
		if (selectedDate) {
			const selectedDay = parseInt(selectedDate.split("-")[2]);
			const daysInNew = new Date(
				now.getFullYear(),
				now.getMonth() + 1,
				0,
			).getDate();
			onDateSelect(
				formatDateString(
					now.getFullYear(),
					now.getMonth(),
					Math.min(selectedDay, daysInNew),
				),
			);
		}
	};

	const handleDateClick = (dateStr: string) => {
		onDateSelect(selectedDate === dateStr ? null : dateStr);
	};

	const renderDays = () => {
		const days = [];
		for (let i = 0; i < startingDayOfWeek; i++) {
			days.push(<div key={`empty-${i}`} className="h-10"></div>);
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const dateStr = formatDateString(year, month, day);
			const isToday = dateStr === todayStr;
			const isSelected = selectedDate === dateStr;
			const hasProjectDeadline = projects.some((p) => {
				if (!p.deadline) return false;
				const [dy, dm, dd] = p.deadline.split("T")[0].split("-").map(Number);
				return dy === year && dm === month + 1 && dd === day;
			});
			const hasTaskDue = allTasksWithDates.some(
				(t) => t.due_date.split("T")[0] === dateStr,
			);
			const hasDueDate = hasProjectDeadline || hasTaskDue;

			let urgencyStyleObj: {
				backgroundColor: string;
				color: string;
				borderColor: string;
				fontWeight: string;
			} | null = null;
			if (hasDueDate) {
				const deadlinesOnDay = projects
					.filter((p) => p.deadline && p.deadline.split("T")[0] === dateStr)
					.map((p) => p.deadline!);
				const tasksDueOnDay = allTasksWithDates
					.filter((t) => t.due_date.split("T")[0] === dateStr)
					.map((t) => t.due_date);
				const allDatesOnDay = [...deadlinesOnDay, ...tasksDueOnDay];
				const urgencyOrder: Record<string, number> = {
					OVERDUE: 0,
					CRITICAL: 1,
					WARNING: 2,
					NORMAL: 3,
				};
				let bestLevel = getUrgencyLevel(allDatesOnDay[0]);
				for (const d of allDatesOnDay) {
					const lvl = getUrgencyLevel(d);
					if (urgencyOrder[lvl] < urgencyOrder[bestLevel]) bestLevel = lvl;
				}
				urgencyStyleObj = getCalendarDayUrgencyStyle(
					allDatesOnDay.find((d) => getUrgencyLevel(d) === bestLevel) ||
						allDatesOnDay[0],
				);
			}

			const baseClass =
				"h-10 flex items-center justify-center rounded-lg transition-all";
			let dayStyle: React.CSSProperties = {};
			let extraClass = "";

			if (isSelected) {
				dayStyle = {
					backgroundColor: palette.primary,
					color: "#fff",
					fontWeight: "bold",
					boxShadow: `0 0 0 2px ${palette.primary}`,
				};
			} else if (isToday) {
				dayStyle = {
					backgroundColor: hexToRgba(palette.primary, 0.3),
					color: hexToRgba(palette.text, 0.9),
					fontWeight: "bold",
				};
			} else if (hasDueDate && urgencyStyleObj) {
				dayStyle = {
					...urgencyStyleObj,
					borderWidth: "1px",
					borderStyle: "solid",
				};
			} else {
				dayStyle = { color: hexToRgba(palette.text, 0.6) };
				extraClass = "hover:bg-white/[0.06]";
			}

			days.push(
				<button
					key={day}
					onClick={() => handleDateClick(dateStr)}
					className={`${baseClass} ${extraClass}`}
					style={dayStyle}
				>
					{day}
				</button>,
			);
		}
		return days;
	};

	const selectedDateContent =
		selectedDate &&
		(() => {
			const tasksOnDate = allTasksWithDates.filter(
				(t) => t.due_date.split("T")[0] === selectedDate,
			);
			const projectsOnDate = projects.filter(
				(p) => p.deadline && p.deadline.split("T")[0] === selectedDate,
			);
			const hasContent = tasksOnDate.length > 0 || projectsOnDate.length > 0;
			return (
				<div
					className="mt-4 p-3 border rounded-lg"
					style={{
						backgroundColor: hexToRgba(palette.primary, 0.1),
						borderColor: hexToRgba(palette.primary, 0.2),
					}}
				>
					<p
						className="text-sm font-semibold mb-2"
						style={{ color: hexToRgba(palette.text, 0.9) }}
					>
						{(() => {
							const [y, m, d] = selectedDate.split("-").map(Number);
							return new Date(y, m - 1, d).toLocaleDateString("en-US", {
								month: "long",
								day: "numeric",
								year: "numeric",
							});
						})()}
					</p>
					{tasksOnDate.map((task) => {
						const project =
							projects.find((p) => p.id === task.project_id) ||
							allProjectsMap.get(task.project_id);
						return (
							<div
								key={task.id}
								className={`text-sm mb-1 ${task.completed ? "line-through" : ""}`}
								style={{
									color: task.completed
										? hexToRgba(palette.text, 0.3)
										: hexToRgba(palette.primary, 0.9),
								}}
							>
								Task: &quot;{task.name}&quot; Due{" "}
								{formatDateOnly(task.due_date)}
								{project && (
									<span
										className="ml-1"
										style={{ color: hexToRgba(palette.text, 0.4) }}
									>
										({project.name})
									</span>
								)}
							</div>
						);
					})}
					{projectsOnDate.map((project) => (
						<div
							key={project.id}
							className="text-sm cursor-pointer transition-colors"
							style={{ color: hexToRgba(palette.primary, 0.9) }}
							onClick={() => onNavigateToProject?.(project.id)}
						>
							📁 {project.name} — deadline
						</div>
					))}
					{!hasContent && (
						<p
							className="text-sm"
							style={{ color: hexToRgba(palette.text, 0.3) }}
						>
							No events this day
						</p>
					)}
				</div>
			);
		})();

	return (
		<GlassPanel
			tint={palette.primary}
			hoverEffect={false}
			className="p-6 group"
		>
			<div className="relative z-10">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center space-x-2">
						<div
							className="p-2 rounded-lg"
							style={{
								background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.25)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
								boxShadow: `0 0 16px ${hexToRgba(palette.primary, 0.12)}`,
							}}
						>
							<CalendarIcon
								className="w-5 h-5"
								style={{ color: palette.primary }}
							/>
						</div>
						<h3
							className="text-xl font-bold"
							style={{ color: hexToRgba(palette.text, 0.9) }}
						>
							{calendarMonth.toLocaleDateString("en-US", {
								month: "long",
								year: "numeric",
							})}
						</h3>
					</div>
					<div className="flex items-center space-x-2">
						<button
							onClick={() => navigateMonth(-1)}
							className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
						>
							<ChevronLeft
								className="w-5 h-5"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							/>
						</button>
						<button
							onClick={handleToday}
							className="px-3 py-1 text-xs font-semibold rounded-lg transition-all"
							style={{
								...glassCardInnerStyle(palette, palette.primary),
								color: palette.primary,
							}}
						>
							Today
						</button>
						<button
							onClick={() => navigateMonth(1)}
							className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
						>
							<ChevronRight
								className="w-5 h-5"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							/>
						</button>
					</div>
				</div>

				<div className="grid grid-cols-7 gap-2 mb-3">
					{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
						<div
							key={day}
							className="text-center text-xs font-semibold"
							style={{ color: hexToRgba(palette.text, 0.3) }}
						>
							{day}
						</div>
					))}
				</div>

				<div className="grid grid-cols-7 gap-2">{renderDays()}</div>

				{selectedDateContent}
			</div>
		</GlassPanel>
	);
}
