import {
	addHours,
	areIntervalsOverlapping,
	differenceInMinutes,
	eachDayOfInterval,
	eachHourOfInterval,
	endOfWeek,
	getHours,
	getMinutes,
	isSameDay,
	startOfDay,
	startOfWeek,
} from "date-fns";
import { useMemo } from "react";
import {
	type CalendarEvent,
	isMultiDayEvent,
	useCurrentTimeIndicator,
	WeekCellsHeight,
} from "./calendarindex";
import { EndHour, StartHour } from "./hooks/calendarconstants";
import type { PositionedWeekEvent } from "./weekViewModels";

interface UseWeekViewDataParams {
	currentDate: Date;
	events: CalendarEvent[];
}

export function useWeekViewData({
	currentDate,
	events,
}: UseWeekViewDataParams) {
	const days = useMemo(() => {
		const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
		const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
		return eachDayOfInterval({ start: weekStart, end: weekEnd });
	}, [currentDate]);

	const weekStart = useMemo(
		() => startOfWeek(currentDate, { weekStartsOn: 0 }),
		[currentDate],
	);

	const hours = useMemo(() => {
		const dayStart = startOfDay(currentDate);
		return eachHourOfInterval({
			start: addHours(dayStart, StartHour),
			end: addHours(dayStart, EndHour - 1),
		});
	}, [currentDate]);

	const allDayEvents = useMemo(() => {
		return events
			.filter((event) => event.allDay || isMultiDayEvent(event))
			.filter((event) => {
				const eventStart = new Date(event.start);
				const eventEnd = new Date(event.end);
				return days.some(
					(day) =>
						isSameDay(day, eventStart) ||
						isSameDay(day, eventEnd) ||
						(day > eventStart && day < eventEnd),
				);
			});
	}, [events, days]);

	const processedDayEvents = useMemo(() => {
		return days.map((day) => {
			const dayEvents = events.filter((event) => {
				if (event.allDay || isMultiDayEvent(event)) return false;

				const eventStart = new Date(event.start);
				const eventEnd = new Date(event.end);

				return (
					isSameDay(day, eventStart) ||
					isSameDay(day, eventEnd) ||
					(eventStart < day && eventEnd > day)
				);
			});

			const sortedEvents = [...dayEvents].sort((a, b) => {
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

			const positionedEvents: PositionedWeekEvent[] = [];
			const dayStart = startOfDay(day);
			const columns: { event: CalendarEvent; end: Date }[][] = [];

			sortedEvents.forEach((event) => {
				const eventStart = new Date(event.start);
				const eventEnd = new Date(event.end);

				const adjustedStart = isSameDay(day, eventStart)
					? eventStart
					: dayStart;
				const adjustedEnd = isSameDay(day, eventEnd)
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
					const column = columns[columnIndex] || [];
					if (column.length === 0) {
						columns[columnIndex] = column;
						placed = true;
					} else {
						const overlaps = column.some((entry) =>
							areIntervalsOverlapping(
								{ start: adjustedStart, end: adjustedEnd },
								{
									start: new Date(entry.event.start),
									end: new Date(entry.event.end),
								},
							),
						);
						if (!overlaps) {
							placed = true;
						} else {
							columnIndex += 1;
						}
					}
				}

				const currentColumn = columns[columnIndex] || [];
				columns[columnIndex] = currentColumn;
				currentColumn.push({ event, end: adjustedEnd });

				positionedEvents.push({
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

			return positionedEvents.map((item) => ({
				...item,
				width,
				left: item.columnIndex * (width + gap),
			}));
		});
	}, [days, events]);

	const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
		currentDate,
		"week",
	);

	return {
		allDayEvents,
		currentTimePosition,
		currentTimeVisible,
		days,
		hours,
		processedDayEvents,
		weekStart,
	};
}
