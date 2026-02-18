/**
 * Shared calendar/urgency utilities used by both MainDashboard and ProjectManager.
 * Single source of truth for urgency thresholds and color styling.
 * All color values are valid hex strings for use with inline styles.
 */

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const URGENCY_THRESHOLDS = {
  OVERDUE: 0,      // daysUntil < 0
  CRITICAL: 3,     // daysUntil <= 3
  WARNING: 7,      // daysUntil <= 7
} as const;

export type UrgencyLevel = 'OVERDUE' | 'CRITICAL' | 'WARNING' | 'NORMAL';

export const URGENCY_COLORS: Record<UrgencyLevel, {
  text: string;
  bg: string;
  border: string;
  calendarDayBg: string;
  calendarDayText: string;
  calendarDayBorder: string;
}> = {
  OVERDUE: {
    text: '#ef4444',           // red-500
    bg: '#ef4444',
    border: '#ef4444',
    calendarDayBg: '#ef4444',
    calendarDayText: '#fca5a5', // red-300
    calendarDayBorder: '#ef4444',
  },
  CRITICAL: {
    text: '#f87171',           // red-400
    bg: '#f87171',
    border: '#f87171',
    calendarDayBg: '#f87171',
    calendarDayText: '#fca5a5', // red-300
    calendarDayBorder: '#f87171',
  },
  WARNING: {
    text: '#facc15',           // yellow-400
    bg: '#facc15',
    border: '#facc15',
    calendarDayBg: '#facc15',
    calendarDayText: '#fde047', // yellow-300
    calendarDayBorder: '#facc15',
  },
  NORMAL: {
    text: '#22d3ee',           // cyan-400
    bg: '#22d3ee',
    border: '#22d3ee',
    calendarDayBg: '#22d3ee',
    calendarDayText: '#67e8f9', // cyan-300
    calendarDayBorder: '#22d3ee',
  },
};

/**
 * Calculate urgency level from a date string.
 * Works with ISO date strings (e.g., "2026-02-15T00:00:00").
 */
export function getUrgencyLevel(dateStr: string): UrgencyLevel {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < URGENCY_THRESHOLDS.OVERDUE) return 'OVERDUE';
  if (daysUntil <= URGENCY_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (daysUntil <= URGENCY_THRESHOLDS.WARNING) return 'WARNING';
  return 'NORMAL';
}

/**
 * Get the text color hex for a deadline/due date.
 * Returns a valid hex color string.
 */
export function getUrgencyTextColor(dateStr: string | null): string {
  if (!dateStr) return '#9ca3af'; // gray-400
  return URGENCY_COLORS[getUrgencyLevel(dateStr)].text;
}

/**
 * Get calendar day inline styles for a day that has events/deadlines.
 * Returns a style object with backgroundColor, color, borderColor, fontWeight.
 */
export function getCalendarDayUrgencyStyle(dateStr: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
  fontWeight: string;
} {
  const level = getUrgencyLevel(dateStr);
  const c = URGENCY_COLORS[level];
  return {
    backgroundColor: hexToRgba(c.calendarDayBg, 0.25),
    color: c.calendarDayText,
    borderColor: hexToRgba(c.calendarDayBorder, 0.5),
    fontWeight: '600',
  };
}

/**
 * Get event chip inline styles for calendar events displayed inside day cells.
 * Returns a style object with backgroundColor and color.
 */
export function getEventChipStyle(dateStr: string): {
  backgroundColor: string;
  color: string;
} {
  const level = getUrgencyLevel(dateStr);
  const c = URGENCY_COLORS[level];
  return {
    backgroundColor: hexToRgba(c.bg, 0.2),
    color: c.text,
  };
}

