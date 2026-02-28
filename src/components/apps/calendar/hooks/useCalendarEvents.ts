import { addDays, format, parseISO } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";
import { logActivity } from "@/services/activityService";
import type { CalendarEvent, EventColor } from "./calendartypes";

export interface CalendarEventRow {
	id: string;
	title: string;
	description?: string;
	due_date?: string;
	start_at?: string;
	end_at?: string;
	all_day?: boolean;
	location?: string;
	color?: string;
	project_id?: string;
	task_id?: string;
}

type UseCalendarEventsOptions = {
	enabled?: boolean;
};

export function useCalendarEvents({
	enabled = true,
}: UseCalendarEventsOptions = {}) {
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [isLoading, setIsLoading] = useState(enabled);

	const getCurrentUserId = useCallback(async (): Promise<string | null> => {
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();

		if (error || !user) {
			logger.error("CalendarEvents", "Missing authenticated user", {
				error,
			});
			return null;
		}

		return user.id;
	}, []);

	const mapRowToEvent = useCallback((row: CalendarEventRow): CalendarEvent => {
		let start: Date;
		let end: Date;
		let allDay: boolean;

		if (row.start_at) {
			try {
				start = parseISO(row.start_at);
			} catch {
				const dueDate = row.due_date || new Date().toISOString().split("T")[0];
				start = new Date(`${dueDate}T00:00:00`);
			}
		} else if (row.due_date) {
			start = new Date(`${row.due_date}T00:00:00`);
		} else {
			start = new Date();
		}

		if (row.end_at) {
			try {
				end = parseISO(row.end_at);
			} catch {
				end = row.all_day
					? addDays(start, 1)
					: new Date(start.getTime() + 3600000);
			}
		} else {
			end = row.all_day
				? addDays(start, 1)
				: new Date(start.getTime() + 3600000);
		}

		if (typeof row.all_day === "boolean") {
			allDay = row.all_day;
		} else {
			allDay = !row.start_at;
		}

		return {
			id: row.id ?? "unknown",
			title: row.title ?? "Untitled",
			description: row.description ?? undefined,
			start,
			end,
			allDay,
			location: row.location ?? undefined,
			color: (row.color as EventColor) ?? undefined,
			source: "manual",
			projectId: row.project_id ?? undefined,
			taskId: row.task_id ?? undefined,
		};
	}, []);

	const loadEvents = useCallback(async () => {
		if (!enabled) return;
		setIsLoading(true);
		try {
			const userId = await getCurrentUserId();
			if (!userId) {
				setEvents([]);
				return;
			}

			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("calendar_events")
						.select("*")
						.eq("user_id", userId)
						.order("due_date", { ascending: true }),
				"CalendarEvents",
			);

			const { data, error } = result;

			if (error && error.code !== "SUPABASE_NOT_CONFIGURED") {
				logger.error("CalendarEvents", "Failed to load calendar events", {
					error,
				});
			}

			if (data) {
				const rows = data as CalendarEventRow[];
				setEvents(rows.map(mapRowToEvent));
			} else {
				setEvents([]);
			}
		} finally {
			setIsLoading(false);
		}
	}, [enabled, getCurrentUserId, mapRowToEvent]);

	useEffect(() => {
		if (enabled) loadEvents();
	}, [enabled, loadEvents]);

	const addEvent = useCallback(
		async (event: CalendarEvent) => {
			try {
				const userId = await getCurrentUserId();
				if (!userId) return;

				const dueDate = format(event.start, "yyyy-MM-dd");
				const { data, error } = await supabase
					.from("calendar_events")
					.insert({
						title: event.title,
						due_date: dueDate,
						type: "reminder",
						description: event.description ?? null,
						location: event.location ?? null,
						color: event.color ?? null,
						all_day: event.allDay ?? false,
						start_at: event.start.toISOString(),
						end_at: event.end.toISOString(),
						project_id: event.projectId ?? null,
						task_id: event.taskId ?? null,
						user_id: userId,
					})
					.select()
					.maybeSingle();
				if (error) throw error;
				if (data) {
					const saved = mapRowToEvent(data as CalendarEventRow);
					setEvents((prev) => [saved, ...prev]);
					await logActivity({
						action: "create",
						description: `Added calendar event: ${saved.title}`,
						projectId: saved.projectId ?? null,
						taskId: saved.taskId ?? null,
					});
				}
			} catch (err) {
				logger.error("CalendarEvents", "Failed to add calendar event", {
					event,
					error: err,
				});
			}
		},
		[getCurrentUserId, mapRowToEvent],
	);

	const updateEvent = useCallback(
		async (updated: CalendarEvent) => {
			try {
				const userId = await getCurrentUserId();
				if (!userId) return;

				const dueDate = format(updated.start, "yyyy-MM-dd");
				const { data, error } = await supabase
					.from("calendar_events")
					.update({
						title: updated.title,
						due_date: dueDate,
						description: updated.description ?? null,
						location: updated.location ?? null,
						color: updated.color ?? null,
						all_day: updated.allDay ?? false,
						start_at: updated.start.toISOString(),
						end_at: updated.end.toISOString(),
						project_id: updated.projectId ?? null,
						task_id: updated.taskId ?? null,
					})
					.eq("id", updated.id)
					.eq("user_id", userId)
					.select()
					.maybeSingle();
				if (error) throw error;
				if (data) {
					const saved = mapRowToEvent(data as CalendarEventRow);
					setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
					await logActivity({
						action: "update",
						description: `Updated calendar event: ${saved.title}`,
						projectId: saved.projectId ?? null,
						taskId: saved.taskId ?? null,
					});
				}
			} catch (err) {
				logger.error("CalendarEvents", "Failed to update calendar event", {
					event: updated,
					error: err,
				});
			}
		},
		[getCurrentUserId, mapRowToEvent],
	);

	const deleteEvent = useCallback(
		async (eventId: string) => {
			try {
				const target = events.find((evt) => evt.id === eventId);
				const userId = await getCurrentUserId();
				if (!userId) return;

				const { error } = await supabase
					.from("calendar_events")
					.delete()
					.eq("id", eventId)
					.eq("user_id", userId);
				if (error) throw error;
				setEvents((prev) => prev.filter((e) => e.id !== eventId));
				await logActivity({
					action: "delete",
					description: target
						? `Deleted calendar event: ${target.title}`
						: "Deleted calendar event",
					projectId: target?.projectId ?? null,
					taskId: target?.taskId ?? null,
				});
			} catch (err) {
				logger.error("CalendarEvents", "Failed to delete calendar event", {
					eventId,
					error: err,
				});
			}
		},
		[events, getCurrentUserId],
	);

	return {
		events,
		isLoading,
		reload: loadEvents,
		addEvent,
		updateEvent,
		deleteEvent,
	};
}
