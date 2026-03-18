import { format, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import styles from "./WeekViewHeader.module.css";

interface WeekViewHeaderProps {
	days: Date[];
	selectedDate?: Date | null;
	onDateSelect?: (date: Date) => void;
}

function getTimezoneBadgeLabel(now: Date): string {
	const offsetLabel = format(now, "O");
	const timeZoneName = Intl.DateTimeFormat(undefined, {
		timeZoneName: "short",
	})
		.formatToParts(now)
		.find((part) => part.type === "timeZoneName")
		?.value;
	return timeZoneName
		? `Local (${timeZoneName} • ${offsetLabel})`
		: `Local (${offsetLabel})`;
}

export function WeekViewHeader({
	days,
	selectedDate,
	onDateSelect,
}: WeekViewHeaderProps) {
	const timezoneLabel = getTimezoneBadgeLabel(new Date());

	return (
		<div className={styles.root}>
			{/* Timezone label */}
			<div className={styles.timezoneCell}>
				<span className={styles.timezoneDesktop}>{timezoneLabel}</span>
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
