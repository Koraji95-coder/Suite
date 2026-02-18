// ── Shared literal unions ──────────────────────────────────────────────

/** Priority levels shared by projects and tasks. */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/** Persisted project status values. "completed" is used for archived projects. */
export type ProjectStatus = 'active' | 'on-hold' | 'completed';

/** UI-level status filter (includes "all" and "archived" alias). */
export type StatusFilter = 'active' | 'all' | 'on-hold' | 'archived';

/** Task list filter. */
export type TaskFilter = 'all' | 'pending' | 'completed';

/** Detail-panel view mode. */
export type ViewMode = 'tasks' | 'calendar' | 'files';

/** Calendar event type. */
export type CalendarEventType = 'deadline' | 'milestone' | 'reminder';

// ── Core data models ───────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string | null;
  priority: Priority;
  color: string;
  status: ProjectStatus;
  category: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  description: string;
  completed: boolean;
  order: number;
  due_date: string | null;
  parent_task_id: string | null;
  priority: Priority;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  file_path: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface CalendarEvent {
  id: string;
  project_id: string;
  task_id: string | null;
  due_date: string;
  title: string;
  type: CalendarEventType;
}

// ── Derived / aggregate types ──────────────────────────────────────────

export interface TaskCount {
  total: number;
  completed: number;
  nextDue: { name: string; date: string } | null;
  hasOverdue: boolean;
}

// ── Form data shapes ───────────────────────────────────────────────────

export interface ProjectFormData {
  name: string;
  description: string;
  deadline: string;
  priority: string;
  status: string;
  category: string;
}

export interface TaskFormData {
  name: string;
  description: string;
  due_date: string;
  priority: string;
}

// ── Constants ──────────────────────────────────────────────────────────

export const PROJECT_CATEGORIES = [
  { key: 'Coding', color: '#22c55e' },
  { key: 'Substation', color: '#38bdf8' },
  { key: 'QAQC', color: '#ec4899' },
  { key: 'School', color: '#f59e0b' },
] as const;

/** Convenience type for a single category entry. */
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];