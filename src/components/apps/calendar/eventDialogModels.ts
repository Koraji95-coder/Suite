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
	bgClass: string;
	borderClass: string;
}> = [
	{
		value: "sky",
		label: "Sky",
		bgClass: "bg-sky-400 data-[state=checked]:bg-sky-400",
		borderClass: "border-sky-400 data-[state=checked]:border-sky-400",
	},
	{
		value: "amber",
		label: "Amber",
		bgClass: "bg-amber-400 data-[state=checked]:bg-amber-400",
		borderClass: "border-amber-400 data-[state=checked]:border-amber-400",
	},
	{
		value: "violet",
		label: "Violet",
		bgClass: "bg-violet-400 data-[state=checked]:bg-violet-400",
		borderClass: "border-violet-400 data-[state=checked]:border-violet-400",
	},
	{
		value: "rose",
		label: "Rose",
		bgClass: "bg-rose-400 data-[state=checked]:bg-rose-400",
		borderClass: "border-rose-400 data-[state=checked]:border-rose-400",
	},
	{
		value: "emerald",
		label: "Emerald",
		bgClass: "bg-emerald-400 data-[state=checked]:bg-emerald-400",
		borderClass: "border-emerald-400 data-[state=checked]:border-emerald-400",
	},
	{
		value: "orange",
		label: "Orange",
		bgClass: "bg-orange-400 data-[state=checked]:bg-orange-400",
		borderClass: "border-orange-400 data-[state=checked]:border-orange-400",
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
