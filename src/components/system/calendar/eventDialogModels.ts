import type { CalendarEvent, EventColor } from "./calendarindex";

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
