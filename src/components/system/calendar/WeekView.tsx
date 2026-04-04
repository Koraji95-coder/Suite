import React from "react";
import type { CalendarEvent } from "./calendarindex";
import { useWeekViewData } from "./useWeekViewData";
import styles from "./WeekView.module.css";
import { WeekViewAllDaySection } from "./WeekViewAllDaySection";
import { WeekViewHeader } from "./WeekViewHeader";
import { WeekViewTimeGrid } from "./WeekViewTimeGrid";

interface WeekViewProps {
	currentDate: Date;
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
	events: CalendarEvent[];
	onEventSelect: (event: CalendarEvent) => void;
	onEventCreate: (startTime: Date) => void;
}

export function WeekView({
	currentDate,
	selectedDate,
	onDateSelect,
	events,
	onEventSelect,
	onEventCreate,
}: WeekViewProps) {
	const {
		allDayEvents,
		currentTimePosition,
		currentTimeVisible,
		days,
		hours,
		processedDayEvents,
		weekStart,
	} = useWeekViewData({ currentDate, events });

	const handleEventClick = (
		event: CalendarEvent,
		clickEvent: React.MouseEvent,
	) => {
		clickEvent.stopPropagation();
		onEventSelect(event);
	};

	return (
		<div data-slot="week-view" className={styles.root}>
			<WeekViewHeader
				days={days}
				selectedDate={selectedDate}
				onDateSelect={onDateSelect}
			/>

			<WeekViewAllDaySection
				days={days}
				allDayEvents={allDayEvents}
				selectedDate={selectedDate}
				weekStart={weekStart}
				onEventSelect={handleEventClick}
			/>

			<WeekViewTimeGrid
				days={days}
				hours={hours}
				selectedDate={selectedDate}
				processedDayEvents={processedDayEvents}
				currentTimeVisible={currentTimeVisible}
				currentTimePosition={currentTimePosition}
				onEventSelect={handleEventClick}
				onEventCreate={onEventCreate}
			/>
		</div>
	);
}
