import { format, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface WeekViewHeaderProps {
	days: Date[];
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
}

export function WeekViewHeader({
	days,
	selectedDate,
	onDateSelect,
}: WeekViewHeaderProps) {
	return (
		<div
			className="sticky top-0 z-30 grid grid-cols-8 border-b backdrop-blur-md
				border-[color-mix(in_srgb,var(--primary)_12%,transparent)]
				[background:color-mix(in_srgb,var(--surface)_60%,transparent)]"
		>
			{/* Timezone label */}
			<div className="flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none [color:var(--text-muted)] sm:text-sm">
				<span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
			</div>

			{days.map((day) => {
				const today = isToday(day);
				const isSelected = !!selectedDate && isSameDay(day, selectedDate);

				return (
					<button
						key={day.toString()}
						type="button"
						onClick={() => onDateSelect?.(day)}
						className={cn(
							"flex min-h-11 items-center justify-center px-1 text-center text-xs leading-none transition-all sm:text-sm",
							today
								? "font-semibold [color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_8%,transparent)]"
								: isSelected
									? "font-semibold [color:var(--text)] [background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
									: "[color:var(--text-muted)]",
						)}
						data-today={today || undefined}
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
