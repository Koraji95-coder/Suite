import { useCallback, useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";

import { EventCalendar, type CalendarEvent } from "../calendarindex";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/errorLogger";

export default function CalendarPage({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; name: string; project_id: string | null }>>([]);

  const mapRowToEvent = useCallback((row: any): CalendarEvent => {
    const start = row.start_at ? parseISO(row.start_at) : new Date(`${row.due_date}T00:00:00`);
    const end = row.end_at ? parseISO(row.end_at) : addDays(start, 1);
    return {
      id: row.id,
      title: row.title ?? "Untitled",
      description: row.description ?? undefined,
      start,
      end,
      allDay: row.all_day ?? true,
      location: row.location ?? undefined,
      color: row.color ?? undefined,
      source: "manual",
      projectId: row.project_id ?? undefined,
      taskId: row.task_id ?? undefined,
    };
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("due_date", { ascending: true });
      if (error) throw error;
      setEvents((data ?? []).map(mapRowToEvent));
    } catch (err) {
      logger.error("CalendarPage", "Failed to load calendar events", { error: err });
    }
  }, [mapRowToEvent]);

  const loadProjectTaskOptions = useCallback(async () => {
    try {
      const [{ data: projData, error: projErr }, { data: taskData, error: taskErr }] = await Promise.all([
        supabase.from("projects").select("id, name"),
        supabase.from("tasks").select("id, name, project_id"),
      ]);
      if (projErr) throw projErr;
      if (taskErr) throw taskErr;
      setProjects((projData ?? []) as Array<{ id: string; name: string }>);
      setTasks((taskData ?? []) as Array<{ id: string; name: string; project_id: string | null }>);
    } catch (err) {
      logger.error("CalendarPage", "Failed to load project/task options", { error: err });
    }
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
