import { isBefore, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
import type { ColorScheme } from "@/lib/palette";
import { hexToRgba } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { type CalendarEvent, EventItem } from "./calendarindex";

interface WeekViewAllDaySectionProps {
	days: Date[];
	allDayEvents: CalendarEvent[];
	selectedDate?: Date | null;
	weekStart: Date;
	palette: ColorScheme;
	onEventSelect: (event: CalendarEvent, eventClick: MouseEvent) => void;
}

export function WeekViewAllDaySection({
	days,
	allDayEvents,
	selectedDate,
	weekStart,
	palette,
	onEventSelect,
}: WeekViewAllDaySectionProps) {
	if (allDayEvents.length === 0) return null;

	return (
		<div
			style={{
				borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
				backgroundColor: hexToRgba(palette.surface, 0.3),
			}}
		>
			<div className="grid grid-cols-8">
				<div
					className="relative flex items-end justify-center"
					style={{
						borderRight: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
					}}
				>
					<span
						className="mb-1 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none"
						style={{ color: hexToRgba(palette.text, 0.35) }}
					>
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
							className="relative p-1 last:border-r-0"
							style={{
								borderRight: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
								...(isSelected
									? {
											backgroundColor: hexToRgba(palette.primary, 0.06),
											boxShadow: `inset 0 0 0 1px ${hexToRgba(palette.primary, 0.25)}`,
										}
									: {}),
							}}
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
