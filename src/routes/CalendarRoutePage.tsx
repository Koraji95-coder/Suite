import { useState } from "react";
import CalendarPage from "@/components/apps/calendar/CalendarPage";
import { CalendarRightRail } from "@/components/apps/calendar/CalendarRightRail";
import type { CalendarEvent } from "@/components/apps/calendar/calendarindex";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function CalendarRoutePage() {
	const [selectedDate, setSelectedDate] = useState<Date>(new Date());
	const [events, setEvents] = useState<CalendarEvent[]>([]);

	return (
		<PageFrame
			title="Calendar"
			subtitle="Central calendar experience for events, schedules, and reminders."
			rightRail={
				<CalendarRightRail
					selectedDate={selectedDate}
					events={events}
					onNewEvent={() => setSelectedDate((d) => new Date(d))}
					onSelectEvent={(event) => setSelectedDate(event.start)}
					onSelectDate={setSelectedDate}
				/>
			}
		>
			<div
				className="rounded-2xl"
				style={{
					padding: "clamp(4px, 0.6vw, 10px)",
					minHeight: "clamp(620px, 80vh, 1040px)",
				}}
			>
				<CalendarPage
					selectedDate={selectedDate}
					onSelectedDateChange={setSelectedDate}
					onEventsChange={setEvents}
				/>
			</div>
		</PageFrame>
	);
}
