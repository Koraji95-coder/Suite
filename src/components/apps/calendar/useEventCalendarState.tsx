import {
	addDays,
	addMonths,
	addWeeks,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	startOfWeek,
	subMonths,
	subWeeks,
} from "date-fns";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
	AgendaDaysToShow,
	addHoursToDate,
	type CalendarEvent,
	type CalendarView,
} from "./calendarindex";

interface UseEventCalendarStateParams {
	initialView: CalendarView;
	controlledSelectedDate?: Date;
	onSelectedDateChange?: (date: Date) => void;
	onEventAdd?: (event: CalendarEvent) => void;
	onEventUpdate?: (event: CalendarEvent) => void;
	onEventDelete?: (eventId: string) => void;
}

function useControllableDate(
	controlled: Date | undefined,
	onChange: ((date: Date) => void) | undefined,
	initial: Date,
) {
	const [uncontrolled, setUncontrolled] = useState<Date>(initial);
	const isControlled = controlled instanceof Date;
	const value = isControlled ? (controlled as Date) : uncontrolled;

	const setValue = (next: Date) => {
		onChange?.(next);
		if (!isControlled) setUncontrolled(next);
	};

	return [value, setValue] as const;
}

export function useEventCalendarState({
	initialView,
	controlledSelectedDate,
	onSelectedDateChange,
	onEventAdd,
	onEventUpdate,
	onEventDelete,
}: UseEventCalendarStateParams) {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [selectedDate, setSelectedDate] = useControllableDate(
		controlledSelectedDate,
		onSelectedDateChange,
		new Date(),
	);
	const [view, setView] = useState<CalendarView>(initialView);
	const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
		null,
	);

	useEffect(() => {
		if (controlledSelectedDate) setCurrentDate(controlledSelectedDate);
	}, [controlledSelectedDate]);

	const handleDateSelect = (date: Date) => {
		setSelectedDate(date);
		setCurrentDate(date);
	};

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				isEventDialogOpen ||
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				(event.target instanceof HTMLElement && event.target.isContentEditable)
			) {
				return;
			}

			switch (event.key.toLowerCase()) {
				case "a":
					setView("agenda");
					break;
				case "d":
					setView("day");
					break;
				case "m":
					setView("month");
					break;
				case "w":
					setView("week");
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isEventDialogOpen]);

	const handlePrevious = () => {
		if (view === "month") {
			const next = subMonths(currentDate, 1);
			setCurrentDate(next);
			const lastDay = endOfMonth(next).getDate();
			const day = Math.min(selectedDate.getDate(), lastDay);
			setSelectedDate(new Date(next.getFullYear(), next.getMonth(), day));
			return;
		}
		if (view === "week") {
			setCurrentDate(subWeeks(currentDate, 1));
			setSelectedDate(subWeeks(selectedDate, 1));
			return;
		}
		if (view === "day") {
			setCurrentDate(addDays(currentDate, -1));
			setSelectedDate(addDays(selectedDate, -1));
			return;
		}
		setCurrentDate(addDays(currentDate, -AgendaDaysToShow));
		setSelectedDate(addDays(selectedDate, -AgendaDaysToShow));
	};

	const handleNext = () => {
		if (view === "month") {
			const next = addMonths(currentDate, 1);
			setCurrentDate(next);
			const lastDay = endOfMonth(next).getDate();
			const day = Math.min(selectedDate.getDate(), lastDay);
			setSelectedDate(new Date(next.getFullYear(), next.getMonth(), day));
			return;
		}
		if (view === "week") {
			setCurrentDate(addWeeks(currentDate, 1));
			setSelectedDate(addWeeks(selectedDate, 1));
			return;
		}
		if (view === "day") {
			setCurrentDate(addDays(currentDate, 1));
			setSelectedDate(addDays(selectedDate, 1));
			return;
		}
		setCurrentDate(addDays(currentDate, AgendaDaysToShow));
		setSelectedDate(addDays(selectedDate, AgendaDaysToShow));
	};

	const handleToday = () => {
		const today = new Date();
		setCurrentDate(today);
		setSelectedDate(today);
	};

	const handleEventSelect = (event: CalendarEvent) => {
		setSelectedEvent(event);
		setIsEventDialogOpen(true);
	};

	const handleEventCreate = (startTime: Date) => {
		const minutes = startTime.getMinutes();
		const remainder = minutes % 15;
		if (remainder !== 0) {
			if (remainder < 7.5) startTime.setMinutes(minutes - remainder);
			else startTime.setMinutes(minutes + (15 - remainder));
			startTime.setSeconds(0);
			startTime.setMilliseconds(0);
		}

		setSelectedEvent({
			allDay: false,
			end: addHoursToDate(startTime, 1),
			id: "",
			start: startTime,
			title: "",
		});
		setIsEventDialogOpen(true);
	};

	const handleEventSave = (event: CalendarEvent) => {
		if (event.id) {
			onEventUpdate?.(event);
		} else {
			onEventAdd?.({
				...event,
				id: Math.random().toString(36).substring(2, 11),
			});
		}
		setIsEventDialogOpen(false);
		setSelectedEvent(null);
	};

	const handleEventDelete = (eventId: string) => {
		onEventDelete?.(eventId);
		setIsEventDialogOpen(false);
		setSelectedEvent(null);
	};

	const handleEventUpdate = (updatedEvent: CalendarEvent) => {
		onEventUpdate?.(updatedEvent);
	};

	const openNewEventDialog = () => {
		setSelectedEvent(null);
		setIsEventDialogOpen(true);
	};

	const closeEventDialog = () => {
		setIsEventDialogOpen(false);
		setSelectedEvent(null);
	};

	const viewTitle = useMemo<ReactNode>(() => {
		if (view === "month") return format(currentDate, "MMMM yyyy");
		if (view === "week") {
			const start = startOfWeek(currentDate, { weekStartsOn: 0 });
			const end = endOfWeek(currentDate, { weekStartsOn: 0 });
			return isSameMonth(start, end)
				? format(start, "MMMM yyyy")
				: `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
		}
		if (view === "day") {
			return (
				<>
					<span className="min-[480px]:hidden leading-none" aria-hidden="true">
						{format(currentDate, "MMM d, yyyy")}
					</span>
					<span
						className="max-[479px]:hidden md:hidden leading-tight"
						aria-hidden="true"
					>
						{format(currentDate, "MMMM d, yyyy")}
					</span>
					<span className="max-md:hidden leading-tight">
						{format(currentDate, "EEE MMMM d, yyyy")}
					</span>
				</>
			);
		}
		if (view === "agenda") {
			const start = currentDate;
			const end = addDays(currentDate, AgendaDaysToShow - 1);
			return isSameMonth(start, end)
				? format(start, "MMMM yyyy")
				: `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
		}
		return format(currentDate, "MMMM yyyy");
	}, [currentDate, view]);

	return {
		closeEventDialog,
		currentDate,
		handleDateSelect,
		handleEventCreate,
		handleEventDelete,
		handleEventSave,
		handleEventSelect,
		handleEventUpdate,
		handleNext,
		handlePrevious,
		handleToday,
		isEventDialogOpen,
		openNewEventDialog,
		selectedDate,
		selectedEvent,
		setView,
		view,
		viewTitle,
	};
}
