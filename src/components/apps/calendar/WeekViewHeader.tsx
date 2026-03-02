import { format, isSameDay, isToday } from "date-fns";
import type { ColorScheme } from "@/lib/palette";
import { hexToRgba } from "@/lib/palette";

interface WeekViewHeaderProps {
	days: Date[];
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
	palette: ColorScheme;
}

export function WeekViewHeader({
	days,
	selectedDate,
	onDateSelect,
	palette,
}: WeekViewHeaderProps) {
	return (
		<div
			className="sticky top-0 z-30 grid grid-cols-8 backdrop-blur-md"
			style={{
				borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				backgroundColor: hexToRgba(palette.surface, 0.6),
			}}
		>
			<div
				className="flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none sm:text-sm"
				style={{ color: hexToRgba(palette.text, 0.4) }}
			>
				<span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
			</div>

			{days.map((day) => {
				const isSelected = !!selectedDate && isSameDay(day, selectedDate);
				return (
					<button
						key={day.toString()}
						type="button"
						onClick={() => onDateSelect?.(day)}
						className="flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none transition-all sm:text-sm"
						style={{
							...(isToday(day)
								? {
										color: palette.primary,
										fontWeight: 600,
										backgroundColor: hexToRgba(palette.primary, 0.08),
									}
								: isSelected
									? {
											color: hexToRgba(palette.text, 0.9),
											fontWeight: 600,
											backgroundColor: hexToRgba(palette.primary, 0.1),
										}
									: {
											color: hexToRgba(palette.text, 0.5),
										}),
						}}
						data-today={isToday(day) || undefined}
						data-selected={isSelected || undefined}
					>
						<span
							className="inline-flex items-center justify-center gap-1 leading-none sm:hidden"
							aria-hidden="true"
						>
							{format(day, "E")[0]} {format(day, "d")}
						</span>
						<span className="max-sm:hidden leading-none">
							{format(day, "EEE dd")}
						</span>
					</button>
				);
			})}
		</div>
	);
}
