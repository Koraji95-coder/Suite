import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { UpcomingBanner } from "../calendar/UpcomingBanner";
import { getUpcomingNext7Days } from "../calendar/upcoming";
import { useCalendarEvents } from "../calendar/hooks/useCalendarEvents";
import { TieredCard } from "../ui/TieredCard";
import { bubbleStyle } from "./dashboardStyles";

export function DashboardUpcomingPanel() {
	const { palette } = useTheme();
	const { events, isLoading } = useCalendarEvents();

	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const upcomingPreview = upcoming.slice(0, 4);

	return (
		<TieredCard
			tier="frosted"
			tint={palette.primary}
			className="p-7"
		>
			<div className="relative z-10">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<div
							className="p-2 rounded-lg"
							style={{
								background: `linear-gradient(135deg, ${hexToRgba(
									palette.primary,
									0.25,
								)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
								boxShadow: `0 0 16px ${hexToRgba(palette.primary, 0.12)}`,
							}}
						>
							<CalendarDays
								className="w-5 h-5"
								style={{ color: palette.primary }}
							/>
						</div>
						<h3 className="text-xl font-bold" style={{ color: palette.primary }}>
							Upcoming
						</h3>
					</div>
					<span
						className="text-xs uppercase tracking-[0.2em]"
						style={{ color: hexToRgba(palette.text, 0.45) }}
					>
						Next 7 days
					</span>
				</div>

				{isLoading ? (
					<p className="text-sm" style={{ color: hexToRgba(palette.text, 0.45) }}>
						Loading calendar events...
					</p>
				) : upcoming.length === 0 ? (
					<UpcomingBanner events={events} className="justify-center" />
				) : (
					<div className="space-y-3">
						{upcomingPreview.map((event) => (
							<div
								key={event.id || `${event.title}-${event.start.toISOString()}`}
								className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4"
								style={bubbleStyle(palette, palette.secondary)}
							>
								<div className="min-w-0">
									<div
										className="text-sm font-semibold truncate"
										style={{ color: hexToRgba(palette.text, 0.9) }}
									>
										{event.title || "Untitled event"}
									</div>
									<div
										className="text-xs mt-1"
										style={{ color: hexToRgba(palette.text, 0.55) }}
									>
										{format(event.start, "EEE, MMM d")} •{" "}
										{event.allDay ? "All day" : format(event.start, "p")}
									</div>
								</div>
								<div
									className="w-10 shrink-0 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold"
									style={{
										border: `1px solid ${hexToRgba(palette.text, 0.1)}`,
										color: hexToRgba(palette.text, 0.7),
										background: "rgba(255,255,255,0.02)",
										minWidth: 40,
									}}
								>
									{format(event.start, "d")}
								</div>
							</div>
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
				)}
			</div>
		</TieredCard>
	);
}
