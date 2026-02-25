import { useCalendarEvents } from "./hooks/useCalendarEvents";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/lib/supabase";
import { safeSupabaseQuery } from "@/lib/supabaseUtils";
import {
	type CalendarEvent,
	EventCalendar,
} from "./calendarindex";

type CalendarPageProps = {
	compact?: boolean;
	selectedDate?: Date;
	onSelectedDateChange?: (date: Date) => void;
	onEventsChange?: (events: CalendarEvent[]) => void;
};

function useControllableDate(
	controlled: Date | undefined,
	onChange: ((d: Date) => void) | undefined,
	initial: Date,
) {
	const [uncontrolled, setUncontrolled] = useState<Date>(initial);
	const isControlled = controlled instanceof Date;
	const value = isControlled ? controlled : uncontrolled;

	const setValue = (next: Date) => {
		onChange?.(next);
		if (!isControlled) {
			setUncontrolled(next);
		}
	};

	return [value, setValue] as const;
}

export default function CalendarPage({
	compact = false,
	selectedDate: controlledSelectedDate,
	onSelectedDateChange,
	onEventsChange,
}: CalendarPageProps) {
	const { events, addEvent, updateEvent, deleteEvent } = useCalendarEvents();
	const [selectedDate, setSelectedDate] = useControllableDate(
		controlledSelectedDate,
		onSelectedDateChange,
		new Date(),
	);
	const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
		[],
	);
	const [tasks, setTasks] = useState<
		Array<{ id: string; name: string; project_id: string | null }>
	>([]);

	const getCurrentUserId = useCallback(async (): Promise<string | null> => {
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser();

		if (error || !user) {
			logger.error("CalendarPage", "Missing authenticated user", {
				error,
			});
			return null;
		}

		return user.id;
	}, []);

	const loadProjectTaskOptions = useCallback(async () => {
		const userId = await getCurrentUserId();
		if (!userId) {
			setProjects([]);
			setTasks([]);
			return;
		}

		const [projectsResult, tasksResult] = await Promise.all([
			safeSupabaseQuery(
				async () =>
					await supabase
						.from("projects")
						.select("id, name")
						.eq("user_id", userId),
				"CalendarPage",
			),
			safeSupabaseQuery(
				async () =>
					await supabase
						.from("tasks")
						.select("id, name, project_id")
						.eq("user_id", userId),
				"CalendarPage",
			),
		]);

		const { data: projData, error: projErr } = projectsResult;
		const { data: taskData, error: taskErr } = tasksResult;

		if (projErr && projErr.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("CalendarPage", "Failed to load projects", {
				error: projErr,
			});
		}
		if (taskErr && taskErr.code !== "SUPABASE_NOT_CONFIGURED") {
			logger.error("CalendarPage", "Failed to load tasks", { error: taskErr });
		}

		setProjects((projData ?? []) as Array<{ id: string; name: string }>);
		setTasks(
			(taskData ?? []) as Array<{
				id: string;
				name: string;
				project_id: string | null;
			}>,
		);
	}, [getCurrentUserId]);

	useEffect(() => {
		loadProjectTaskOptions();
	}, [loadProjectTaskOptions]);

	useEffect(() => {
		onEventsChange?.(events);
	}, [events, onEventsChange]);

	return (
		<EventCalendar
			events={events}
			selectedDate={selectedDate}
			onSelectedDateChange={setSelectedDate}
			onEventAdd={addEvent}
			onEventUpdate={updateEvent}
			onEventDelete={deleteEvent}
			projectOptions={projects}
			taskOptions={tasks}
			compact={compact}
		/>
	);
}
