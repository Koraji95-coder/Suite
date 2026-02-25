/* =========================================================
   src/components/apps/calendar/UpcomingBanner.tsx
   Inline banner (shows only when no upcoming events)
   ========================================================= */

import { CalendarDaysIcon } from "lucide-react";
import { useMemo } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./calendarindex";
import { getUpcomingNext7Days } from "./upcoming";

export function UpcomingBanner({
	events,
	className,
}: {
	events: CalendarEvent[];
	className?: string;
}) {
	const { palette } = useTheme();

	const hasUpcoming = useMemo(() => {
		return getUpcomingNext7Days(events).length > 0;
	}, [events]);

	if (hasUpcoming) return null;

	return (
		<div
			className={cn(
				"rounded-2xl px-5 py-4 flex items-center gap-3 text-center",
				className,
			)}
			style={{
				border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
				background: hexToRgba(palette.surface, 0.14),
			}}
		>
			<div style={{ color: hexToRgba(palette.text, 0.55) }}>
				<CalendarDaysIcon size={16} aria-hidden="true" />
			</div>
			<div className="min-w-0 space-y-0.5">
				<div
					className="text-sm font-semibold leading-tight"
					style={{ color: hexToRgba(palette.text, 0.82) }}
				>
					No new events in the next 7 days
				</div>
				<div
					className="text-xs leading-relaxed"
					style={{ color: hexToRgba(palette.text, 0.55) }}
				>
					When something is scheduled, it’ll show up automatically.
				</div>
			</div>
		</div>
	);
}
