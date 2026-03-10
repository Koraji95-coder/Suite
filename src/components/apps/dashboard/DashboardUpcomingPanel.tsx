// src/components/apps/dashboard/DashboardUpcomingPanel.tsx
import { format } from "date-fns";
import { CalendarDays, ChevronRight, Clock, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";

// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "../calendar/hooks/useCalendarEvents";
import { getUpcomingNext7Days } from "../calendar/upcoming";
import { getUrgencyLevel } from "../calendar/urgencyUtils";

const URGENCY_CONFIG = {
	OVERDUE: {
		color: "danger",
		label: "Overdue",
		toneClass: "suite-dashboard-upcoming-card-overdue",
	},
	CRITICAL: {
		color: "warning",
		label: "Due soon",
		toneClass: "suite-dashboard-upcoming-card-critical",
	},
	WARNING: {
		color: "info",
		label: "Upcoming",
		toneClass: "suite-dashboard-upcoming-card-warning",
	},
	NORMAL: {
		color: "success",
		label: "Scheduled",
		toneClass: "suite-dashboard-upcoming-card-normal",
	},
} as const;

export function DashboardUpcomingPanel() {
	const { events, isLoading } = useCalendarEvents();
	const upcoming = useMemo(() => getUpcomingNext7Days(events), [events]);
	const upcomingPreview = upcoming.slice(0, 5);

	return (
		<Panel
			variant="default"
			padding="lg"
			className="suite-dashboard-fill-height"
		>
			<Stack gap={5}>
				{/* Header */}
				<HStack justify="between" align="center">
					<HStack gap={3} align="center">
						<div
							className={cn(
								"suite-dashboard-icon-mark",
								"suite-dashboard-icon-mark-md",
								"suite-dashboard-calendar-mark",
							)}
						>
							<CalendarDays size={20} />
						</div>
						<Stack gap={0}>
							<Text size="lg" weight="bold">
								Upcoming
							</Text>
							<Text
								size="xs"
								color="muted"
								className="suite-dashboard-upcoming-subtitle"
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
								className={cn(
									"suite-dashboard-widget-skeleton",
									"suite-dashboard-widget-skeleton-lg",
								)}
							/>
						))}
					</Stack>
				) : upcoming.length === 0 ? (
					<Panel
						variant="inset"
						padding="lg"
						className="suite-dashboard-center-text"
					>
						<Stack gap={3} align="center">
							<div className="suite-dashboard-empty-icon-wrap">
								<Sparkles size={24} className="suite-dashboard-muted-icon" />
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
									className={cn(
										"suite-dashboard-upcoming-card",
										config.toneClass,
									)}
								>
									{/* Date badge */}
									<div className="suite-dashboard-upcoming-date-badge">
										<Text
											size="xs"
											color="muted"
											className="suite-dashboard-upcoming-day-label"
										>
											{dayName}
										</Text>
										<Text size="xl" weight="bold">
											{dayNum}
										</Text>
									</div>

									{/* Event details */}
									<Stack gap={1} className="suite-dashboard-flex-1">
										<Text size="sm" weight="semibold" truncate>
											{event.title || "Untitled event"}
										</Text>
										<HStack gap={2} align="center">
											<Clock size={12} className="suite-dashboard-muted-icon" />
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
										className="suite-dashboard-upcoming-arrow"
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
