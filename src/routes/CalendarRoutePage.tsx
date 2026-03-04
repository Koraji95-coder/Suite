// src/routes/app/CalendarRoutePage.tsx

import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";
import CalendarPage from "@/components/apps/calendar/CalendarPage";
import { CalendarRightRail } from "@/components/apps/calendar/CalendarRightRail";
import type { CalendarEvent } from "@/components/apps/calendar/calendarindex";
import { Panel } from "@/components/primitives/Panel";
// Primitives
import { Heading, Text } from "@/components/primitives/Text";
import styles from "./CalendarRoutePage.module.css";

export default function CalendarRoutePage() {
	const [selectedDate, setSelectedDate] = useState<Date>(new Date());
	const [events, setEvents] = useState<CalendarEvent[]>([]);

	return (
		<div className={styles.root}>
			{/* Main Content */}
			<div className={styles.mainColumn}>
				{/* Header */}
				<div className={styles.header}>
					<div className={styles.iconBox}>
						<CalendarIcon size={20} />
					</div>
					<div>
						<Heading level={1}>Calendar</Heading>
						<Text size="sm" color="muted">
							Central calendar for events, schedules, and reminders.
						</Text>
					</div>
				</div>

				{/* Calendar Panel */}
				<Panel variant="default" padding="sm" className={styles.calendarPanel}>
					<div className={styles.calendarViewport}>
						<CalendarPage
							selectedDate={selectedDate}
							onSelectedDateChange={setSelectedDate}
							onEventsChange={setEvents}
						/>
					</div>
				</Panel>
			</div>

			{/* Right Rail */}
			<aside className={styles.rightRail}>
				<CalendarRightRail
					selectedDate={selectedDate}
					events={events}
					onNewEvent={() => setSelectedDate((d) => new Date(d))}
					onSelectEvent={(event) => setSelectedDate(event.start)}
					onSelectDate={setSelectedDate}
				/>
			</aside>
		</div>
	);
}
