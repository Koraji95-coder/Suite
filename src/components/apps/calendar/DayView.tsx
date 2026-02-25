import {
	addHours,
	areIntervalsOverlapping,
	differenceInMinutes,
	eachHourOfInterval,
	format,
	getHours,
	getMinutes,
	isSameDay,
	startOfDay,
} from "date-fns";
import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	type CalendarEvent,
	DraggableEvent,
	DroppableCell,
	EventItem,
	isMultiDayEvent,
	useCurrentTimeIndicator,
	WeekCellsHeight,
} from "./calendarindex";
import { EndHour, StartHour } from "./hooks/calendarconstants";

interface DayViewProps {
	currentDate: Date;
	events: CalendarEvent[];
	onEventSelect: (event: CalendarEvent) => void;
	onEventCreate: (startTime: Date) => void;
}

interface PositionedEvent {
	event: CalendarEvent;
	top: number;
	height: number;
	left: number;
	width: number;
	zIndex: number;
	columnIndex: number;
}

export function DayView({
	currentDate,
	events,
	onEventSelect,
	onEventCreate,
}: DayViewProps) {
	const hours = useMemo(() => {
		const dayStart = startOfDay(currentDate);
		return eachHourOfInterval({
			start: addHours(dayStart, StartHour),
			end: addHours(dayStart, EndHour - 1),
		});
	}, [currentDate]);

	const dayEvents = useMemo(() => {
		return events
			.filter((event) => {
				const eventStart = new Date(event.start);
				const eventEnd = new Date(event.end);
				return (
					isSameDay(currentDate, eventStart) ||
					isSameDay(currentDate, eventEnd) ||
					(currentDate > eventStart && currentDate < eventEnd)
				);
			})
			.sort(
				(a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
			);
	}, [currentDate, events]);

	// Filter all-day events
	const allDayEvents = useMemo(() => {
		return dayEvents.filter((event) => {
			// Include explicitly marked all-day events or multi-day events
			return event.allDay || isMultiDayEvent(event);
		});
	}, [dayEvents]);

	// Get only single-day time-based events
	const timeEvents = useMemo(() => {
		return dayEvents.filter((event) => {
			// Exclude all-day events and multi-day events
			return !event.allDay && !isMultiDayEvent(event);
		});
	}, [dayEvents]);

		// Process events to calculate positions
		const positionedEvents = useMemo(() => {
			const result: PositionedEvent[] = [];
			const dayStart = startOfDay(currentDate);

		// Sort events by start time and duration
		const sortedEvents = [...timeEvents].sort((a, b) => {
			const aStart = new Date(a.start);
			const bStart = new Date(b.start);
			const aEnd = new Date(a.end);
			const bEnd = new Date(b.end);

			// First sort by start time
			if (aStart < bStart) return -1;
			if (aStart > bStart) return 1;

			// If start times are equal, sort by duration (longer events first)
			const aDuration = differenceInMinutes(aEnd, aStart);
			const bDuration = differenceInMinutes(bEnd, bStart);
			return bDuration - aDuration;
		});

		// Track columns for overlapping events
		const columns: { event: CalendarEvent; end: Date }[][] = [];

		sortedEvents.forEach((event) => {
			const eventStart = new Date(event.start);
			const eventEnd = new Date(event.end);

			// Adjust start and end times if they're outside this day
			const adjustedStart = isSameDay(currentDate, eventStart)
				? eventStart
				: dayStart;
			const adjustedEnd = isSameDay(currentDate, eventEnd)
				? eventEnd
				: addHours(dayStart, 24);

			// Calculate top position and height
			const startHour =
				getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
			const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
			const top = (startHour - StartHour) * WeekCellsHeight;
			const height = (endHour - startHour) * WeekCellsHeight;

			// Find a column for this event
			let columnIndex = 0;
			let placed = false;

			while (!placed) {
				const col = columns[columnIndex] || [];
				if (col.length === 0) {
					columns[columnIndex] = col;
					placed = true;
				} else {
					const overlaps = col.some((c) =>
						areIntervalsOverlapping(
							{ start: adjustedStart, end: adjustedEnd },
							{ start: new Date(c.event.start), end: new Date(c.event.end) },
						),
					);
					if (!overlaps) {
						placed = true;
					} else {
						columnIndex++;
					}
				}
			}

			// Ensure column is initialized before pushing
			const currentColumn = columns[columnIndex] || [];
			columns[columnIndex] = currentColumn;
			currentColumn.push({ event, end: adjustedEnd });

				result.push({
					event,
					top,
					height,
					left: 0,
					width: 1,
					zIndex: 10 + columnIndex, // Higher columns get higher z-index
					columnIndex,
				});
			});

			const columnCount = Math.max(columns.length, 1);
			const gap =
				columnCount > 1 ? Math.min(0.02, 0.4 / columnCount) : 0;
			const width = (1 - gap * (columnCount - 1)) / columnCount;

			return result.map((item) => ({
				...item,
				width,
				left: item.columnIndex * (width + gap),
			}));
		}, [currentDate, timeEvents]);

	const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
		e.stopPropagation();
		onEventSelect(event);
	};

	const showAllDaySection = allDayEvents.length > 0;
	const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
		currentDate,
		"day",
	);

	return (
		<div data-slot="day-view" className="contents">
			{showAllDaySection && (
				<div className="border-border/70 border-t bg-background/35">
					<div className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4.5rem_1fr]">
						<div className="relative flex items-end justify-center">
							<span className="mb-1 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none text-white/60">
								All day
							</span>
						</div>
						<div className="border-border/70 relative border-r p-1 last:border-r-0">
							{allDayEvents.map((event) => {
								const eventStart = new Date(event.start);
								const eventEnd = new Date(event.end);
								const isFirstDay = isSameDay(currentDate, eventStart);
								const isLastDay = isSameDay(currentDate, eventEnd);

								return (
									<EventItem
										key={`spanning-${event.id}`}
										onClick={(e) => handleEventClick(event, e)}
										event={event}
										view="month"
										isFirstDay={isFirstDay}
										isLastDay={isLastDay}
									>
										<div className="w-full text-center truncate">
											{event.title}
										</div>
									</EventItem>
								);
							})}
						</div>
					</div>
				</div>
			)}

			<div className="border-border/70 grid flex-1 grid-cols-[3.5rem_1fr] overflow-hidden border-t bg-background/20 sm:grid-cols-[4.5rem_1fr]">
				<div>
					{hours.map((hour, index) => (
						<div
							key={hour.toString()}
							className="border-border/70 relative flex h-[var(--week-cells-height)] items-start justify-center border-b last:border-b-0"
						>
							{index > 0 && (
								<span className="bg-background -translate-y-1/2 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none text-white/60">
									{format(hour, "h a")}
								</span>
							)}
						</div>
					))}
				</div>

				<div className="relative">
					{/* Positioned events */}
					{positionedEvents.map((positionedEvent) => (
						<div
							key={positionedEvent.event.id}
							className="absolute z-10 px-0.5"
							style={{
								top: `${positionedEvent.top}px`,
								height: `${positionedEvent.height}px`,
								left: `${positionedEvent.left * 100}%`,
								width: `${positionedEvent.width * 100}%`,
								zIndex: positionedEvent.zIndex,
							}}
						>
							<div className="size-full">
								<DraggableEvent
									event={positionedEvent.event}
									view="day"
									onClick={(e) => handleEventClick(positionedEvent.event, e)}
									showTime
									height={positionedEvent.height}
								/>
							</div>
						</div>
					))}

					{/* Current time indicator */}
					{currentTimeVisible && (
						<div
							className="pointer-events-none absolute right-0 left-0 z-20"
							style={{ top: `${currentTimePosition}%` }}
						>
							<div className="relative flex items-center">
								<div className="bg-primary absolute -left-1 h-2 w-2 rounded-full opacity-90"></div>
								<div className="bg-primary h-[2px] w-full opacity-85"></div>
							</div>
						</div>
					)}

					{/* Time grid */}
					{hours.map((hour) => {
						const hourValue = getHours(hour);
						return (
							<div
								key={hour.toString()}
								className="border-border/70 relative h-[var(--week-cells-height)] border-b last:border-b-0"
							>
								{/* Quarter-hour intervals */}
								{[0, 1, 2, 3].map((quarter) => {
									const quarterHourTime = hourValue + quarter * 0.25;
									return (
										<DroppableCell
											key={`${hour.toString()}-${quarter}`}
											id={`day-cell-${currentDate.toISOString()}-${quarterHourTime}`}
											date={currentDate}
											time={quarterHourTime}
											className={cn(
												"absolute h-[calc(var(--week-cells-height)/4)] w-full",
												quarter === 0 && "top-0",
												quarter === 1 &&
													"top-[calc(var(--week-cells-height)/4)]",
												quarter === 2 &&
													"top-[calc(var(--week-cells-height)/4*2)]",
												quarter === 3 &&
													"top-[calc(var(--week-cells-height)/4*3)]",
											)}
											onClick={() => {
												const startTime = new Date(currentDate);
												startTime.setHours(hourValue);
												startTime.setMinutes(quarter * 15);
												onEventCreate(startTime);
											}}
										/>
									);
								})}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
