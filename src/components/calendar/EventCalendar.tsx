import { useEffect, useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
  subMonths,
  subWeeks
} from "date-fns";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";

import {
  addHoursToDate,
  AgendaDaysToShow,
  AgendaView,
  CalendarDndProvider,
  CalendarEvent,
  CalendarView,
  DayView,
  EventDialog,
  EventGap,
  EventHeight,
  MonthView,
  WeekCellsHeight,
  WeekView
} from "./calendarindex";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EMBER_PALETTE, hexToRgba } from "@/lib/three/emberPalette";

export interface EventCalendarProps {
  events?: CalendarEvent[];
  onEventAdd?: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent) => void;
  onEventDelete?: (eventId: string) => void;
  className?: string;
  initialView?: CalendarView;
}

export function EventCalendar({
  events = [],
  onEventAdd,
  onEventUpdate,
  onEventDelete,
  className,
  initialView = "month"
}: EventCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); // ✅ new
  const [view, setView] = useState<CalendarView>(initialView);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // ✅ central “select a day” handler
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // optional but usually desired: keep navigation context aligned to the selection
    setCurrentDate(date);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isEventDialogOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "m":
          setView("month");
          break;
        case "w":
          setView("week");
          break;
        case "d":
          setView("day");
          break;
        case "a":
          setView("agenda");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEventDialogOpen]);

  const handlePrevious = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(subWeeks(currentDate, 1));
    else if (view === "day") setCurrentDate(addDays(currentDate, -1));
    else if (view === "agenda") setCurrentDate(addDays(currentDate, -AgendaDaysToShow));
  };

  const handleNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1));
    else if (view === "day") setCurrentDate(addDays(currentDate, 1));
    else if (view === "agenda") setCurrentDate(addDays(currentDate, AgendaDaysToShow));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today); // ✅ makes “Today” also select today
  };

  const handleEventSelect = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsEventDialogOpen(true);
  };

  const handleEventCreate = (startTime: Date) => {
    const minutes = startTime.getMinutes();
    const remainder = minutes % 15;
    if (remainder !== 0) {
      if (remainder < 7.5) startTime.setMinutes(minutes - remainder);
      else startTime.setMinutes(minutes + (15 - remainder));
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
    }

    const newEvent: CalendarEvent = {
      id: "",
      title: "",
      start: startTime,
      end: addHoursToDate(startTime, 1),
      allDay: false
    };
    setSelectedEvent(newEvent);
    setIsEventDialogOpen(true);
  };

  const handleEventSave = (event: CalendarEvent) => {
    if (event.id) {
      onEventUpdate?.(event);
    } else {
      onEventAdd?.({
        ...event,
        id: Math.random().toString(36).substring(2, 11)
      });
    }
    setIsEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventDelete = (eventId: string) => {
    onEventDelete?.(eventId);
    setIsEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventUpdate = (updatedEvent: CalendarEvent) => {
    onEventUpdate?.(updatedEvent);
  };

  const viewTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return isSameMonth(start, end)
        ? format(start, "MMMM yyyy")
        : `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
    }
    if (view === "day") {
      return (
        <>
          <span className="min-[480px]:hidden" aria-hidden="true">
            {format(currentDate, "MMM d, yyyy")}
          </span>
          <span className="max-[479px]:hidden min-md:hidden" aria-hidden="true">
            {format(currentDate, "MMMM d, yyyy")}
          </span>
          <span className="max-md:hidden">{format(currentDate, "EEE MMMM d, yyyy")}</span>
        </>
      );
    }
    if (view === "agenda") {
      const start = currentDate;
      const end = addDays(currentDate, AgendaDaysToShow - 1);
      return isSameMonth(start, end)
        ? format(start, "MMMM yyyy")
        : `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [currentDate, view]);

  return (
    <GlassPanel
      tint={EMBER_PALETTE.primary}
      hoverEffect={false}
      bevel
      specular
      className={cn("flex flex-col has-data-[slot=month-view]:flex-1", className)}
      style={
        {
          "--event-height": `${EventHeight}px`,
          "--event-gap": `${EventGap}px`,
          "--week-cells-height": `${WeekCellsHeight}px`
        } as React.CSSProperties
      }>
      <CalendarDndProvider onEventUpdate={handleEventUpdate}>
        <div className="relative z-10 flex items-center justify-between p-2 sm:p-4">
          <div className="flex items-center gap-1 sm:gap-4">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all max-[479px]:aspect-square max-[479px]:px-0"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.primary, 0.06)} 0%, ${hexToRgba(EMBER_PALETTE.surface, 0.25)} 100%)`,
                border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.18)}`,
                color: EMBER_PALETTE.primary,
              }}>
              <CalendarCheck className="min-[480px]:hidden h-4 w-4" aria-hidden="true" />
              <span className="max-[479px]:sr-only">Today</span>
            </button>
            <div className="flex items-center sm:gap-2">
              <button
                onClick={handlePrevious}
                aria-label="Previous"
                className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]">
                <ChevronLeftIcon size={16} style={{ color: hexToRgba(EMBER_PALETTE.text, 0.5) }} aria-hidden="true" />
              </button>
              <button
                onClick={handleNext}
                aria-label="Next"
                className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]">
                <ChevronRightIcon size={16} style={{ color: hexToRgba(EMBER_PALETTE.text, 0.5) }} aria-hidden="true" />
              </button>
            </div>
            <h2
              className="text-sm font-semibold sm:text-lg md:text-xl"
              style={{ color: hexToRgba(EMBER_PALETTE.text, 0.9) }}>
              {viewTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="gap-1.5 max-[479px]:h-8 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.primary, 0.06)} 0%, ${hexToRgba(EMBER_PALETTE.surface, 0.25)} 100%)`,
                    border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.12)}`,
                    color: hexToRgba(EMBER_PALETTE.text, 0.7),
                  }}>
                  <span>
                    <span className="min-[480px]:hidden" aria-hidden="true">
                      {view.charAt(0).toUpperCase()}
                    </span>
                    <span className="max-[479px]:sr-only">
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </span>
                  </span>
                  <ChevronDownIcon className="-me-1 opacity-60" size={16} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                <DropdownMenuItem onClick={() => setView("month")}>
                  Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("week")}>
                  Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("day")}>
                  Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("agenda")}>
                  Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              className="max-[479px]:aspect-square max-[479px]:p-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={{
                backgroundColor: EMBER_PALETTE.primary,
                color: '#fff',
                boxShadow: `0 0 12px ${hexToRgba(EMBER_PALETTE.primary, 0.3)}`,
              }}
              onClick={() => {
                setSelectedEvent(null);
                setIsEventDialogOpen(true);
              }}>
              <PlusIcon className="opacity-80 sm:-ms-1" size={16} aria-hidden="true" />
              <span className="max-sm:sr-only">New event</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 flex-col">
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              events={events}
              onEventSelect={handleEventSelect}
              onEventCreate={handleEventCreate}
            />
          )}

          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              events={events}
              onEventSelect={handleEventSelect}
              onEventCreate={handleEventCreate}
            />
          )}

          {view === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onEventSelect={handleEventSelect}
              onEventCreate={handleEventCreate}
            />
          )}

          {view === "agenda" && (
            <AgendaView
              currentDate={currentDate}
              events={events}
              onEventSelect={handleEventSelect}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
            />
          )}
        </div>

        <EventDialog
          event={selectedEvent}
          isOpen={isEventDialogOpen}
          onClose={() => {
            setIsEventDialogOpen(false);
            setSelectedEvent(null);
          }}
          onSave={handleEventSave}
          onDelete={handleEventDelete}
        />
      </CalendarDndProvider>
    </GlassPanel>
  );
}
