import { useCallback, useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";

import { EventCalendar, type CalendarEvent } from "../calendarindex";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/errorLogger";
import { safeSupabaseQuery } from "@/lib/supabaseUtils";

export default function CalendarPage({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; name: string; project_id: string | null }>>([]);

  const mapRowToEvent = useCallback((row: any): CalendarEvent => {
    // Prefer start_at/end_at for proper timed events; fall back to due_date as all-day
    let start: Date;
    let end: Date;
    let allDay: boolean;

    if (row.start_at) {
      // Explicit start/end times provided; respect as timed event
      try {
        start = parseISO(row.start_at);
      } catch {
        // Invalid ISO string; default to midnight of due_date
        const dueDate = row.due_date || new Date().toISOString().split("T")[0];
        start = new Date(`${dueDate}T00:00:00`);
      }
    } else if (row.due_date) {
      // Only due_date provided; treat as all-day
      start = new Date(`${row.due_date}T00:00:00`);
    } else {
      // No date at all; default to now
      start = new Date();
    }

    if (row.end_at) {
      try {
        end = parseISO(row.end_at);
      } catch {
        // Invalid end_at; use start + 1 hour (or 1 day if all-day)
        end = row.all_day ? addDays(start, 1) : new Date(start.getTime() + 3600000);
      }
    } else {
      // No end_at; infer from all_day flag
      end = row.all_day ? addDays(start, 1) : new Date(start.getTime() + 3600000);
    }

    // Respect explicit all_day setting if provided; otherwise infer from presence of start_at
    if (typeof row.all_day === "boolean") {
      allDay = row.all_day;
    } else {
      allDay = !row.start_at; // If no start_at, treat as all-day
    }

    return {
      id: row.id ?? "unknown",
      title: row.title ?? "Untitled",
      description: row.description ?? undefined,
      start,
      end,
      allDay,
      location: row.location ?? undefined,
      color: row.color ?? undefined,
      source: "manual",
      projectId: row.project_id ?? undefined,
      taskId: row.task_id ?? undefined,
    };
  }, []);

  const loadEvents = useCallback(async () => {
    const result = await safeSupabaseQuery(
      async () => await supabase
        .from("calendar_events")
        .select("*")
        .order("due_date", { ascending: true }),
      "CalendarPage"
    );

    const { data, error } = result;
    
    if (error && error.code !== 'SUPABASE_NOT_CONFIGURED') {
      logger.error("CalendarPage", "Failed to load calendar events", { error });
    }
    
    if (data) {
      setEvents(data.map(mapRowToEvent));
    } else {
      setEvents([]);
    }
  }, [mapRowToEvent]);

  const loadProjectTaskOptions = useCallback(async () => {
    const [projectsResult, tasksResult] = await Promise.all([
      safeSupabaseQuery(
        async () => await supabase.from("projects").select("id, name"),
        "CalendarPage"
      ),
      safeSupabaseQuery(
        async () => await supabase.from("tasks").select("id, name, project_id"),
        "CalendarPage"
      ),
    ]);

    const { data: projData, error: projErr } = projectsResult;
    const { data: taskData, error: taskErr } = tasksResult;

    if (projErr && projErr.code !== 'SUPABASE_NOT_CONFIGURED') {
      logger.error("CalendarPage", "Failed to load projects", { error: projErr });
    }
    if (taskErr && taskErr.code !== 'SUPABASE_NOT_CONFIGURED') {
      logger.error("CalendarPage", "Failed to load tasks", { error: taskErr });
    }

    setProjects((projData ?? []) as Array<{ id: string; name: string }>);
    setTasks((taskData ?? []) as Array<{ id: string; name: string; project_id: string | null }>);
  }, []);

  useEffect(() => {
    loadEvents();
    loadProjectTaskOptions();
  }, [loadEvents, loadProjectTaskOptions]);

  const handleEventAdd = async (event: CalendarEvent) => {
    try {
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
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const saved = mapRowToEvent(data);
        setEvents((prev) => [saved, ...prev]);
      }
    } catch (err) {
      logger.error("CalendarPage", "Failed to add calendar event", { event, error: err });
    }
  };

  const handleEventUpdate = async (updated: CalendarEvent) => {
    try {
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
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const saved = mapRowToEvent(data);
        setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
      }
    } catch (err) {
      logger.error("CalendarPage", "Failed to update calendar event", { event: updated, error: err });
    }
  };

  const handleEventDelete = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err) {
      logger.error("CalendarPage", "Failed to delete calendar event", { eventId, error: err });
    }
  };

  return (
    <EventCalendar
      events={events}
      onEventAdd={handleEventAdd}
      onEventUpdate={handleEventUpdate}
      onEventDelete={handleEventDelete}
      projectOptions={projects}
      taskOptions={tasks}
      compact={compact}
    />
  );
}
