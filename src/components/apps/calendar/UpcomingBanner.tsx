/* =========================================================
   src/components/apps/calendar/UpcomingBanner.tsx
   Inline banner (shows only when no upcoming events)
   ========================================================= */

import { CalendarDaysIcon } from "lucide-react";
import { useMemo } from "react";
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
	const hasUpcoming = useMemo(() => {
		return getUpcomingNext7Days(events).length > 0;
	}, [events]);

	if (hasUpcoming) return null;

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-xl border px-5 py-4 text-center",
				"[border-color:var(--border)] [background:var(--surface)]",
				className,
			)}
		>
			<div className="[color:var(--text-muted)]">
				<CalendarDaysIcon size={16} aria-hidden="true" />
			</div>
			<div className="min-w-0 space-y-0.5">
				<div className="text-sm font-semibold leading-tight [color:var(--text)]">
					No new events in the next 7 days
				</div>
				<div className="text-xs leading-relaxed [color:var(--text-muted)]">
					When something is scheduled, it'll show up automatically.
				</div>
			</div>
		</div>
	);
}
