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
import styles from "./DayView.module.css";
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

	const allDayEvents = useMemo(() => {
		return dayEvents.filter((event) => event.allDay || isMultiDayEvent(event));
	}, [dayEvents]);

	const timeEvents = useMemo(() => {
		return dayEvents.filter(
			(event) => !event.allDay && !isMultiDayEvent(event),
		);
	}, [dayEvents]);

	const positionedEvents = useMemo(() => {
		const result: PositionedEvent[] = [];
		const dayStart = startOfDay(currentDate);

		const sortedEvents = [...timeEvents].sort((a, b) => {
			const aStart = new Date(a.start);
			const bStart = new Date(b.start);
			const aEnd = new Date(a.end);
			const bEnd = new Date(b.end);

			if (aStart < bStart) return -1;
			if (aStart > bStart) return 1;

			const aDuration = differenceInMinutes(aEnd, aStart);
			const bDuration = differenceInMinutes(bEnd, bStart);
			return bDuration - aDuration;
		});

		const columns: { event: CalendarEvent; end: Date }[][] = [];

		sortedEvents.forEach((event) => {
			const eventStart = new Date(event.start);
			const eventEnd = new Date(event.end);

			const adjustedStart = isSameDay(currentDate, eventStart)
				? eventStart
				: dayStart;
			const adjustedEnd = isSameDay(currentDate, eventEnd)
				? eventEnd
				: addHours(dayStart, 24);

			const startHour =
				getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
			const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
			const top = (startHour - StartHour) * WeekCellsHeight;
			const height = (endHour - startHour) * WeekCellsHeight;

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

			const currentColumn = columns[columnIndex] || [];
			columns[columnIndex] = currentColumn;
			currentColumn.push({ event, end: adjustedEnd });

			result.push({
				event,
				top,
				height,
				left: 0,
				width: 1,
				zIndex: 10 + columnIndex,
				columnIndex,
			});
		});

		const columnCount = Math.max(columns.length, 1);
		const gap = columnCount > 1 ? Math.min(0.02, 0.4 / columnCount) : 0;
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
		<div data-slot="day-view" className={styles.root}>
			{showAllDaySection && (
				<div className={styles.allDaySection}>
					<div className={styles.allDayGrid}>
						<div className={styles.allDayLabelCol}>
							<span className={styles.allDayLabel}>All day</span>
						</div>
						<div className={styles.allDayEventsCol}>
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
										<div className={styles.allDayEventTitle}>{event.title}</div>
									</EventItem>
								);
							})}
						</div>
					</div>
				</div>
			)}

			<div className={styles.mainGrid}>
				<div className={styles.hourRail}>
					{hours.map((hour, index) => (
						<div key={hour.toString()} className={styles.hourRow}>
							{index > 0 && (
								<span className={styles.hourLabel}>{format(hour, "h a")}</span>
							)}
						</div>
					))}
				</div>

				<div className={styles.timeline}>
					{positionedEvents.map((positionedEvent) => (
						<div
							key={positionedEvent.event.id}
							className={styles.positionedEvent}
							style={{
								top: `${positionedEvent.top}px`,
								height: `${positionedEvent.height}px`,
								left: `${positionedEvent.left * 100}%`,
								width: `${positionedEvent.width * 100}%`,
								zIndex: positionedEvent.zIndex,
							}}
						>
							<div className={styles.positionedEventInner}>
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

					{currentTimeVisible && (
						<div
							className={styles.currentTimeLineWrap}
							style={{ top: `${currentTimePosition}%` }}
						>
							<div className={styles.currentTimeLineInner}>
								<div className={styles.currentTimeDot} />
								<div className={styles.currentTimeLine} />
							</div>
						</div>
					)}

					{hours.map((hour) => {
						const hourValue = getHours(hour);
						return (
							<div key={hour.toString()} className={styles.timeGridRow}>
								{[0, 1, 2, 3].map((quarter) => {
									const quarterHourTime = hourValue + quarter * 0.25;
									return (
										<DroppableCell
											key={`${hour.toString()}-${quarter}`}
											id={`day-cell-${currentDate.toISOString()}-${quarterHourTime}`}
											date={currentDate}
											time={quarterHourTime}
											className={cn(
												styles.quarterCell,
												quarter === 0 && styles.quarter0,
												quarter === 1 && styles.quarter1,
												quarter === 2 && styles.quarter2,
												quarter === 3 && styles.quarter3,
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
