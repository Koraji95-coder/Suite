import { format, getHours, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
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
	onEventSelect,
	onEventCreate,
}: WeekViewTimeGridProps) {
	return (
		<div className="grid flex-1 grid-cols-8 overflow-hidden">
			{/* Hour labels column */}
			<div className="grid auto-cols-fr border-r border-[color-mix(in_srgb,var(--primary)_8%,transparent)]">
				{hours.map((hour, index) => (
					<div
						key={hour.toString()}
						className="relative flex min-h-(--week-cells-height) items-start justify-center border-b
							border-[color-mix(in_srgb,var(--primary)_6%,transparent)]"
					>
						{index > 0 && (
							<span className="-translate-y-1/2 mt-0 inline-flex min-h-7 w-14 items-center justify-center rounded-md px-2.5 text-center text-xs leading-none [color:var(--text-muted)]">
								{format(hour, "h a")}
							</span>
						)}
					</div>
				))}
			</div>

			{/* Day columns */}
			{days.map((day, dayIndex) => {
				const isSelected = !!selectedDate && isSameDay(day, selectedDate);
				const today = isToday(day);

				return (
					<div
						key={day.toString()}
						className={cn(
							"relative grid auto-cols-fr border-r last:border-r-0",
							"border-[color-mix(in_srgb,var(--primary)_8%,transparent)]",
							isSelected && "[background:color-mix(in_srgb,var(--primary)_5%,transparent)]",
							today && !isSelected && "[background:color-mix(in_srgb,var(--primary)_2%,transparent)]",
						)}
						data-today={today || undefined}
						data-selected={isSelected || undefined}
					>
						{/* Positioned events */}
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
										onClick={(eventClick) =>
											onEventSelect(positionedEvent.event, eventClick)
										}
										showTime
										height={positionedEvent.height}
									/>
								</div>
							</div>
						))}

						{/* Current time indicator */}
						{currentTimeVisible && today && (
							<div
								className="pointer-events-none absolute right-0 left-0 z-20"
								style={{ top: `${currentTimePosition}%` }}
							>
								<div className="relative flex items-center">
									<div className="absolute -left-1 h-2 w-2 rounded-full [background:var(--primary)]" />
									<div className="h-0.5 w-full [background:var(--primary)] opacity-85" />
								</div>
							</div>
						)}

						{/* Hour grid cells */}
						{hours.map((hour) => {
							const hourValue = getHours(hour);
							return (
								<div
									key={hour.toString()}
									className="relative min-h-(--week-cells-height) border-b last:border-b-0
										border-[color-mix(in_srgb,var(--primary)_6%,transparent)]"
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
													quarter === 1 && "top-[calc(var(--week-cells-height)/4)]",
													quarter === 2 && "top-[calc(var(--week-cells-height)/4*2)]",
													quarter === 3 && "top-[calc(var(--week-cells-height)/4*3)]",
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
