import { type CSSProperties } from "react";
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
import styles from "./EventCalendar.module.css";
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
		<div
			className={cn(styles.root, compact && styles.compact, className)}
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
					onToday={handleToday}
					onPrev={handlePrevious}
					onNext={handleNext}
					onViewChange={setView}
					onNewEvent={openNewEventDialog}
				/>

				<div className={styles.content}>
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
					onClose={closeEventDialog}
					onSave={handleEventSave}
					onDelete={handleEventDelete}
					projectOptions={projectOptions}
					taskOptions={taskOptions}
				/>
			</CalendarDndProvider>
		</div>
	);
}
