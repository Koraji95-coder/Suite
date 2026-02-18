import { useState } from "react";
import { addDays, setHours, setMinutes, subDays } from "date-fns";

import { EventCalendar, type CalendarEvent } from "../calendarindex";

const sampleEvents: CalendarEvent[] = [
  {
    id: "1",
    title: "Annual Planning",
    description: "Strategic planning for next year",
    start: subDays(new Date(), 24),
    end: subDays(new Date(), 23),
    allDay: true,
    color: "sky",
    location: "Main Conference Hall"
  },
  {
    id: "2",
    title: "Project Deadline",
    description: "Submit final deliverables",
    start: setMinutes(setHours(subDays(new Date(), 9), 13), 0),
    end: setMinutes(setHours(subDays(new Date(), 9), 15), 30),
    color: "amber",
    location: "Office"
  },
  {
    id: "4",
    title: "Team Meeting",
    description: "Weekly team sync",
    start: setMinutes(setHours(new Date(), 10), 0),
    end: setMinutes(setHours(new Date(), 11), 0),
    color: "sky",
    location: "Conference Room A"
  }
];

export default function Page() {
  const [events, setEvents] = useState<CalendarEvent[]>(sampleEvents);

  const handleEventAdd = (event: CalendarEvent) => setEvents([...events, event]);
  const handleEventUpdate = (updated: CalendarEvent) =>
    setEvents(events.map((e) => (e.id === updated.id ? updated : e)));
  const handleEventDelete = (eventId: string) => setEvents(events.filter((e) => e.id !== eventId));

  return (
    <EventCalendar
      events={events}
      onEventAdd={handleEventAdd}
      onEventUpdate={handleEventUpdate}
      onEventDelete={handleEventDelete}
    />
  );
}
