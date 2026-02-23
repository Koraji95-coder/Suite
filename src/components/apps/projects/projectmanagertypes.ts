import type { Database } from "@/types/database";

// ── Shared literal unions ──────────────────────────────────────────────

/** Priority levels shared by projects and tasks. */
export type Priority = "low" | "medium" | "high" | "urgent";

/** Persisted project status values. "completed" is used for archived projects. */
export type ProjectStatus = "active" | "on-hold" | "completed" | "archived";

/** UI-level status filter (includes "all" and "archived" alias). */
export type StatusFilter = "active" | "all" | "on-hold" | "archived";

/** Task list filter. */
export type TaskFilter = "all" | "pending" | "completed";

/** Detail-panel view mode. */
export type ViewMode = "tasks" | "calendar" | "files" | "ground-grids";

/** Calendar event type. */
export type CalendarEventType = "deadline" | "milestone" | "reminder";

// ── Core data models ───────────────────────────────────────────────────

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type ProjectFile = Database["public"]["Tables"]["files"]["Row"];
export type CalendarEvent =
	Database["public"]["Tables"]["calendar_events"]["Row"];

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
	priority: Priority;
	status: ProjectStatus;
	category: string;
}

export interface TaskFormData {
	name: string;
	description: string;
	due_date: string;
	priority: Priority;
}

// ── Constants ──────────────────────────────────────────────────────────

export const PROJECT_CATEGORIES = [
	{ key: "Coding", color: "#22c55e" },
	{ key: "Substation", color: "#38bdf8" },
	{ key: "QAQC", color: "#ec4899" },
	{ key: "School", color: "#f59e0b" },
] as const;

/** Convenience type for a single category entry. */
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
