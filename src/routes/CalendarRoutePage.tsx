// src/routes/app/CalendarRoutePage.tsx

import { useState } from "react";
import CalendarPage from "@/components/apps/calendar/CalendarPage";
import { CalendarRightRail } from "@/components/apps/calendar/CalendarRightRail";
import type { CalendarEvent } from "@/components/apps/calendar/calendarindex";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Panel } from "@/components/primitives/Panel";
// Primitives
import { Text } from "@/components/primitives/Text";
import styles from "./CalendarRoutePage.module.css";

export default function CalendarRoutePage() {
	const [selectedDate, setSelectedDate] = useState<Date>(new Date());
	const [events, setEvents] = useState<CalendarEvent[]>([]);

	useRegisterPageHeader({
		title: "Calendar",
		subtitle: "Scheduling, commitments, and upcoming delivery timing.",
	});

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				{/* Main Content */}
				<div className={styles.mainColumn}>
					<PageContextBand
						mode="compact"
						eyebrow="Scheduling surface"
						summary={
							<Text size="sm" color="muted" block>
								Plan commitments, review what is coming next, and keep delivery
								timing calm across the week.
							</Text>
						}
					>
						<div className={styles.contextMeta}>
							<div className={styles.contextCard}>
								<span className={styles.contextLabel}>Visible events</span>
								<strong>{events.length}</strong>
							</div>
						</div>
					</PageContextBand>

					{/* Calendar Panel */}
					<Panel
						variant="support"
						padding="sm"
						className={styles.calendarPanel}
					>
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
		</PageFrame>
	);
}
