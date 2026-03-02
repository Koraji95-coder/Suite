import { format, getHours, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
import type { ColorScheme } from "@/lib/palette";
import { hexToRgba } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./calendarindex";
import { DraggableEvent, DroppableCell } from "./calendarindex";
import type { PositionedWeekEvent } from "./weekViewModels";

interface WeekViewTimeGridProps {
	days: Date[];
	hours: Date[];
	selectedDate?: Date | null;
	processedDayEvents: PositionedWeekEvent[][];
	currentTimeVisible: boolean;
	currentTimePosition: number;
	palette: ColorScheme;
	onEventSelect: (event: CalendarEvent, eventClick: MouseEvent) => void;
	onEventCreate: (startTime: Date) => void;
}

export function WeekViewTimeGrid({
	days,
	hours,
	selectedDate,
	processedDayEvents,
	currentTimeVisible,
	currentTimePosition,
	palette,
	onEventSelect,
	onEventCreate,
}: WeekViewTimeGridProps) {
	return (
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
						{index > 0 ? (
							<span
								className="-translate-y-1/2 mt-0 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none"
								style={{ color: hexToRgba(palette.text, 0.35) }}
							>
								{format(hour, "h a")}
							</span>
						) : null}
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
								onClick={(event) => event.stopPropagation()}
							>
								<div className="size-full">
									<DraggableEvent
										event={positionedEvent.event}
										view="week"
										onClick={(eventClick) =>
											onEventSelect(positionedEvent.event, eventClick)
										}
										showTime
										height={positionedEvent.height}
									/>
								</div>
							</div>
						))}

						{currentTimeVisible && isToday(day) ? (
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
						) : null}

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
	);
}
