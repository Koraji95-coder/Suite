import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { useCalendarEvents } from "../calendar/hooks/useCalendarEvents";
import { UpcomingBanner } from "../calendar/UpcomingBanner";
import { getUpcomingNext7Days } from "../calendar/upcoming";
import { getUrgencyLevel, URGENCY_COLORS } from "../calendar/urgencyUtils";
import { GlassPanel } from "../ui/GlassPanel";
import { bubbleStyle } from "./dashboardStyles";

export function DashboardUpcomingPanel() {
	const { palette } = useTheme();
	const { events, isLoading } = useCalendarEvents();

	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const upcomingPreview = upcoming.slice(0, 4);

	return (
		<GlassPanel
			tint={palette.primary}
			hoverEffect={false}
			specular={false}
			bevel={false}
			className="p-8 xl:p-9 group"
		>
			<div className="relative z-10">
				<div className="flex items-center justify-between mb-5">
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
						<h3
							className="text-xl font-bold"
							style={{ color: palette.primary }}
						>
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
					<div className="space-y-3">
						<div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
						<div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
						<div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
					</div>
				) : upcoming.length === 0 ? (
					<UpcomingBanner events={events} className="justify-center" />
				) : (
					<div className="space-y-4">
						{upcomingPreview.map((event) =>
							(() => {
								const urgency = getUrgencyLevel(event.start.toISOString());
								const urgencyLabel =
									urgency === "OVERDUE"
										? "Overdue"
										: urgency === "CRITICAL"
											? "Due soon"
											: urgency === "WARNING"
												? "Upcoming"
												: "Scheduled";
								const urgencyTone = URGENCY_COLORS[urgency];
								return (
									<div
										key={
											event.id || `${event.title}-${event.start.toISOString()}`
										}
										className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-all duration-300 hover:-translate-y-0.5"
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
											<div
												className="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em]"
												style={{
													color: urgencyTone.text,
													border: `1px solid ${hexToRgba(urgencyTone.border, 0.4)}`,
													background: hexToRgba(urgencyTone.bg, 0.15),
												}}
											>
												<span
													className="h-1.5 w-1.5 rounded-full"
													style={{
														background: urgencyTone.text,
														boxShadow: `0 0 6px ${hexToRgba(
															urgencyTone.text,
															0.6,
														)}`,
													}}
												/>
												{urgencyLabel}
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
								);
							})(),
						)}

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
		</GlassPanel>
	);
}
