import {
	addDays,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	isToday,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import React, { useEffect, useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/apps/ui/Popover";
import { cn } from "@/lib/utils";
import {
	type CalendarEvent,
	DraggableEvent,
	DroppableCell,
	EventGap,
	EventHeight,
	EventItem,
	getAllEventsForDay,
	getEventsForDay,
	getSpanningEventsForDay,
	sortEvents,
	useEventVisibility,
} from "./calendarindex";
import { DefaultStartHour } from "./hooks/calendarconstants";
import styles from "./MonthView.module.css";

interface MonthViewProps {
	currentDate: Date;
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
	events: CalendarEvent[];
	onEventSelect: (event: CalendarEvent) => void;
	onEventCreate: (startTime: Date) => void;
}

export function MonthView({
	currentDate,
	selectedDate,
	onDateSelect,
	events,
	onEventSelect,
	onEventCreate,
}: MonthViewProps) {
	const days = useMemo(() => {
		const monthStart = startOfMonth(currentDate);
		const monthEnd = endOfMonth(monthStart);
		const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
		const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
		return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
	}, [currentDate]);

	const weekdays = useMemo(() => {
		return Array.from({ length: 7 }).map((_, i) => {
			const date = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), i);
			return format(date, "EEE");
		});
	}, []);

	const weeks = useMemo(() => {
		const result: Date[][] = [];
		let week: Date[] = [];
		for (let i = 0; i < days.length; i++) {
			week.push(days[i]);
			if (week.length === 7 || i === days.length - 1) {
				result.push(week);
				week = [];
			}
		}
		return result;
	}, [days]);

	const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
		e.stopPropagation();
		onEventSelect(event);
	};

	const [isMounted, setIsMounted] = useState(false);
	const { contentRef, getVisibleEventCount } = useEventVisibility({
		eventHeight: EventHeight,
		eventGap: EventGap,
	});

	useEffect(() => setIsMounted(true), []);

	return (
		<div data-slot="month-view" className={styles.root}>
			<div className={styles.weekdayHeader}>
				{weekdays.map((day) => (
					<div key={day} className={styles.weekdayCell}>
						{day}
					</div>
				))}
			</div>

			<div className={styles.weeksGrid}>
				{weeks.map((week, weekIndex) => (
					<div key={`week-${weekIndex}`} className={styles.weekRow}>
						{week.map((day) => {
							const dayEvents = getEventsForDay(events, day);
							const spanningEvents = getSpanningEventsForDay(events, day);
							const isCurrentMonth = isSameMonth(day, currentDate);
							const isSelected = !!selectedDate && isSameDay(day, selectedDate);
							const today = isToday(day);

							const cellId = `month-cell-${day.toISOString()}`;
							const allDayEvents = [...spanningEvents, ...dayEvents];
							const allEvents = getAllEventsForDay(events, day);

							const isReferenceCell = weekIndex === 0 && day.getDay() === 0;
							const visibleCount = isMounted
								? getVisibleEventCount(allDayEvents.length)
								: undefined;
							const hasMore =
								visibleCount !== undefined &&
								allDayEvents.length > visibleCount;
							const remainingCount =
								visibleCount !== undefined && hasMore
									? allDayEvents.length - visibleCount
									: 0;

							return (
								<div
									key={day.toString()}
									className={cn(
										styles.dayCell,
										isSelected && styles.dayCellSelected,
										!isSelected && today && styles.dayCellToday,
										!isSelected &&
											!today &&
											!isCurrentMonth &&
											styles.dayCellOutside,
									)}
									data-today={today || undefined}
									data-selected={isSelected || undefined}
									data-outside-cell={!isCurrentMonth || undefined}
								>
									<DroppableCell
										id={cellId}
										date={day}
										onClick={() => onDateSelect?.(day)}
										onDoubleClick={() => {
											const startTime = new Date(day);
											startTime.setHours(DefaultStartHour, 0, 0, 0);
											onEventCreate(startTime);
										}}
									>
										<button
											type="button"
											className={cn(
												styles.dayChip,
												today && styles.dayChipToday,
												!today && isSelected && styles.dayChipSelected,
												!today &&
													!isSelected &&
													!isCurrentMonth &&
													styles.dayChipOutside,
												!today &&
													!isSelected &&
													isCurrentMonth &&
													styles.dayChipCurrentMonth,
											)}
											onClick={(e) => {
												e.stopPropagation();
												onDateSelect?.(day);
											}}
											aria-label={`Select ${format(day, "PPP")}`}
										>
											{format(day, "d")}
										</button>

										<div
											ref={isReferenceCell ? contentRef : null}
											className={styles.eventsContainer}
										>
											{sortEvents(allDayEvents).map((event, index) => {
												const eventStart = new Date(event.start);
												const eventEnd = new Date(event.end);
												const isFirstDay = isSameDay(day, eventStart);
												const isLastDay = isSameDay(day, eventEnd);
												const isHidden =
													visibleCount !== undefined && index >= visibleCount;

												if (visibleCount === undefined) return null;

												if (!isFirstDay) {
													return (
														<div
															key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}
															className={styles.eventVisibilityItem}
															aria-hidden={isHidden ? "true" : undefined}
														>
															<EventItem
																onClick={(e) => handleEventClick(event, e)}
																event={event}
																view="month"
																isFirstDay={isFirstDay}
																isLastDay={isLastDay}
															>
																<div className={styles.invisibleContinueText}>
																	{!event.allDay && (
																		<span>
																			{format(
																				new Date(event.start),
																				"h:mm",
																			)}{" "}
																		</span>
																	)}
																	{event.title}
																</div>
															</EventItem>
														</div>
													);
												}

												return (
													<div
														key={event.id}
														className={styles.eventVisibilityItem}
														aria-hidden={isHidden ? "true" : undefined}
													>
														<DraggableEvent
															event={event}
															view="month"
															onClick={(e) => handleEventClick(event, e)}
															isFirstDay={isFirstDay}
															isLastDay={isLastDay}
														/>
													</div>
												);
											})}

											{hasMore && (
												<Popover modal>
													<PopoverTrigger asChild>
														<button
															className={styles.moreButton}
															onClick={(e) => e.stopPropagation()}
														>
															<span className={styles.moreButtonText}>
																+ {remainingCount}{" "}
																<span className={styles.moreWordDesktop}>
																	more
																</span>
															</span>
														</button>
													</PopoverTrigger>
													<PopoverContent
														align="center"
														className={styles.popoverContent}
														style={
															{
																"--event-height": `${EventHeight}px`,
															} as React.CSSProperties
														}
													>
														<div className={styles.popoverStack}>
															<div className={styles.popoverHeading}>
																{format(day, "EEE d")}
															</div>
															<div className={styles.popoverList}>
																{sortEvents(allEvents).map((event) => {
																	const eventStart = new Date(event.start);
																	const eventEnd = new Date(event.end);
																	const isFirstDay = isSameDay(day, eventStart);
																	const isLastDay = isSameDay(day, eventEnd);

																	return (
																		<EventItem
																			key={event.id}
																			onClick={(e) =>
																				handleEventClick(event, e)
																			}
																			event={event}
																			view="month"
																			isFirstDay={isFirstDay}
																			isLastDay={isLastDay}
																		/>
																	);
																})}
															</div>
														</div>
													</PopoverContent>
												</Popover>
											)}
										</div>
									</DroppableCell>
								</div>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
