import { isBefore } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, EventColor } from "./calendarindex";
import {
	DefaultEndHour,
	DefaultStartHour,
	EndHour,
	StartHour,
} from "./hooks/calendarconstants";

interface UseEventDialogStateParams {
	event: CalendarEvent | null;
	onSave: (event: CalendarEvent) => void;
	onDelete: (eventId: string) => void;
	taskOptions: Array<{ id: string; name: string; project_id: string | null }>;
}

export function useEventDialogState({
	event,
	onSave,
	onDelete,
	taskOptions,
}: UseEventDialogStateParams) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [startDate, setStartDate] = useState<Date>(new Date());
	const [endDate, setEndDate] = useState<Date>(new Date());
	const [startTime, setStartTime] = useState(`${DefaultStartHour}:00`);
	const [endTime, setEndTime] = useState(`${DefaultEndHour}:00`);
	const [allDay, setAllDay] = useState(false);
	const [location, setLocation] = useState("");
	const [color, setColor] = useState<EventColor>("sky");
	const [error, setError] = useState<string | null>(null);
	const [startDateOpen, setStartDateOpen] = useState(false);
	const [endDateOpen, setEndDateOpen] = useState(false);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [taskId, setTaskId] = useState<string | null>(null);

	const formatTimeForInput = useCallback((date: Date) => {
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = Math.floor(date.getMinutes() / 15) * 15;
		return `${hours}:${minutes.toString().padStart(2, "0")}`;
	}, []);

	const resetForm = useCallback(() => {
		setTitle("");
		setDescription("");
		setStartDate(new Date());
		setEndDate(new Date());
		setStartTime(`${DefaultStartHour}:00`);
		setEndTime(`${DefaultEndHour}:00`);
		setAllDay(false);
		setLocation("");
		setColor("sky");
		setProjectId(null);
		setTaskId(null);
		setError(null);
	}, []);

	useEffect(() => {
		if (event) {
			const start = new Date(event.start);
			const end = new Date(event.end);
			setTitle(event.title || "");
			setDescription(event.description || "");
			setStartDate(start);
			setEndDate(end);
			setStartTime(formatTimeForInput(start));
			setEndTime(formatTimeForInput(end));
			setAllDay(event.allDay || false);
			setLocation(event.location || "");
			setColor((event.color as EventColor) || "sky");
			setProjectId(event.projectId ?? null);
			setTaskId(event.taskId ?? null);
			setError(null);
		} else {
			resetForm();
		}
	}, [event, formatTimeForInput, resetForm]);

	const filteredTaskOptions = useMemo(
		() =>
			taskOptions.filter((task) => !projectId || task.project_id === projectId),
		[projectId, taskOptions],
	);

	const handleSave = () => {
		const start = new Date(startDate);
		const end = new Date(endDate);

		if (!allDay) {
			const [startHours = 0, startMinutes = 0] = startTime
				.split(":")
				.map(Number);
			const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);

			if (
				startHours < StartHour ||
				startHours > EndHour ||
				endHours < StartHour ||
				endHours > EndHour
			) {
				setError(
					`Selected time must be between ${StartHour}:00 and ${EndHour}:00`,
				);
				return;
			}

			start.setHours(startHours, startMinutes, 0);
			end.setHours(endHours, endMinutes, 0);
		} else {
			start.setHours(0, 0, 0, 0);
			end.setHours(23, 59, 59, 999);
		}

		if (isBefore(end, start)) {
			setError("End date cannot be before start date");
			return;
		}

		onSave({
			id: event?.id || "",
			title: title.trim() ? title : "(no title)",
			description,
			start,
			end,
			allDay,
			location,
			color,
			projectId: projectId ?? undefined,
			taskId: taskId ?? undefined,
		});
	};

	const handleDelete = () => {
		if (event?.id) onDelete(event.id);
	};

	return {
		allDay,
		color,
		description,
		endDate,
		endDateOpen,
		endTime,
		error,
		filteredTaskOptions,
		handleDelete,
		handleSave,
		location,
		projectId,
		setAllDay,
		setColor,
		setDescription,
		setEndDate,
		setEndDateOpen,
		setEndTime,
		setError,
		setLocation,
		setProjectId,
		setStartDate,
		setStartDateOpen,
		setStartTime,
		setTaskId,
		setTitle,
		startDate,
		startDateOpen,
		startTime,
		taskId,
		title,
	};
}
