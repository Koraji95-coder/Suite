// src/components/apps/dashboard/DashboardUpcomingPanel.tsx
import { format } from "date-fns";
import { CalendarDays, ChevronRight, Clock, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";

// Primitives
import { Text } from "@/components/primitives/Text";
import { useCalendarEvents } from "../calendar/hooks/useCalendarEvents";
import { getUpcomingNext7Days } from "../calendar/upcoming";
import { getUrgencyLevel } from "../calendar/urgencyUtils";

const URGENCY_CONFIG = {
	OVERDUE: {
		color: "danger",
		label: "Overdue",
		bg: "bg-danger/10",
		border: "border-danger/20",
	},
	CRITICAL: {
		color: "warning",
		label: "Due soon",
		bg: "bg-warning/10",
		border: "border-warning/20",
	},
	WARNING: {
		color: "info",
		label: "Upcoming",
		bg: "bg-info/10",
		border: "border-info/20",
	},
	NORMAL: {
		color: "success",
		label: "Scheduled",
		bg: "bg-success/10",
		border: "border-success/20",
	},
} as const;

export function DashboardUpcomingPanel() {
	const { events, isLoading } = useCalendarEvents();
	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const upcomingPreview = upcoming.slice(0, 5);

	return (
		<Panel variant="default" padding="lg" className="h-full">
			<Stack gap={5}>
				{/* Header */}
				<HStack justify="between" align="center">
					<HStack gap={3} align="center">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
							<CalendarDays size={20} />
						</div>
						<Stack gap={0}>
							<Text size="lg" weight="bold">
								Upcoming
							</Text>
							<Text
								size="xs"
								color="muted"
								className="uppercase tracking-widest"
							>
								Next 7 days
							</Text>
						</Stack>
					</HStack>

					{upcoming.length > 0 && (
						<Badge color="primary" variant="soft">
							{upcoming.length} event{upcoming.length !== 1 ? "s" : ""}
						</Badge>
					)}
				</HStack>

				{/* Content */}
				{isLoading ? (
					<Stack gap={3}>
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-20 rounded-xl bg-surface-2 animate-pulse"
							/>
						))}
					</Stack>
				) : upcoming.length === 0 ? (
					<Panel variant="inset" padding="lg" className="text-center">
						<Stack gap={3} align="center">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
								<Sparkles size={24} className="text-text-muted" />
							</div>
							<Stack gap={1}>
								<Text size="sm" weight="medium">
									All clear!
								</Text>
								<Text size="xs" color="muted">
									No upcoming events in the next 7 days
								</Text>
							</Stack>
						</Stack>
					</Panel>
				) : (
					<Stack gap={3}>
						{upcomingPreview.map((event) => {
							const urgency = getUrgencyLevel(event.start.toISOString());
							const config = URGENCY_CONFIG[urgency];
							const dayNum = format(event.start, "d");
							const dayName = format(event.start, "EEE");

							return (
								<div
									key={
										event.id || `${event.title}-${event.start.toISOString()}`
									}
									className={`
                    group flex items-center gap-4 rounded-xl border p-4
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md
                    ${config.bg} ${config.border}
                  `}
								>
									{/* Date badge */}
									<div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-surface text-center">
										<Text size="xs" color="muted" className="uppercase">
											{dayName}
										</Text>
										<Text size="xl" weight="bold">
											{dayNum}
										</Text>
									</div>

									{/* Event details */}
									<Stack gap={1} className="flex-1 min-w-0">
										<Text size="sm" weight="semibold" truncate>
											{event.title || "Untitled event"}
										</Text>
										<HStack gap={2} align="center">
											<Clock size={12} className="text-text-muted" />
											<Text size="xs" color="muted">
												{event.allDay
													? "All day"
													: format(event.start, "h:mm a")}
											</Text>
										</HStack>
										<Badge
											color={
												config.color as
													| "danger"
													| "warning"
													| "info"
													| "success"
											}
											variant="soft"
											size="sm"
											dot
										>
											{config.label}
										</Badge>
									</Stack>

									{/* Arrow */}
									<ChevronRight
										size={16}
										className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</div>
							);
						})}

						{/* More indicator */}
						{upcoming.length > upcomingPreview.length && (
							<Text size="xs" color="muted" align="center">
								+{upcoming.length - upcomingPreview.length} more events
							</Text>
						)}
					</Stack>
				)}
			</Stack>
		</Panel>
	);
}
