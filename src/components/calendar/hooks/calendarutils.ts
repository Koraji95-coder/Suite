import type { CSSProperties } from "react";
import { differenceInCalendarDays, format, isSameDay } from "date-fns";
import type { CalendarEvent, EventColor } from "./calendartypes";

/** Date key format used for selection + external integration */
export function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function isMultiDayEvent(event: CalendarEvent): boolean {
  if (event.allDay) return true;
  const start = new Date(event.start);
  const end = new Date(event.end);
  return differenceInCalendarDays(end, start) >= 1;
}

/**
 * Get CSS classes for event colors (Tailwind tokens)
 */
export function getEventColorClasses(color?: EventColor | string): string {
  const eventColor = color || "sky";

  // If someone passes a hex color, we handle color via inline styles instead.
  if (typeof eventColor === "string" && eventColor.trim().startsWith("#")) {
    return "bg-muted/40 hover:bg-muted/50 text-foreground/90 shadow-black/10";
  }

  switch (eventColor) {
    case "sky":
      return "bg-sky-200/50 hover:bg-sky-200/40 text-sky-950/80 dark:bg-sky-400/25 dark:hover:bg-sky-400/20 dark:text-sky-200 shadow-sky-700/8";
    case "amber":
      return "bg-amber-200/50 hover:bg-amber-200/40 text-amber-950/80 dark:bg-amber-400/25 dark:hover:bg-amber-400/20 dark:text-amber-200 shadow-amber-700/8";
    case "violet":
      return "bg-violet-200/50 hover:bg-violet-200/40 text-violet-950/80 dark:bg-violet-400/25 dark:hover:bg-violet-400/20 dark:text-violet-200 shadow-violet-700/8";
    case "rose":
      return "bg-rose-200/50 hover:bg-rose-200/40 text-rose-950/80 dark:bg-rose-400/25 dark:hover:bg-rose-400/20 dark:text-rose-200 shadow-rose-700/8";
    case "emerald":
      return "bg-emerald-200/50 hover:bg-emerald-200/40 text-emerald-950/80 dark:bg-emerald-400/25 dark:hover:bg-emerald-400/20 dark:text-emerald-200 shadow-emerald-700/8";
    case "orange":
      return "bg-orange-200/50 hover:bg-orange-200/40 text-orange-950/80 dark:bg-orange-400/25 dark:hover:bg-orange-400/20 dark:text-orange-200 shadow-orange-700/8";
    default:
      return "bg-sky-200/50 hover:bg-sky-200/40 text-sky-950/80 dark:bg-sky-400/25 dark:hover:bg-sky-400/20 dark:text-sky-200 shadow-sky-700/8";
  }
}

export function getBorderRadiusClasses(isFirstDay: boolean, isLastDay: boolean): string {
  if (isFirstDay && isLastDay) return "rounded";
  if (isFirstDay) return "rounded-l rounded-r-none";
  if (isLastDay) return "rounded-r rounded-l-none";
  return "rounded-none";
}

/**
 * Filter events starting on a day (single-day list)
 */
export function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((event) => {
      const start = new Date(event.start);
      return isSameDay(day, start);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aIsMulti = isMultiDayEvent(a);
    const bIsMulti = isMultiDayEvent(b);
    if (aIsMulti && !bIsMulti) return -1;
    if (!aIsMulti && bIsMulti) return 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

export function getSpanningEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => {
    if (!isMultiDayEvent(event)) return false;
    const start = new Date(event.start);
    const end = new Date(event.end);

    return (
      !isSameDay(day, start) &&
      (isSameDay(day, end) || (day > start && day < end))
    );
  });
}

export function getAllEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    return isSameDay(day, start) || isSameDay(day, end) || (day > start && day < end);
  });
}

export function getAgendaEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      return isSameDay(day, start) || isSameDay(day, end) || (day > start && day < end);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function addHoursToDate(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/* -------------------- Selected date helpers -------------------- */

export function isSelectedDay(day: Date, selected?: Date | null): boolean {
  if (!selected) return false;
  return isSameDay(day, selected);
}

/* -------------------- Hex color styling for PM integration -------------------- */

export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return 1;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  // perceptual-ish
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getEventInlineStyle(colorHex?: string): CSSProperties | undefined {
  if (!colorHex) return undefined;

  const lum = luminance(colorHex);
  const text = lum < 0.55 ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.82)";

  return {
    background: `linear-gradient(135deg, ${hexToRgba(colorHex, 0.30)} 0%, ${hexToRgba(
      colorHex,
      0.16
    )} 100%)`,
    border: `1px solid ${hexToRgba(colorHex, 0.35)}`,
    color: text,
    boxShadow: `0 10px 24px ${hexToRgba(colorHex, 0.16)}`
  };
}