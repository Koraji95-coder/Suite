/* =========================================================
   2) src/components/apps/calendar/EventCalendar.tsx
   Controlled selectedDate support + same UI as before
   ========================================================= */

import {
	addDays,
	addMonths,
	addWeeks,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	startOfWeek,
	subMonths,
	subWeeks,
} from "date-fns";
import {
	CalendarCheck,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PlusIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/apps/ui/dropdown-menu";
import { GlassPanel } from "@/components/apps/ui/GlassPanel";
import { getContrastText, hexToRgba, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import {
	AgendaDaysToShow,
	AgendaView,
	addHoursToDate,
	CalendarDndProvider,
	CalendarEvent,
	CalendarView,
	DayView,
	EventDialog,
	EventGap,
	EventHeight,
	MonthView,
	WeekCellsHeight,
	WeekView,
} from "./calendarindex";

export interface EventCalendarProps {
	events?: CalendarEvent[];
	onEventAdd?: (event: CalendarEvent) => void;
	onEventUpdate?: (event: CalendarEvent) => void;
	onEventDelete?: (eventId: string) => void;
	className?: string;
	initialView?: CalendarView;
	compact?: boolean;
	projectOptions?: Array<{ id: string; name: string }>;
	taskOptions?: Array<{ id: string; name: string; project_id: string | null }>;

	/** Controlled selection */
	selectedDate?: Date;
	onSelectedDateChange?: (date: Date) => void;
}

function useControllableDate(
	controlled: Date | undefined,
	onChange: ((d: Date) => void) | undefined,
	initial: Date,
) {
	const [uncontrolled, setUncontrolled] = useState<Date>(initial);
	const isControlled = controlled instanceof Date;

	const value = isControlled ? (controlled as Date) : uncontrolled;

	const setValue = (next: Date) => {
		onChange?.(next);
		if (!isControlled) setUncontrolled(next);
	};

	return [value, setValue] as const;
}

type ToolbarProps = {
	compact: boolean;
	view: CalendarView;
	viewTitle: React.ReactNode;
	palette: ReturnType<typeof useTheme>["palette"];
	primaryTextColor: string;
	onToday: () => void;
	onPrev: () => void;
	onNext: () => void;
	onViewChange: (v: CalendarView) => void;
	onNewEvent: () => void;
};

const VIEW_LABEL: Record<CalendarView, string> = {
	month: "Month",
	week: "Week",
	day: "Day",
	agenda: "Agenda",
};

function CalendarToolbar({
	compact,
	view,
	viewTitle,
	palette,
	primaryTextColor,
	onToday,
	onPrev,
	onNext,
	onViewChange,
	onNewEvent,
}: ToolbarProps) {
	const controlBase =
		"inline-flex items-center justify-center rounded-lg font-semibold transition-all leading-none text-center whitespace-nowrap";
	const controlSize = compact
		? "min-h-9 px-3 py-2 text-sm"
		: "min-h-[46px] px-5 py-2.5 text-sm sm:text-base";
	const primaryControlSize = compact
		? "min-h-10 px-4 py-2 text-sm"
		: "min-h-[52px] px-6 py-3 text-sm sm:text-base";
	const pillBg = hexToRgba(palette.surface, 0.3);

	return (
		<div
			className={cn(
				"sticky top-0 z-20 rounded-xl",
				compact ? "mx-2 mt-2" : "mx-2 mt-2 sm:mx-4 sm:mt-4",
			)}
			style={{
				background: hexToRgba(palette.surface, 0.45),
				backdropFilter: "blur(10px) saturate(120%)",
				WebkitBackdropFilter: "blur(10px) saturate(120%)",
				border: `1px solid ${hexToRgba(palette.text, 0.1)}`,
			}}
		>
			<div
				className={cn(
					"grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center",
					compact ? "p-2" : "p-3 sm:p-4",
				)}
			>
				<div
					className={cn(
						"flex flex-wrap items-center min-w-0",
						compact ? "gap-1.5" : "gap-3",
					)}
				>
					<button
						onClick={onToday}
						className={cn(controlBase, controlSize)}
						style={{
							background: pillBg,
							border: `1px solid ${hexToRgba(palette.text, 0.16)}`,
							color: palette.primary,
						}}
					>
						<CalendarCheck className="h-4 w-4 sm:me-2" aria-hidden="true" />
						<span className="max-[479px]:sr-only sm:not-sr-only">Today</span>
					</button>

					<div className="flex items-center gap-1">
						<button
							onClick={onPrev}
							aria-label="Previous"
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.08]"
						>
							<ChevronLeftIcon
								size={18}
								style={{ color: hexToRgba(palette.text, 0.55) }}
								aria-hidden="true"
							/>
						</button>
						<button
							onClick={onNext}
							aria-label="Next"
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.08]"
						>
							<ChevronRightIcon
								size={18}
								style={{ color: hexToRgba(palette.text, 0.55) }}
								aria-hidden="true"
							/>
						</button>
					</div>

					<div className="hidden md:flex items-center gap-1 ms-1">
						{(["month", "week", "day", "agenda"] as CalendarView[]).map((v) => {
							const active = v === view;
							return (
								<button
									key={v}
									type="button"
									onClick={() => onViewChange(v)}
									className={cn(
										"inline-flex h-10 w-24 items-center justify-center rounded-xl border text-center text-sm leading-none transition-colors",
										active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
									)}
									style={{
										borderColor: active
											? hexToRgba(palette.primary, 0.22)
											: hexToRgba(palette.text, 0.12),
										color: active
											? hexToRgba(palette.text, 0.92)
											: hexToRgba(palette.text, 0.68),
									}}
								>
									{VIEW_LABEL[v]}
								</button>
							);
						})}
					</div>
				</div>

				<div className="flex items-center justify-center sm:justify-self-center">
					<h2
						className={cn(
							"font-semibold text-center",
							compact ? "text-sm" : "text-sm sm:text-lg md:text-xl",
						)}
						style={{ color: hexToRgba(palette.text, 0.9) }}
					>
						{viewTitle}
					</h2>
				</div>

				<div
					className={cn(
						"flex items-center justify-between sm:justify-end min-w-0 pr-2 sm:pr-3",
						compact ? "gap-1.5" : "gap-2",
					)}
				>
					<div className="md:hidden">
						<DropdownMenu placement="bottom-end">
							<DropdownMenuTrigger asChild>
								<button
									className={cn(controlBase, controlSize, "gap-1.5")}
									style={{
										background: pillBg,
										border: `1px solid ${hexToRgba(palette.text, 0.16)}`,
										color: hexToRgba(palette.text, 0.78),
									}}
								>
									<span>{VIEW_LABEL[view]}</span>
									<ChevronDownIcon
										className="-me-1 opacity-60"
										size={16}
										aria-hidden="true"
									/>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-36">
								<DropdownMenuItem onClick={() => onViewChange("month")}>
									Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("week")}>
									Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("day")}>
									Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("agenda")}>
									Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<button
						type="button"
						className={cn(
							controlBase,
							primaryControlSize,
							"gap-1.5 rounded-xl ms-1 sm:ms-2 me-2 sm:me-3",
						)}
						style={{
							backgroundColor: palette.primary,
							color: primaryTextColor,
							boxShadow: `0 0 12px ${hexToRgba(palette.primary, 0.3)}`,
						}}
						onClick={onNewEvent}
					>
						<PlusIcon
							className="opacity-80 sm:-ms-1"
							size={16}
							aria-hidden="true"
						/>
						<span className="max-sm:sr-only">New event</span>
					</button>
				</div>
			</div>

			<div
				className="h-px"
				style={{
					background: `linear-gradient(90deg, transparent, ${hexToRgba(palette.text, 0.14)}, transparent)`,
				}}
			/>
		</div>
	);
}

export function EventCalendar({
	events = [],
	onEventAdd,
	onEventUpdate,
	onEventDelete,
	className,
	initialView = "month",
	compact = false,
	projectOptions = [],
	taskOptions = [],
	selectedDate: controlledSelectedDate,
	onSelectedDateChange,
}: EventCalendarProps) {
	const { palette } = useTheme();
	const [currentDate, setCurrentDate] = useState(new Date());
	const [selectedDate, setSelectedDate] = useControllableDate(
		controlledSelectedDate,
		onSelectedDateChange,
		new Date(),
	);

	const [view, setView] = useState<CalendarView>(initialView);
	const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
		null,
	);

	useEffect(() => {
		if (controlledSelectedDate) setCurrentDate(controlledSelectedDate);
	}, [controlledSelectedDate]);

	const primaryTextColor = useMemo(
		() => getContrastText(palette.primary),
		[palette.primary],
	);

	const handleDateSelect = (date: Date) => {
		setSelectedDate(date);
		setCurrentDate(date);
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				isEventDialogOpen ||
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable)
			) {
				return;
			}
			switch (e.key.toLowerCase()) {
				case "m":
					setView("month");
					break;
				case "w":
					setView("week");
					break;
				case "d":
					setView("day");
					break;
				case "a":
					setView("agenda");
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isEventDialogOpen]);

	const handlePrevious = () => {
		if (view === "month") {
			const next = subMonths(currentDate, 1);
			setCurrentDate(next);
			const lastDay = endOfMonth(next).getDate();
			const day = Math.min(selectedDate.getDate(), lastDay);
			setSelectedDate(new Date(next.getFullYear(), next.getMonth(), day));
			return;
		}
		if (view === "week") {
			setCurrentDate(subWeeks(currentDate, 1));
			setSelectedDate(subWeeks(selectedDate, 1));
			return;
		}
		if (view === "day") {
			setCurrentDate(addDays(currentDate, -1));
			setSelectedDate(addDays(selectedDate, -1));
			return;
		}
		setCurrentDate(addDays(currentDate, -AgendaDaysToShow));
		setSelectedDate(addDays(selectedDate, -AgendaDaysToShow));
	};

	const handleNext = () => {
		if (view === "month") {
			const next = addMonths(currentDate, 1);
			setCurrentDate(next);
			const lastDay = endOfMonth(next).getDate();
			const day = Math.min(selectedDate.getDate(), lastDay);
			setSelectedDate(new Date(next.getFullYear(), next.getMonth(), day));
			return;
		}
		if (view === "week") {
			setCurrentDate(addWeeks(currentDate, 1));
			setSelectedDate(addWeeks(selectedDate, 1));
			return;
		}
		if (view === "day") {
			setCurrentDate(addDays(currentDate, 1));
			setSelectedDate(addDays(selectedDate, 1));
			return;
		}
		setCurrentDate(addDays(currentDate, AgendaDaysToShow));
		setSelectedDate(addDays(selectedDate, AgendaDaysToShow));
	};

	const handleToday = () => {
		const today = new Date();
		setCurrentDate(today);
		setSelectedDate(today);
	};

	const handleEventSelect = (event: CalendarEvent) => {
		setSelectedEvent(event);
		setIsEventDialogOpen(true);
	};

	const handleEventCreate = (startTime: Date) => {
		const minutes = startTime.getMinutes();
		const remainder = minutes % 15;
		if (remainder !== 0) {
			if (remainder < 7.5) startTime.setMinutes(minutes - remainder);
			else startTime.setMinutes(minutes + (15 - remainder));
			startTime.setSeconds(0);
			startTime.setMilliseconds(0);
		}

		const newEvent: CalendarEvent = {
			id: "",
			title: "",
			start: startTime,
			end: addHoursToDate(startTime, 1),
			allDay: false,
		};
		setSelectedEvent(newEvent);
		setIsEventDialogOpen(true);
	};

	const handleEventSave = (event: CalendarEvent) => {
		if (event.id) onEventUpdate?.(event);
		else
			onEventAdd?.({
				...event,
				id: Math.random().toString(36).substring(2, 11),
			});

		setIsEventDialogOpen(false);
		setSelectedEvent(null);
	};

	const handleEventDelete = (eventId: string) => {
		onEventDelete?.(eventId);
		setIsEventDialogOpen(false);
		setSelectedEvent(null);
	};

	const handleEventUpdate = (updatedEvent: CalendarEvent) => {
		onEventUpdate?.(updatedEvent);
	};

	const viewTitle = useMemo(() => {
		if (view === "month") return format(currentDate, "MMMM yyyy");
		if (view === "week") {
			const start = startOfWeek(currentDate, { weekStartsOn: 0 });
			const end = endOfWeek(currentDate, { weekStartsOn: 0 });
			return isSameMonth(start, end)
				? format(start, "MMMM yyyy")
				: `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
		}
		if (view === "day") {
			return (
				<>
					<span className="min-[480px]:hidden leading-none" aria-hidden="true">
						{format(currentDate, "MMM d, yyyy")}
					</span>
					<span
						className="max-[479px]:hidden md:hidden leading-tight"
						aria-hidden="true"
					>
						{format(currentDate, "MMMM d, yyyy")}
					</span>
					<span className="max-md:hidden leading-tight">
						{format(currentDate, "EEE MMMM d, yyyy")}
					</span>
				</>
			);
		}
		if (view === "agenda") {
			const start = currentDate;
			const end = addDays(currentDate, AgendaDaysToShow - 1);
			return isSameMonth(start, end)
				? format(start, "MMMM yyyy")
				: `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
		}
		return format(currentDate, "MMMM yyyy");
	}, [currentDate, view]);

	return (
		<GlassPanel
			tint={palette.primary}
			hoverEffect={false}
			bevel={false}
			specular={false}
			overflow="visible"
			className={cn(
				"flex flex-col has-data-[slot=month-view]:flex-1",
				compact ? "text-sm" : "",
				className,
			)}
			style={
				{
					"--event-height": `${EventHeight}px`,
					"--event-gap": `${EventGap}px`,
					"--week-cells-height": compact
						? `${WeekCellsHeight}px`
						: `clamp(${Math.max(88, WeekCellsHeight - 24)}px, 11vh, ${WeekCellsHeight}px)`,
				} as React.CSSProperties
			}
		>
			<CalendarDndProvider onEventUpdate={handleEventUpdate}>
				<CalendarToolbar
					compact={compact}
					view={view}
					viewTitle={viewTitle}
					palette={palette}
					primaryTextColor={primaryTextColor}
					onToday={handleToday}
					onPrev={handlePrevious}
					onNext={handleNext}
					onViewChange={setView}
					onNewEvent={() => {
						setSelectedEvent(null);
						setIsEventDialogOpen(true);
					}}
				/>

				<div className="relative z-10 flex flex-1 flex-col px-2 pb-2 sm:px-5 sm:pb-5">
					{view === "month" && (
						<MonthView
							currentDate={currentDate}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					)}

					{view === "week" && (
						<WeekView
							currentDate={currentDate}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					)}

					{view === "day" && (
						<DayView
							currentDate={currentDate}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					)}

					{view === "agenda" && (
						<AgendaView
							currentDate={currentDate}
							events={events}
							onEventSelect={handleEventSelect}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
						/>
					)}
				</div>

				<EventDialog
					event={selectedEvent}
					isOpen={isEventDialogOpen}
					inline
					onClose={() => {
						setIsEventDialogOpen(false);
						setSelectedEvent(null);
					}}
					onSave={handleEventSave}
					onDelete={handleEventDelete}
					projectOptions={projectOptions}
					taskOptions={taskOptions}
				/>
			</CalendarDndProvider>
		</GlassPanel>
	);
}
