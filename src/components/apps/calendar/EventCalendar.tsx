import { type CSSProperties, useMemo } from "react";
import { GlassPanel } from "@/components/apps/ui/GlassPanel";
import { getContrastText, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import {
	AgendaView,
	CalendarDndProvider,
	type CalendarEvent,
	type CalendarView,
	DayView,
	EventDialog,
	EventGap,
	EventHeight,
	MonthView,
	WeekCellsHeight,
	WeekView,
} from "./calendarindex";
import { EventCalendarToolbar } from "./EventCalendarToolbar";
import { useEventCalendarState } from "./useEventCalendarState";

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
	selectedDate?: Date;
	onSelectedDateChange?: (date: Date) => void;
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
	const primaryTextColor = useMemo(
		() => getContrastText(palette.primary),
		[palette.primary],
	);
	const {
		closeEventDialog,
		currentDate,
		handleDateSelect,
		handleEventCreate,
		handleEventDelete,
		handleEventSave,
		handleEventSelect,
		handleEventUpdate,
		handleNext,
		handlePrevious,
		handleToday,
		isEventDialogOpen,
		openNewEventDialog,
		selectedDate,
		selectedEvent,
		setView,
		view,
		viewTitle,
	} = useEventCalendarState({
		initialView,
		controlledSelectedDate,
		onSelectedDateChange,
		onEventAdd,
		onEventUpdate,
		onEventDelete,
	});

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
				} as CSSProperties
			}
		>
			<CalendarDndProvider onEventUpdate={handleEventUpdate}>
				<EventCalendarToolbar
					compact={compact}
					view={view}
					viewTitle={viewTitle}
					palette={palette}
					primaryTextColor={primaryTextColor}
					onToday={handleToday}
					onPrev={handlePrevious}
					onNext={handleNext}
					onViewChange={setView}
					onNewEvent={openNewEventDialog}
				/>

				<div className="relative z-10 flex flex-1 flex-col px-2 pb-2 sm:px-5 sm:pb-5">
					{view === "month" ? (
						<MonthView
							currentDate={currentDate}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					) : null}

					{view === "week" ? (
						<WeekView
							currentDate={currentDate}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					) : null}

					{view === "day" ? (
						<DayView
							currentDate={currentDate}
							events={events}
							onEventSelect={handleEventSelect}
							onEventCreate={handleEventCreate}
						/>
					) : null}

					{view === "agenda" ? (
						<AgendaView
							currentDate={currentDate}
							events={events}
							onEventSelect={handleEventSelect}
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
						/>
					) : null}
				</div>

				<EventDialog
					event={selectedEvent}
					isOpen={isEventDialogOpen}
					inline
					onClose={closeEventDialog}
					onSave={handleEventSave}
					onDelete={handleEventDelete}
					projectOptions={projectOptions}
					taskOptions={taskOptions}
				/>
			</CalendarDndProvider>
		</GlassPanel>
	);
}
