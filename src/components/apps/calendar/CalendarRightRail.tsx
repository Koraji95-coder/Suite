/* =========================================================
   src/components/apps/calendar/CalendarRightRail.tsx
   Behavior:
   - If upcoming is empty => show ONLY the "no upcoming" card
   - Else => show Selected day card + Upcoming list card
   ========================================================= */

import { endOfDay, format, isSameDay, startOfDay } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import styles from "./CalendarRightRail.module.css";
import type { CalendarEvent } from "./calendarindex";
import { UpcomingBanner } from "./UpcomingBanner";
import { getUpcomingNext7Days } from "./upcoming";

type Props = {
	selectedDate: Date;
	events: CalendarEvent[];
	onSelectEvent: (event: CalendarEvent) => void;
	onNewEvent: () => void;
	onSelectDate: (date: Date) => void;
	className?: string;
	maxUpcomingToShow?: number;
};

function overlapsDay(e: CalendarEvent, day: Date) {
	const dayStart = startOfDay(day).getTime();
	const dayEnd = endOfDay(day).getTime();
	const s = e.start.getTime();
	const en = e.end.getTime();
	return s <= dayEnd && en >= dayStart;
}

function timeLabel(e: CalendarEvent) {
	if (e.allDay) return "All day";
	return `${format(e.start, "p")} – ${format(e.end, "p")}`;
}

export function CalendarRightRail({
	selectedDate,
	events,
	onSelectEvent,
	onNewEvent,
	onSelectDate,
	className,
	maxUpcomingToShow = 5,
}: Props) {
	const agenda = useMemo(() => {
		return events
			.filter((e) => overlapsDay(e, selectedDate))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}, [events, selectedDate]);

	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const hasUpcoming = upcoming.length > 0;
	const upcomingPreview = upcoming.slice(0, maxUpcomingToShow);

	if (!hasUpcoming) {
		return (
			<div className={cn(styles.root, className)}>
				<div className={styles.stickyTop}>
					<UpcomingBanner
						events={events}
						className={styles.upcomingBannerCentered}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className={cn(styles.root, className)}>
			<div className={styles.scrollContainer}>
				<div className={styles.stack}>
					{/* Selected day */}
					<div className={styles.selectedDayCard}>
						<div className={styles.cardHeader}>
							<div className={styles.cardHeaderText}>
								<div className={styles.selectedDayTitle}>
									{format(selectedDate, "EEEE")}
								</div>
								<div className={styles.selectedDaySubtitle}>
									{format(selectedDate, "MMMM d, yyyy")}
								</div>
							</div>

							<button
								type="button"
								onClick={onNewEvent}
								className={styles.newButton}
							>
								<PlusIcon size={14} aria-hidden="true" />
								New
							</button>
						</div>

						<div className={styles.divider} />

						<div className={styles.agendaSection}>
							<div className={styles.sectionLabel}>Agenda</div>

							{agenda.length === 0 ? (
								<div className={styles.emptyAgendaCard}>
									<div className={styles.emptyAgendaText}>
										No events for this day.
									</div>
								</div>
							) : (
								<div className={styles.agendaList}>
									{agenda.slice(0, 6).map((e) => (
										<button
											key={e.id || `${e.title}-${e.start.toISOString()}`}
											type="button"
											onClick={() => onSelectEvent(e)}
											className={styles.listButton}
										>
											<div className={styles.listButtonTitle}>
												{e.title || "Untitled event"}
											</div>
											<div className={styles.listButtonSubtitle}>
												{timeLabel(e)}
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Upcoming list */}
					<div className={styles.upcomingCard}>
						<div className={styles.cardSubHeader}>
							<div className={styles.sectionLabel}>Upcoming</div>
							<div className={styles.cardMetaText}>Next 7 days</div>
						</div>

						<div className={styles.upcomingList}>
							{upcomingPreview.map((e) => (
								<button
									key={e.id || `${e.title}-${e.start.toISOString()}`}
									type="button"
									onClick={() => {
										onSelectDate(e.start);
										onSelectEvent(e);
									}}
									className={styles.listButton}
								>
									<div className={styles.listButtonRow}>
										<div className={styles.listButtonRowText}>
											<div className={styles.listButtonTitle}>
												{e.title || "Untitled event"}
											</div>
											<div className={styles.listButtonSubtitleCompact}>
												{format(e.start, "EEE, MMM d")} ·{" "}
												{e.allDay ? "All day" : format(e.start, "p")}
											</div>
										</div>

										<div className={styles.dayPill} style={{ minWidth: 40 }}>
											{isSameDay(e.start, selectedDate)
												? "Sel"
												: format(e.start, "d")}
										</div>
									</div>
								</button>
							))}

							{upcoming.length > upcomingPreview.length && (
								<div className={styles.moreText}>
									+{upcoming.length - upcomingPreview.length} more
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
