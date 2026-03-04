import { format, getHours, isSameDay, isToday } from "date-fns";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./calendarindex";
import { DraggableEvent, DroppableCell } from "./calendarindex";
import styles from "./WeekViewTimeGrid.module.css";
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
		<div className={styles.root}>
			<div className={styles.hourColumn}>
				{hours.map((hour, index) => (
					<div key={hour.toString()} className={styles.hourCell}>
						{index > 0 && (
							<span className={styles.hourLabel}>{format(hour, "h a")}</span>
						)}
					</div>
				))}
			</div>

			{days.map((day, dayIndex) => {
				const isSelected = !!selectedDate && isSameDay(day, selectedDate);
				const today = isToday(day);

				return (
					<div
						key={day.toString()}
						className={cn(
							styles.dayColumn,
							isSelected && styles.dayColumnSelected,
							today && !isSelected && styles.dayColumnToday,
						)}
						data-today={today || undefined}
						data-selected={isSelected || undefined}
					>
						{(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
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
								onClick={(e) => e.stopPropagation()}
							>
								<div className={styles.positionedEventInner}>
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

						{currentTimeVisible && today && (
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
								<div key={hour.toString()} className={styles.gridHourCell}>
									{[0, 1, 2, 3].map((quarter) => {
										const quarterHourTime = hourValue + quarter * 0.25;
										return (
											<DroppableCell
												key={`${hour.toString()}-${quarter}`}
												id={`week-cell-${day.toISOString()}-${quarterHourTime}`}
												date={day}
												time={quarterHourTime}
												className={cn(
													styles.quarterCell,
													quarter === 0 && styles.quarter0,
													quarter === 1 && styles.quarter1,
													quarter === 2 && styles.quarter2,
													quarter === 3 && styles.quarter3,
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
