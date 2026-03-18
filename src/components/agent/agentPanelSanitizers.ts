import type {
	AgentActivityItem,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
} from "@/services/agent/types";

const VALID_TASK_STATUSES = new Set<AgentTaskStatus>([
	"queued",
	"running",
	"awaiting_review",
	"approved",
	"rework_requested",
	"deferred",
]);
const VALID_TASK_PRIORITIES = new Set<AgentTaskPriority>([
	"critical",
	"high",
	"medium",
	"low",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
	return String(value ?? "").trim();
}

function optionalString(value: unknown): string | undefined {
	const text = String(value ?? "").trim();
	return text || undefined;
}

function normalizeIso(value: unknown): string | undefined {
	const text = requiredString(value);
	if (!text) return undefined;
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString();
}

export function sanitizeTaskItem(
	value: unknown,
	index = 0,
): AgentTaskItem | null {
	const row = asRecord(value);
	if (!row) return null;

	const taskId = requiredString(row.taskId || row.id || `task-${index}`);
	if (!taskId) return null;

	const runId = requiredString(row.runId || "");
	const priorityValue = requiredString(row.priority || "").toLowerCase();
	const statusValue = requiredString(row.status || "").toLowerCase();
	const priority = VALID_TASK_PRIORITIES.has(priorityValue as AgentTaskPriority)
		? (priorityValue as AgentTaskPriority)
		: "medium";
	const status = VALID_TASK_STATUSES.has(statusValue as AgentTaskStatus)
		? (statusValue as AgentTaskStatus)
		: "queued";

	const title = requiredString(row.title || row.name || "") || `Task ${taskId}`;
	const assigneeProfile = requiredString(row.assigneeProfile || "") || "unknown";
	const stage = requiredString(row.stage || "") || "unassigned";

	return {
		taskId,
		runId,
		userId: requiredString(row.userId || "") || "unknown",
		assigneeProfile,
		stage,
		title,
		description: requiredString(row.description || ""),
		priority,
		status,
		reviewAction: optionalString(row.reviewAction),
		reviewerId: optionalString(row.reviewerId),
		reviewerNote: optionalString(row.reviewerNote),
		requestId: optionalString(row.requestId),
		createdAt: normalizeIso(row.createdAt),
		updatedAt: normalizeIso(row.updatedAt),
		startedAt: normalizeIso(row.startedAt),
		finishedAt: normalizeIso(row.finishedAt),
	};
}

export function sanitizeTaskItems(value: unknown): AgentTaskItem[] {
	if (!Array.isArray(value)) return [];
	const deduped = new Map<string, AgentTaskItem>();
	value.forEach((item, index) => {
		const sanitized = sanitizeTaskItem(item, index);
		if (!sanitized) return;
		deduped.set(sanitized.taskId, sanitized);
	});
	return Array.from(deduped.values());
}

export function sanitizeActivityItem(
	value: unknown,
	index = 0,
): AgentActivityItem | null {
	const row = asRecord(value);
	if (!row) return null;

	const sourceRaw = requiredString(row.source || "").toLowerCase();
	const source: "run" | "task" | "review" =
		sourceRaw === "task" || sourceRaw === "review" ? sourceRaw : "run";
	const eventType = requiredString(row.eventType || "") || "event";
	const runId = requiredString(row.runId || "");
	const taskId = optionalString(row.taskId);
	const profileId = optionalString(row.profileId);
	const createdAt = normalizeIso(row.createdAt) || new Date().toISOString();
	const activityId =
		requiredString(row.activityId || "") ||
		`${source}:${runId || "global"}:${eventType}:${taskId || index}:${createdAt}`;

	return {
		activityId,
		source,
		eventType,
		runId,
		taskId,
		profileId,
		status: optionalString(row.status),
		priority: optionalString(row.priority),
		stage: optionalString(row.stage),
		requestId: requiredString(row.requestId || ""),
		message: requiredString(row.message || "") || `${eventType} event`,
		payload: asRecord(row.payload) ?? undefined,
		createdAt,
	};
}

export function sanitizeActivityItems(value: unknown): AgentActivityItem[] {
	if (!Array.isArray(value)) return [];
	const deduped = new Map<string, AgentActivityItem>();
	value.forEach((item, index) => {
		const sanitized = sanitizeActivityItem(item, index);
		if (!sanitized) return;
		deduped.set(sanitized.activityId, sanitized);
	});
	return Array.from(deduped.values());
}
