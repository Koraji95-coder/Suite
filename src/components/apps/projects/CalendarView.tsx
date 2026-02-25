import { useMemo } from "react";
import type { EventColor } from "../calendar/calendarindex";
import { EventCalendar } from "../calendar/EventCalendar";
import type { CalendarEvent as ProjectCalendarEvent } from "./projectmanagertypes";

interface CalendarViewProps {
	currentMonth: Date;
	onMonthChange: (month: Date) => void;
	selectedDate: string | null;
	onDateSelect: (date: string | null) => void;
	calendarEvents: ProjectCalendarEvent[];
}

export function CalendarView({
	currentMonth: _currentMonth,
	onMonthChange: _onMonthChange,
	selectedDate: _selectedDate,
	onDateSelect: _onDateSelect,
	calendarEvents,
}: CalendarViewProps) {
	const mappedEvents = useMemo(
		() =>
			calendarEvents
				.filter((event) => Boolean(event.due_date))
				.map((event) => {
					const dateString = event.due_date as string;
					const start = new Date(`${dateString}T00:00:00`);
					const end = new Date(`${dateString}T23:59:59`);

					return {
						id: event.id,
						title: event.title,
						start,
						end,
						allDay: true,
						description: event.type,
						projectId: event.project_id ?? undefined,
						taskId: event.task_id ?? undefined,
						color: (event.color as EventColor) ?? undefined,
						source: "project" as const,
					};
				}),
		[calendarEvents],
	);

	return <EventCalendar events={mappedEvents} initialView="month" />;
}
