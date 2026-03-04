import { format } from "date-fns";
import type { CalendarEvent, EventColor } from "./calendarindex";
import { EndHour, StartHour } from "./hooks/calendarconstants";

export interface EventDialogProps {
	event: CalendarEvent | null;
	isOpen: boolean;
	onClose: () => void;
	onSave: (event: CalendarEvent) => void;
	onDelete: (eventId: string) => void;
	projectOptions?: Array<{ id: string; name: string }>;
	taskOptions?: Array<{ id: string; name: string; project_id: string | null }>;
	inline?: boolean;
}

export const EVENT_DIALOG_COLOR_OPTIONS: Array<{
	value: EventColor;
	label: string;
}> = [
	{
		value: "sky",
		label: "Sky",
	},
	{
		value: "amber",
		label: "Amber",
	},
	{
		value: "violet",
		label: "Violet",
	},
	{
		value: "rose",
		label: "Rose",
	},
	{
		value: "emerald",
		label: "Emerald",
	},
	{
		value: "orange",
		label: "Orange",
	},
];

export const EVENT_DIALOG_TIME_OPTIONS = (() => {
	const options: Array<{ value: string; label: string }> = [];
	for (let hour = StartHour; hour <= EndHour; hour++) {
		for (let minute = 0; minute < 60; minute += 15) {
			const formattedHour = hour.toString().padStart(2, "0");
			const formattedMinute = minute.toString().padStart(2, "0");
			const value = `${formattedHour}:${formattedMinute}`;
			const date = new Date(2000, 0, 1, hour, minute);
			options.push({ value, label: format(date, "h:mm a") });
		}
	}
	return options;
})();
