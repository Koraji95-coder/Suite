import { isBefore, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { type CalendarEvent, EventItem } from "./calendarindex";

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
		<div className="border-b border-[color-mix(in_srgb,var(--primary)_10%,transparent)] [background:color-mix(in_srgb,var(--surface)_30%,transparent)]">
			<div className="grid grid-cols-8">
				{/* Label */}
				<div className="relative flex items-end justify-center border-r border-[color-mix(in_srgb,var(--primary)_8%,transparent)]">
					<span className="mb-1 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none [color:var(--text-muted)]">
						All day
					</span>
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
								"relative border-r p-1 last:border-r-0",
								"border-[color-mix(in_srgb,var(--primary)_8%,transparent)]",
								isSelected &&
									"[background:color-mix(in_srgb,var(--primary)_6%,transparent)] [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]",
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
												"w-full truncate text-center",
												!shouldShowTitle && "invisible",
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
