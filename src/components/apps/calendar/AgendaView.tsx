import { addDays, format, isSameDay, isToday } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import styles from "./AgendaView.module.css";
import {
	AgendaDaysToShow,
	CalendarEvent,
	EventItem,
	getAgendaEventsForDay,
} from "./calendarindex";

interface AgendaViewProps {
	currentDate: Date;
	events: CalendarEvent[];
	onEventSelect: (event: CalendarEvent) => void;
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
}

export function AgendaView({
	currentDate,
	events,
	onEventSelect,
	selectedDate,
	onDateSelect,
}: AgendaViewProps) {
	const days = useMemo(() => {
		return Array.from({ length: AgendaDaysToShow }, (_, i) =>
			addDays(new Date(currentDate), i),
		);
	}, [currentDate]);

	const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
		e.stopPropagation();
		onEventSelect(event);
	};

	const hasEvents = days.some(
		(day) => getAgendaEventsForDay(events, day).length > 0,
	);

	return (
		<div className={styles.root}>
			{!hasEvents ? (
				<div className={styles.emptyState}>
					<CalendarDays className={styles.emptyIcon} />
					<h3 className={styles.emptyTitle}>No events found</h3>
					<p className={styles.emptyDescription}>
						There are no events scheduled for this time period.
					</p>
				</div>
			) : (
				days.map((day) => {
					const dayEvents = getAgendaEventsForDay(events, day);
					if (dayEvents.length === 0) return null;

					const isSelected = !!selectedDate && isSameDay(day, selectedDate);

					return (
						<div
							key={day.toString()}
							className={cn(
								styles.dayCard,
								isSelected && styles.dayCardSelected,
							)}
							onClick={() => onDateSelect?.(day)}
						>
							<span
								className={styles.dayTag}
								data-today={isToday(day) || undefined}
							>
								{format(day, "d MMM, EEEE")}
								{isSelected ? (
									<span className={styles.selectedDot}>• selected</span>
								) : null}
							</span>

							<div className={styles.eventsStack}>
								{dayEvents.map((event) => (
									<EventItem
										key={event.id}
										event={event}
										view="agenda"
										onClick={(e) => handleEventClick(event, e)}
									/>
								))}
							</div>
						</div>
					);
				})
			)}
		</div>
	);
}
