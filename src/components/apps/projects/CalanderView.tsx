import { X } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { hexToRgba, useTheme } from "@/lib/palette";
import { getEventChipStyle } from "../calendar/urgencyUtils";
import { CalendarEvent } from "./projectmanagertypes";
import { formatDateOnly } from "./projectmanagerutils";

interface CalendarViewProps {
	currentMonth: Date;
	onMonthChange: (month: Date) => void;
	selectedDate: string | null;
	onDateSelect: (date: string | null) => void;
	calendarEvents: CalendarEvent[];
}

export function CalendarView({
	currentMonth,
	onMonthChange,
	selectedDate,
	onDateSelect,
	calendarEvents,
}: CalendarViewProps) {
	const { palette } = useTheme();
	const year = currentMonth.getFullYear();
	const month = currentMonth.getMonth();
	const firstDay = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const days: (number | null)[] = [];
	for (let i = 0; i < firstDay; i++) days.push(null);
	for (let i = 1; i <= daysInMonth; i++) days.push(i);

	const toLocalDateOnly = (y: number, m: number, d: number) => {
		const mm = String(m + 1).padStart(2, "0");
		const dd = String(d).padStart(2, "0");
		return `${y}-${mm}-${dd}`;
	};

	const isSameLocalDay = (y: number, m: number, d: number) => {
		const now = new Date();
		return (
			now.getFullYear() === y && now.getMonth() === m && now.getDate() === d
		);
	};

	const getEventsForDate = (day: number) => {
		const dateStr = toLocalDateOnly(year, month, day);
		return calendarEvents.filter((e) => e.due_date === dateStr);
	};

	const handlePrevMonth = () => {
		onMonthChange(new Date(year, month - 1, 1));
	};

	const handleNextMonth = () => {
		onMonthChange(new Date(year, month + 1, 1));
	};

	const handleToday = () => {
		onMonthChange(new Date());
	};

	return (
		<GlassPanel
			tint={palette.primary}
			hoverEffect={false}
			bevel
			specular
			className="p-6"
		>
			<div className="flex items-center justify-between mb-4">
				<h3
					className="text-2xl font-bold"
					style={{ color: hexToRgba(palette.text, 0.9) }}
				>
					{currentMonth.toLocaleDateString("en-US", {
						month: "long",
						year: "numeric",
					})}
				</h3>
				<div className="flex space-x-2">
					<button
						onClick={handlePrevMonth}
						className="px-3 py-1 rounded text-xs font-semibold transition-all"
						style={{
							background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.06)} 0%, ${hexToRgba(palette.surface, 0.25)} 100%)`,
							border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
							color: palette.primary,
						}}
					>
						Prev
					</button>
					<button
						onClick={handleToday}
						className="px-3 py-1 rounded text-xs font-semibold transition-all"
						style={{
							background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.06)} 0%, ${hexToRgba(palette.surface, 0.25)} 100%)`,
							border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
							color: palette.primary,
						}}
					>
						Today
					</button>
					<button
						onClick={handleNextMonth}
						className="px-3 py-1 rounded text-xs font-semibold transition-all"
						style={{
							background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.06)} 0%, ${hexToRgba(palette.surface, 0.25)} 100%)`,
							border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
							color: palette.primary,
						}}
					>
						Next
					</button>
				</div>
			</div>
			<div className="grid grid-cols-7 gap-2">
				{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
					<div
						key={day}
						className="text-center font-semibold p-2"
						style={{ color: hexToRgba(palette.text, 0.4) }}
					>
						{day}
					</div>
				))}
				{days.map((day, index) => {
					if (day === null) {
						return <div key={index} className="p-2 min-h-[80px]"></div>;
					}
					const events = getEventsForDate(day);
					const dateStr = toLocalDateOnly(year, month, day);
					const isToday = isSameLocalDay(year, month, day);
					const isSelected = selectedDate === dateStr && !isToday;

					return (
						<div
							key={index}
							onClick={() => onDateSelect(dateStr)}
							className="p-2 min-h-[80px] rounded-lg cursor-pointer transition-all"
							style={{
								border: isToday
									? `1px solid ${hexToRgba(palette.primary, 0.5)}`
									: isSelected
										? `1px solid ${hexToRgba(palette.primary, 0.35)}`
										: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
								backgroundColor: isToday
									? hexToRgba(palette.primary, 0.12)
									: isSelected
										? hexToRgba(palette.primary, 0.06)
										: hexToRgba(palette.surface, 0.2),
								...(isToday
									? {
											boxShadow: `0 0 12px ${hexToRgba(palette.primary, 0.2)}`,
										}
									: {}),
							}}
						>
							<div
								className="font-semibold mb-1"
								style={{
									color: isToday
										? palette.primary
										: hexToRgba(palette.text, 0.9),
								}}
							>
								{day}
							</div>
							<div className="space-y-1">
								{events.map((event) => (
									<div
										key={event.id}
										className="text-xs p-1 rounded truncate"
										style={getEventChipStyle(event.due_date)}
										title={event.title}
									>
										{event.title}
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>

			{selectedDate && (
				<div
					className="mt-4 p-4 rounded-lg"
					style={{
						backgroundColor: hexToRgba(palette.surface, 0.3),
						border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
					}}
				>
					<div className="flex items-center justify-between mb-2">
						<span
							className="font-semibold"
							style={{ color: hexToRgba(palette.text, 0.8) }}
						>
							Selected: {formatDateOnly(selectedDate)}
						</span>
						<button
							onClick={() => onDateSelect(null)}
							className="p-1 rounded transition-colors"
							style={{ color: palette.primary }}
							title="Clear selection"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
					<div className="space-y-1">
						{calendarEvents.filter((e) => e.due_date === selectedDate)
							.length === 0 ? (
							<div
								className="text-sm"
								style={{ color: hexToRgba(palette.text, 0.35) }}
							>
								No events this day.
							</div>
						) : (
							calendarEvents
								.filter((e) => e.due_date === selectedDate)
								.map((e) => (
									<div
										key={e.id}
										className="text-sm"
										style={{ color: hexToRgba(palette.text, 0.9) }}
									>
										- {e.title}
									</div>
								))
						)}
					</div>
				</div>
			)}
		</GlassPanel>
	);
}
