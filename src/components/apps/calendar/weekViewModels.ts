import type { CalendarEvent } from "./calendarindex";

export interface PositionedWeekEvent {
	event: CalendarEvent;
	top: number;
	height: number;
	left: number;
	width: number;
	zIndex: number;
	columnIndex: number;
}
