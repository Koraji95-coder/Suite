import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import {
	activityService,
	type ActivityLogRow,
} from "@/services/activityService";

const sortByTimestampDesc = (a: ActivityLogRow, b: ActivityLogRow) => {
	const at = new Date(a.timestamp).getTime();
	const bt = new Date(b.timestamp).getTime();
	return bt - at;
};

export function useRecentActivity(limit = 7) {
	const [activities, setActivities] = useState<ActivityLogRow[]>([]);
	const [loading, setLoading] = useState(true);
	const limitRef = useRef(limit);

	useEffect(() => {
		limitRef.current = limit;
	}, [limit]);

	const load = useCallback(async () => {
		setLoading(true);
		const { data, error } = await activityService.fetchRecentActivity(limit);
		if (error && error.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("RecentActivity", "Failed to load recent activity", {
				error,
			});
		}
		setActivities(data ?? []);
		setLoading(false);
	}, [limit]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		const unsubscribe = activityService.subscribe((entry) => {
			setActivities((prev) => {
				const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
				next.sort(sortByTimestampDesc);
				return next.slice(0, limitRef.current);
			});
		});
		return unsubscribe;
	}, []);

	return { activities, loading, refresh: load };
}
