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
		<div
			data-slot="month-view"
			className="flex min-w-0 flex-1 flex-col overflow-x-auto"
		>
			{/* Weekday header */}
			<div className="grid grid-cols-7 border-b border-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
				{weekdays.map((day) => (
					<div
						key={day}
						className="py-2 text-center text-sm font-medium [color:var(--text-muted)]"
					>
						{day}
					</div>
				))}
			</div>

			{/* Week rows */}
			<div className="grid flex-1 auto-rows-fr">
				{weeks.map((week, weekIndex) => (
					<div
						key={`week-${weekIndex}`}
						className="grid grid-cols-7 [&:last-child>*]:border-b-0"
					>
						{week.map((day, dayIndex) => {
							const dayEvents = getEventsForDay(events, day);
							const spanningEvents = getSpanningEventsForDay(events, day);
							const isCurrentMonth = isSameMonth(day, currentDate);
							const isSelected = !!selectedDate && isSameDay(day, selectedDate);
							const today = isToday(day);

							const cellId = `month-cell-${day.toISOString()}`;
							const allDayEvents = [...spanningEvents, ...dayEvents];
							const allEvents = getAllEventsForDay(events, day);

							const isReferenceCell = weekIndex === 0 && dayIndex === 0;
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
										"group border-r border-b last:border-r-0",
										"border-[color-mix(in_srgb,var(--primary)_8%,transparent)]",
										isSelected &&
											"[background:color-mix(in_srgb,var(--primary)_6%,transparent)] [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]",
										!isSelected &&
											today &&
											"[background:color-mix(in_srgb,var(--primary)_3%,transparent)]",
										!isSelected &&
											!today &&
											!isCurrentMonth &&
											"[background:color-mix(in_srgb,var(--surface)_30%,transparent)]",
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
										{/* Day number chip */}
										<button
											type="button"
											className={cn(
												"mt-1.5 inline-flex size-7 items-center justify-center rounded-full text-sm leading-none transition-all",
												today &&
													"font-bold [background:var(--primary)] [color:var(--primary-contrast)] [box-shadow:0_0_8px_color-mix(in_srgb,var(--primary)_40%,transparent)]",
												!today &&
													isSelected &&
													"font-semibold [background:color-mix(in_srgb,var(--primary)_15%,transparent)] [color:var(--primary)] [box-shadow:0_0_0_1px_color-mix(in_srgb,var(--primary)_35%,transparent)]",
												!today &&
													!isSelected &&
													!isCurrentMonth &&
													"[color:var(--text-muted)]",
												!today &&
													!isSelected &&
													isCurrentMonth &&
													"[color:var(--text)]",
											)}
											onClick={(e) => {
												e.stopPropagation();
												onDateSelect?.(day);
											}}
											aria-label={`Select ${format(day, "PPP")}`}
										>
											{format(day, "d")}
										</button>

										{/* Events container */}
										<div
											ref={isReferenceCell ? contentRef : null}
											className="min-h-[calc((var(--event-height)+var(--event-gap))*2)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
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
															className="aria-hidden:hidden"
															aria-hidden={isHidden ? "true" : undefined}
														>
															<EventItem
																onClick={(e) => handleEventClick(event, e)}
																event={event}
																view="month"
																isFirstDay={isFirstDay}
																isLastDay={isLastDay}
															>
																<div className="invisible" aria-hidden={true}>
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
														className="aria-hidden:hidden"
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

											{/* "+N more" popover */}
											{hasMore && (
												<Popover modal>
													<PopoverTrigger asChild>
														<button
															className="focus-visible:border-ring focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 mt-(--event-gap) flex h-(--event-height) w-full items-center overflow-hidden px-2 text-left text-[10px] leading-tight backdrop-blur-md transition outline-none select-none focus-visible:ring-[3px] sm:px-2.5 sm:text-xs"
															onClick={(e) => e.stopPropagation()}
														>
															<span>
																+ {remainingCount}{" "}
																<span className="max-sm:sr-only">more</span>
															</span>
														</button>
													</PopoverTrigger>
													<PopoverContent
														align="center"
														className="max-w-52 p-3"
														style={
															{
																"--event-height": `${EventHeight}px`,
															} as React.CSSProperties
														}
													>
														<div className="space-y-2">
															<div className="text-sm font-medium">
																{format(day, "EEE d")}
															</div>
															<div className="space-y-1">
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
