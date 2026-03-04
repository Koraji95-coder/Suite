// src/routes/app/CalendarRoutePage.tsx
import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import CalendarPage from "@/components/apps/calendar/CalendarPage";
import { CalendarRightRail } from "@/components/apps/calendar/CalendarRightRail";
import type { CalendarEvent } from "@/components/apps/calendar/calendarindex";

// Primitives
import { Text, Heading } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { HStack } from "@/components/primitives/Stack";

export default function CalendarRoutePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <HStack gap={3} align="center" className="mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <CalendarIcon size={20} />
          </div>
          <div>
            <Heading level={1}>Calendar</Heading>
            <Text size="sm" color="muted">
              Central calendar for events, schedules, and reminders.
            </Text>
          </div>
        </HStack>

        {/* Calendar Panel */}
        <Panel variant="default" padding="sm" className="overflow-hidden">
          <div style={{ minHeight: "clamp(620px, 72dvh, 1040px)" }}>
            <CalendarPage
              selectedDate={selectedDate}
              onSelectedDateChange={setSelectedDate}
              onEventsChange={setEvents}
            />
          </div>
        </Panel>
      </div>

      {/* Right Rail */}
      <aside className="w-full shrink-0 lg:w-80">
        <CalendarRightRail
          selectedDate={selectedDate}
          events={events}
          onNewEvent={() => setSelectedDate((d) => new Date(d))}
          onSelectEvent={(event) => setSelectedDate(event.start)}
          onSelectDate={setSelectedDate}
        />
      </aside>
    </div>
  );
}