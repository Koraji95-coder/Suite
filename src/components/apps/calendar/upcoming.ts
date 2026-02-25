/* =========================================================
   src/components/apps/calendar/upcoming.ts
   Shared helpers for "upcoming in next 7 days (start-time only)"
   ========================================================= */
import { addDays } from "date-fns";
import type { CalendarEvent } from "./calendarindex";

export function isUpcomingInNext7Days(e: CalendarEvent, now: Date) {
	const start = e.start.getTime();
	const windowStart = now.getTime();
	const windowEnd = addDays(now, 7).getTime();
	return start > windowStart && start <= windowEnd;
}

export function getUpcomingNext7Days(
	events: CalendarEvent[],
	now = new Date(),
) {
	return events
		.filter((e) => isUpcomingInNext7Days(e, now))
		.sort((a, b) => a.start.getTime() - b.start.getTime());
}
