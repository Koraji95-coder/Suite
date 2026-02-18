import { useMemo } from "react";
import { addDays, format, isToday, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";

import { AgendaDaysToShow, CalendarEvent, EventItem, getAgendaEventsForDay } from "./calendarindex";
import { cn } from "@/lib/utils";

interface AgendaViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  selectedDate?: Date | null;
  onDateSelect?: (date: Date) => void;
}

export function AgendaView({
  currentDate,
  events,
  onEventSelect,
  selectedDate,
  onDateSelect
}: AgendaViewProps) {
  const days = useMemo(() => {
    return Array.from({ length: AgendaDaysToShow }, (_, i) => addDays(new Date(currentDate), i));
  }, [currentDate]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const hasEvents = days.some((day) => getAgendaEventsForDay(events, day).length > 0);

  return (
    <div className="border-border/70 border-t px-4">
      {!hasEvents ? (
        <div className="flex min-h-[70svh] flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="text-muted-foreground/50 mb-2 h-8 w-8" />
          <h3 className="text-lg font-medium">No events found</h3>
          <p className="text-muted-foreground">There are no events scheduled for this time period.</p>
        </div>
      ) : (
        days.map((day) => {
          const dayEvents = getAgendaEventsForDay(events, day);
          if (dayEvents.length === 0) return null;

          const isSelected = !!selectedDate && isSameDay(day, selectedDate);

          return (
            <div
              key={day.toString()}
              className={cn(
                "border-border/70 relative my-12 border-t",
                isSelected && "rounded-lg ring-1 ring-primary/30 bg-primary/5"
              )}
              onClick={() => onDateSelect?.(day)}>
              <span
                className="bg-background absolute -top-3 left-0 flex h-6 items-center pe-4 text-[10px] uppercase data-today:font-medium sm:pe-4 sm:text-xs"
                data-today={isToday(day) || undefined}>
                {format(day, "d MMM, EEEE")}
                {isSelected ? <span className="ms-2 text-primary/80">• selected</span> : null}
              </span>

              <div className="mt-6 space-y-2">
                {dayEvents.map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    view="agenda"
                    onClick={(e) => handleEventClick(event, e)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
