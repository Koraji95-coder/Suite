import { isBefore, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { type CalendarEvent, EventItem } from "./calendarindex";
import styles from "./WeekViewAllDaySection.module.css";

interface WeekViewAllDaySectionProps {
	days: Date[];
	allDayEvents: CalendarEvent[];
	selectedDate?: Date | null;
	weekStart: Date;
	onEventSelect: (event: CalendarEvent, eventClick: MouseEvent) => void;
}

export function WeekViewAllDaySection({
	days,
	allDayEvents,
	selectedDate,
	weekStart,
	onEventSelect,
}: WeekViewAllDaySectionProps) {
	if (allDayEvents.length === 0) return null;

	return (
		<div className={styles.root}>
			<div className={styles.grid}>
				{/* Label */}
				<div className={styles.labelCell}>
					<span className={styles.labelText}>All day</span>
				</div>

				{days.map((day, dayIndex) => {
					const isSelected = !!selectedDate && isSameDay(day, selectedDate);
					const dayAllDayEvents = allDayEvents.filter((event) => {
						const eventStart = new Date(event.start);
						const eventEnd = new Date(event.end);
						return (
							isSameDay(day, eventStart) ||
							(day > eventStart && day < eventEnd) ||
							isSameDay(day, eventEnd)
						);
					});

					return (
						<div
							key={day.toString()}
							className={cn(
								styles.dayCell,
								isSelected && styles.dayCellSelected,
							)}
							data-today={isToday(day) || undefined}
							data-selected={isSelected || undefined}
						>
							{dayAllDayEvents.map((event) => {
								const eventStart = new Date(event.start);
								const eventEnd = new Date(event.end);
								const isFirstDay = isSameDay(day, eventStart);
								const isLastDay = isSameDay(day, eventEnd);
								const isFirstVisibleDay =
									dayIndex === 0 && isBefore(eventStart, weekStart);
								const shouldShowTitle = isFirstDay || isFirstVisibleDay;

								return (
									<EventItem
										key={`spanning-${event.id}`}
										onClick={(eventClick) => onEventSelect(event, eventClick)}
										event={event}
										view="month"
										isFirstDay={isFirstDay}
										isLastDay={isLastDay}
									>
										<div
											className={cn(
												styles.eventTitle,
												!shouldShowTitle && styles.eventTitleHidden,
											)}
											aria-hidden={!shouldShowTitle}
										>
											{event.title}
										</div>
									</EventItem>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
