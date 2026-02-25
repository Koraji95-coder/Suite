import {
	addHours,
	areIntervalsOverlapping,
	differenceInMinutes,
	eachDayOfInterval,
	eachHourOfInterval,
	endOfWeek,
	format,
	getHours,
	getMinutes,
	isBefore,
	isSameDay,
	isToday,
	startOfDay,
	startOfWeek,
} from "date-fns";
import React, { useMemo } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
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

interface WeekViewProps {
	currentDate: Date;
	selectedDate?: Date | null; // ✅ new
	onDateSelect?: (date: Date) => void; // ✅ new
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

export function WeekView({
	currentDate,
	selectedDate,
	onDateSelect,
	events,
	onEventSelect,
	onEventCreate,
}: WeekViewProps) {
	const { palette } = useTheme();
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

			const positionedEvents: PositionedEvent[] = [];
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
						if (!overlaps) placed = true;
						else columnIndex++;
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
			const gap =
				columnCount > 1 ? Math.min(0.02, 0.4 / columnCount) : 0;
			const width = (1 - gap * (columnCount - 1)) / columnCount;

			return positionedEvents.map((item) => ({
				...item,
				width,
				left: item.columnIndex * (width + gap),
			}));
		});
	}, [days, events]);

	const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
		e.stopPropagation();
		onEventSelect(event);
	};

	const showAllDaySection = allDayEvents.length > 0;
	const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
		currentDate,
		"week",
	);

	return (
		<div data-slot="week-view" className="flex h-full flex-col">
			<div
				className="sticky top-0 z-30 grid grid-cols-8 backdrop-blur-md"
				style={{
					borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
					backgroundColor: hexToRgba(palette.surface, 0.6),
				}}
			>
				<div
					className="flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none sm:text-sm"
					style={{ color: hexToRgba(palette.text, 0.4) }}
				>
					<span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
				</div>

				{days.map((day) => {
					const isSelected = !!selectedDate && isSameDay(day, selectedDate);

					return (
						<button
							key={day.toString()}
							type="button"
							onClick={() => onDateSelect?.(day)}
							className="flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none transition-all sm:text-sm"
							style={{
								...(isToday(day)
									? {
											color: palette.primary,
											fontWeight: 600,
											backgroundColor: hexToRgba(palette.primary, 0.08),
										}
									: isSelected
										? {
												color: hexToRgba(palette.text, 0.9),
												fontWeight: 600,
												backgroundColor: hexToRgba(palette.primary, 0.1),
											}
										: {
												color: hexToRgba(palette.text, 0.5),
											}),
							}}
							data-today={isToday(day) || undefined}
							data-selected={isSelected || undefined}
						>
							<span
								className="inline-flex items-center justify-center gap-1 leading-none sm:hidden"
								aria-hidden="true"
							>
								{format(day, "E")[0]} {format(day, "d")}
							</span>
							<span className="max-sm:hidden leading-none">
								{format(day, "EEE dd")}
							</span>
						</button>
					);
				})}
			</div>

			{showAllDaySection && (
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
												onClick={(e) => handleEventClick(event, e)}
												event={event}
												view="month"
												isFirstDay={isFirstDay}
												isLastDay={isLastDay}
											>
												<div
													className={cn(
														"w-full text-center truncate",
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
			)}

			<div className="grid flex-1 grid-cols-8 overflow-hidden">
				<div
					className="grid auto-cols-fr"
					style={{
						borderRight: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
					}}
				>
					{hours.map((hour, index) => (
						<div
							key={hour.toString()}
							className="relative flex min-h-[var(--week-cells-height)] items-start justify-center"
							style={{
								borderBottom: `1px solid ${hexToRgba(palette.primary, 0.06)}`,
							}}
						>
							{index > 0 && (
								<span
									className="-translate-y-1/2 mt-0 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none"
									style={{ color: hexToRgba(palette.text, 0.35) }}
								>
									{format(hour, "h a")}
								</span>
							)}
						</div>
					))}
				</div>

				{days.map((day, dayIndex) => {
					const isSelected = !!selectedDate && isSameDay(day, selectedDate);

					return (
						<div
							key={day.toString()}
							className="relative grid auto-cols-fr last:border-r-0"
							style={{
								borderRight: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
								...(isSelected
									? { backgroundColor: hexToRgba(palette.primary, 0.05) }
									: isToday(day)
										? { backgroundColor: hexToRgba(palette.primary, 0.02) }
										: {}),
							}}
							data-today={isToday(day) || undefined}
							data-selected={isSelected || undefined}
						>
							{(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
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
									onClick={(e) => e.stopPropagation()}
								>
									<div className="size-full">
										<DraggableEvent
											event={positionedEvent.event}
											view="week"
											onClick={(e) =>
												handleEventClick(positionedEvent.event, e)
											}
											showTime
											height={positionedEvent.height}
										/>
									</div>
								</div>
							))}

							{currentTimeVisible && isToday(day) && (
								<div
									className="pointer-events-none absolute right-0 left-0 z-20"
									style={{ top: `${currentTimePosition}%` }}
								>
									<div className="relative flex items-center">
										<div
											className="absolute -left-1 h-2 w-2 rounded-full"
											style={{ backgroundColor: palette.primary }}
										></div>
										<div
											className="h-[2px] w-full"
											style={{ backgroundColor: palette.primary }}
										></div>
									</div>
								</div>
							)}

							{hours.map((hour) => {
								const hourValue = getHours(hour);
								return (
									<div
										key={hour.toString()}
										className="relative min-h-[var(--week-cells-height)] last:border-b-0"
										style={{
											borderBottom: `1px solid ${hexToRgba(palette.primary, 0.06)}`,
										}}
									>
										{[0, 1, 2, 3].map((quarter) => {
											const quarterHourTime = hourValue + quarter * 0.25;
											return (
												<DroppableCell
													key={`${hour.toString()}-${quarter}`}
													id={`week-cell-${day.toISOString()}-${quarterHourTime}`}
													date={day}
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
														const startTime = new Date(day);
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
					);
				})}
			</div>
		</div>
	);
}
