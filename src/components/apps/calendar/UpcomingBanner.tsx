/* =========================================================
   src/components/apps/calendar/UpcomingBanner.tsx
   Inline banner (shows only when no upcoming events)
   ========================================================= */

import { CalendarDaysIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./calendarindex";
import styles from "./UpcomingBanner.module.css";
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
		<div className={cn(styles.root, className)}>
			<div className={styles.iconWrap}>
				<CalendarDaysIcon size={16} aria-hidden="true" />
			</div>
			<div className={styles.content}>
				<div className={styles.title}>No new events in the next 7 days</div>
				<div className={styles.description}>
					When something is scheduled, it'll show up automatically.
				</div>
			</div>
		</div>
	);
}
