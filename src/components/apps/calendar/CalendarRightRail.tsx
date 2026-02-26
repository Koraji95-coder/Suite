/* =========================================================
   src/components/apps/calendar/CalendarRightRail.tsx
   Behavior:
   - If upcoming is empty => show ONLY the "no upcoming" card (covers day part)
   - Else => show Selected day card + Upcoming list card
   ========================================================= */

import { endOfDay, format, isSameDay, startOfDay } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { TieredCard } from "@/components/apps/ui/TieredCard";
import { hexToRgba, useTheme } from "@/lib/palette";
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
	maxUpcomingToShow?: number; // default 5
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
	const { palette } = useTheme();

	const agenda = useMemo(() => {
		return events
			.filter((e) => overlapsDay(e, selectedDate))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}, [events, selectedDate]);

	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const hasUpcoming = upcoming.length > 0;
	const upcomingPreview = upcoming.slice(0, maxUpcomingToShow);

	// EMPTY STATE: covers the "day part" completely (no selected-day card)
	if (!hasUpcoming) {
		return (
			<div className={cn("hidden xl:block", className)}>
				<div
					className="sticky top-4"
					style={{ maxHeight: "calc(100vh - 120px)" }}
				>
					<UpcomingBanner
						events={events}
						className="w-full justify-center"
					/>
				</div>
			</div>
		);
	}

	// NORMAL STATE: Selected day + Upcoming list
	return (
		<div className={cn("hidden xl:block", className)}>
			<div
				className="sticky top-4"
				style={{ maxHeight: "calc(100vh - 120px)" }}
			>
				<div className="grid gap-4 overflow-auto pr-1">
					{/* Selected day */}
					<TieredCard
						tier="frosted"
						tint={palette.primary}
						className="rounded-2xl p-5"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div
									className="text-sm font-semibold leading-tight"
									style={{ color: hexToRgba(palette.text, 0.92) }}
								>
									{format(selectedDate, "EEEE")}
								</div>
								<div
									className="mt-0.5 text-xs"
									style={{ color: hexToRgba(palette.text, 0.6) }}
								>
									{format(selectedDate, "MMMM d, yyyy")}
								</div>
							</div>

							<button
								type="button"
								onClick={onNewEvent}
								className="rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 leading-none shrink-0"
								style={{
									background: palette.primary,
									color: "#111",
									boxShadow: `0 0 12px ${hexToRgba(palette.primary, 0.22)}`,
								}}
							>
								<PlusIcon size={14} aria-hidden="true" />
								New
							</button>
						</div>

						<div
							className="mt-4 h-px"
							style={{
								background: `linear-gradient(90deg, transparent, ${hexToRgba(
									palette.primary,
									0.14,
								)}, transparent)`,
							}}
						/>

						<div className="mt-4">
							<div
								className="text-xs font-semibold tracking-wide uppercase"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Agenda
							</div>

							{agenda.length === 0 ? (
								<div
									className="mt-3 rounded-2xl p-4"
									style={{
										border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
										background: hexToRgba(palette.surface, 0.14),
									}}
								>
									<div
										className="text-sm text-center leading-relaxed"
										style={{ color: hexToRgba(palette.text, 0.7) }}
									>
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
											className="w-full text-left rounded-2xl px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
											style={{
												border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
												background: hexToRgba(palette.surface, 0.12),
											}}
										>
											<div
												className="text-sm font-semibold truncate leading-tight"
												style={{ color: hexToRgba(palette.text, 0.9) }}
											>
												{e.title || "Untitled event"}
											</div>
											<div
												className="mt-1 text-xs"
												style={{ color: hexToRgba(palette.text, 0.6) }}
											>
												{timeLabel(e)}
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</TieredCard>

					{/* Upcoming list */}
					<TieredCard
						tier="solid"
						tint={palette.primary}
						className="rounded-2xl p-5"
					>
						<div className="flex items-center justify-between gap-3">
							<div
								className="text-xs font-semibold tracking-wide uppercase"
								style={{ color: hexToRgba(palette.text, 0.55) }}
							>
								Upcoming
							</div>
							<div
								className="text-xs"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							>
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
									className="w-full text-left rounded-2xl px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
									style={{
										border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
										background: hexToRgba(palette.surface, 0.1),
									}}
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div
												className="text-sm font-semibold truncate leading-tight"
												style={{ color: hexToRgba(palette.text, 0.9) }}
											>
												{e.title || "Untitled event"}
											</div>
											<div
												className="mt-0.5 text-xs"
												style={{ color: hexToRgba(palette.text, 0.6) }}
											>
												{format(e.start, "EEE, MMM d")} •{" "}
												{e.allDay ? "All day" : format(e.start, "p")}
											</div>
										</div>

										<div
											className="w-10 rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold leading-none shrink-0"
											style={{
												border: `1px solid ${hexToRgba(palette.text, 0.1)}`,
												color: hexToRgba(palette.text, 0.7),
												background: "rgba(255,255,255,0.02)",
												minWidth: 40,
											}}
										>
											{isSameDay(e.start, selectedDate)
												? "Sel"
												: format(e.start, "d")}
										</div>
									</div>
								</button>
							))}

							{upcoming.length > upcomingPreview.length ? (
								<div
									className="text-xs mt-1"
									style={{ color: hexToRgba(palette.text, 0.55) }}
								>
									+{upcoming.length - upcomingPreview.length} more
								</div>
							) : null}
						</div>
					</TieredCard>
				</div>
			</div>
		</div>
	);
}
