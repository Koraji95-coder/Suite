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
			<div className={cn("hidden xl:block", className)}>
				<div className="sticky top-0">
					<UpcomingBanner events={events} className="w-full justify-center" />
				</div>
			</div>
		);
	}

	return (
		<div className={cn("hidden xl:block", className)}>
			<div className="sticky top-0 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1">
				<div className="grid gap-4">
					{/* Selected day */}
					<div className="rounded-xl border p-5 border-[color-mix(in_srgb,var(--primary)_12%,transparent)] [background:var(--surface)]">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="text-sm font-semibold leading-tight [color:var(--text)]">
									{format(selectedDate, "EEEE")}
								</div>
								<div className="mt-0.5 text-xs [color:var(--text-muted)]">
									{format(selectedDate, "MMMM d, yyyy")}
								</div>
							</div>

							<button
								type="button"
								onClick={onNewEvent}
								className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold leading-none
									[background:var(--primary)] [color:var(--primary-contrast)]
									[box-shadow:0_0_12px_color-mix(in_srgb,var(--primary)_22%,transparent)]
									hover:opacity-90"
							>
								<PlusIcon size={14} aria-hidden="true" />
								New
							</button>
						</div>

						<div className="mt-4 h-px [background:linear-gradient(90deg,transparent,color-mix(in_srgb,var(--primary)_14%,transparent),transparent)]" />

						<div className="mt-4">
							<div className="text-xs font-semibold uppercase tracking-wide [color:var(--text-muted)]">
								Agenda
							</div>

							{agenda.length === 0 ? (
								<div className="mt-3 rounded-xl border p-4 text-center [border-color:var(--border)] [background:var(--surface-2)]">
									<div className="text-sm leading-relaxed [color:var(--text-muted)]">
										No events for this day.
									</div>
								</div>
							) : (
								<div className="mt-3 grid gap-2">
									{agenda.slice(0, 6).map((e) => (
										<button
											key={e.id || `${e.title}-${e.start.toISOString()}`}
											type="button"
											onClick={() => onSelectEvent(e)}
											className="w-full rounded-xl border px-3.5 py-3 text-left transition
												[border-color:var(--border)] [background:var(--surface-2)]
												hover:[background:color-mix(in_srgb,var(--primary)_6%,var(--surface-2))]"
										>
											<div className="truncate text-sm font-semibold leading-tight [color:var(--text)]">
												{e.title || "Untitled event"}
											</div>
											<div className="mt-1 text-xs [color:var(--text-muted)]">
												{timeLabel(e)}
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Upcoming list */}
					<div className="rounded-xl border p-5 [border-color:var(--border)] [background:var(--surface)]">
						<div className="flex items-center justify-between gap-3">
							<div className="text-xs font-semibold uppercase tracking-wide [color:var(--text-muted)]">
								Upcoming
							</div>
							<div className="text-xs [color:var(--text-muted)]">
								Next 7 days
							</div>
						</div>

						<div className="mt-3 grid gap-2">
							{upcomingPreview.map((e) => (
								<button
									key={e.id || `${e.title}-${e.start.toISOString()}`}
									type="button"
									onClick={() => {
										onSelectDate(e.start);
										onSelectEvent(e);
									}}
									className="w-full rounded-xl border px-3.5 py-3 text-left transition
										[border-color:var(--border)] [background:var(--surface-2)]
										hover:[background:color-mix(in_srgb,var(--primary)_6%,var(--surface-2))]"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="truncate text-sm font-semibold leading-tight [color:var(--text)]">
												{e.title || "Untitled event"}
											</div>
											<div className="mt-0.5 text-xs [color:var(--text-muted)]">
												{format(e.start, "EEE, MMM d")} ·{" "}
												{e.allDay ? "All day" : format(e.start, "p")}
											</div>
										</div>

										<div
											className="w-10 shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-semibold leading-none
												[border-color:var(--border)] [color:var(--text-muted)] [background:var(--surface)]"
											style={{ minWidth: 40 }}
										>
											{isSameDay(e.start, selectedDate)
												? "Sel"
												: format(e.start, "d")}
										</div>
									</div>
								</button>
							))}

							{upcoming.length > upcomingPreview.length && (
								<div className="mt-1 text-xs [color:var(--text-muted)]">
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
