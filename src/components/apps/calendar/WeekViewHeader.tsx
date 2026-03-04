import { format, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import styles from "./WeekViewHeader.module.css";

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
		<div className={styles.root}>
			{/* Timezone label */}
			<div className={styles.timezoneCell}>
				<span className={styles.timezoneDesktop}>
					{format(new Date(), "O")}
				</span>
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
							styles.dayButton,
							today
								? styles.dayButtonToday
								: isSelected
									? styles.dayButtonSelected
									: styles.dayButtonDefault,
						)}
						data-today={today || undefined}
						data-selected={isSelected || undefined}
					>
						<span className={styles.dayLabelMobile} aria-hidden="true">
							{format(day, "E")[0]} {format(day, "d")}
						</span>
						<span className={styles.dayLabelDesktop}>
							{format(day, "EEE dd")}
						</span>
					</button>
				);
			})}
		</div>
	);
}
