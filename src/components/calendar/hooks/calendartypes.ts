export type CalendarView = "month" | "week" | "day" | "agenda";

export type EventColor = "sky" | "amber" | "violet" | "rose" | "emerald" | "orange";

export type EventSource = "manual" | "project" | "task";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;

  /**
   * Tailwind color token (your existing system)
   */
  color?: EventColor;

  /**
   * Optional: if you want to use your project hex colors (from your PM app),
   * set this and the event chips will use an inline-styled “badge” look.
   */
  colorHex?: string;

  location?: string;

  /**
   * Optional: lets you connect calendar items to your PM app
   */
  source?: EventSource;
  projectId?: string;
  taskId?: string;
}
