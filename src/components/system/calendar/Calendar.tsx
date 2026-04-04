import {
	addDays,
	addMonths,
	endOfMonth,
	endOfWeek,
	format,
	isBefore,
	isSameDay,
	isSameMonth,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./Calendar.module.css";

interface CalendarProps {
	mode?: "single";
	selected?: Date;
	defaultMonth?: Date;
	onSelect?: (date: Date | undefined) => void;
	disabled?: { before?: Date };
	className?: string;
}

export function Calendar({
	selected,
	defaultMonth,
	onSelect,
	disabled,
	className,
}: CalendarProps) {
	const [currentMonth, setCurrentMonth] = React.useState(
		defaultMonth || selected || new Date(),
	);

	const monthStart = startOfMonth(currentMonth);
	const monthEnd = endOfMonth(currentMonth);
	const calStart = startOfWeek(monthStart);
	const calEnd = endOfWeek(monthEnd);

	const days: Date[] = [];
	let day = calStart;
	while (day <= calEnd) {
		days.push(day);
		day = addDays(day, 1);
	}

	const weeks: Date[][] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push(days.slice(i, i + 7));
	}

	const isDisabled = (d: Date) => {
		if (disabled?.before && isBefore(d, disabled.before)) return true;
		return false;
	};

	return (
		<div className={cn(styles.root, className)}>
			<div className={styles.header}>
				<button
					type="button"
					onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
					className={styles.navButton}
				>
					<ChevronLeft className={styles.navIcon} />
				</button>
				<span className={styles.monthLabel}>
					{format(currentMonth, "MMMM yyyy")}
				</span>
				<button
					type="button"
					onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
					className={styles.navButton}
				>
					<ChevronRight className={styles.navIcon} />
				</button>
			</div>
			<table className={styles.table}>
				<thead>
					<tr>
						{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
							<th key={d} className={styles.weekdayCell}>
								{d}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((week, wi) => (
						<tr key={wi}>
							{week.map((d, di) => {
								const inMonth = isSameMonth(d, currentMonth);
								const sel = selected && isSameDay(d, selected);
								const dis = isDisabled(d);
								const today = isSameDay(d, new Date());
								return (
									<td key={di} className={styles.dayCell}>
										<button
											type="button"
											disabled={dis}
											onClick={() => !dis && onSelect?.(d)}
											className={cn(
												styles.dayButton,
												!inMonth && styles.dayOutsideMonth,
												inMonth && !sel && styles.dayInMonth,
												sel && styles.daySelected,
												today && !sel && styles.dayToday,
												dis && styles.dayDisabled,
											)}
										>
											{format(d, "d")}
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
