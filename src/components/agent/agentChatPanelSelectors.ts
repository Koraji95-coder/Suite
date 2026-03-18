import type {
	AgentActivityItem,
	AgentProfileCatalogItem,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
} from "@/services/agentService";
import type { AgentConversation } from "@/services/agentTaskManager";
import { normalizeAgentResponseText } from "./agentResponseNormalizer";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfile,
	type AgentProfileId,
} from "./agentProfiles";

export const OPEN_QUEUE_STATUSES: AgentTaskStatus[] = [
	"queued",
	"running",
	"awaiting_review",
	"rework_requested",
];
export const RUNNING_TASK_STATUSES: AgentTaskStatus[] = ["queued", "running"];
export const REVIEW_WARNING_STATUSES: AgentTaskStatus[] = [
	"awaiting_review",
	"rework_requested",
];
export const STATUS_FILTERS = ["all", ...OPEN_QUEUE_STATUSES] as const;
export const ACTIVITY_DETAIL_PREVIEW_CHARS = 260;
export const PRIORITY_ORDER: Record<AgentTaskPriority, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};
export const AGENT_NETWORK_NODES: ReadonlyArray<{
	profileId: AgentProfileId;
	x: number;
	y: number;
}> = [
	{ profileId: "koro", x: 120, y: 34 },
	{ profileId: "devstral", x: 58, y: 94 },
	{ profileId: "sentinel", x: 182, y: 94 },
	{ profileId: "forge", x: 120, y: 126 },
	{ profileId: "gridsage", x: 36, y: 136 },
	{ profileId: "draftsmith", x: 204, y: 136 },
];

export type QueueStatusFilter = (typeof STATUS_FILTERS)[number];
export type QueuePriorityFilter = AgentTaskPriority | "all";
export type QueueProfileFilter = AgentProfileId | "all";
export type QueueRunFilter = string | "all";
export type ActivitySourceFilter = AgentActivityItem["source"] | "all";

export type ActivityDetail = {
	text: string;
	meta: string;
	isError: boolean;
};

export type ProfileRosterEntry = {
	profileId: AgentProfileId;
	assignedCount: number;
	active: boolean;
	warningCount: number;
};

export function formatTimestamp(value: string | undefined): string {
	const text = String(value || "").trim();
	if (!text) return "";
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function priorityColor(
	priority: AgentTaskPriority,
): "danger" | "warning" | "primary" | "default" {
	switch (priority) {
		case "critical":
			return "danger";
		case "high":
			return "warning";
		case "medium":
			return "primary";
		default:
			return "default";
	}
}

export function statusColor(
	status: AgentTaskStatus,
): "success" | "warning" | "danger" | "primary" | "default" {
	switch (status) {
		case "approved":
			return "success";
		case "deferred":
			return "danger";
		case "awaiting_review":
		case "rework_requested":
			return "warning";
		case "running":
			return "primary";
		default:
			return "default";
	}
}

export function activityTone(
	item: AgentActivityItem,
): "success" | "warning" | "danger" | "primary" | "default" {
	const type = String(item.eventType || "").toLowerCase();
	if (type.includes("fail") || type.includes("deferred")) return "danger";
	if (type.includes("review") || type.includes("awaiting")) return "warning";
	if (type.includes("complete") || type.includes("approved")) return "success";
	if (type.includes("running") || type.includes("started")) return "primary";
	return "default";
}

export function shortRunId(runId: string): string {
	const text = String(runId || "").trim();
	if (!text) return "";
	return text.length > 14 ? text.slice(-10) : text;
}

export function runConversationTitle(runId: string): string {
	const normalized = String(runId || "").trim();
	if (!normalized) return "Run";
	return `Run ${shortRunId(normalized)}`;
}

export function normalizeKnownProfileId(
	value: string | undefined,
): AgentProfileId | null {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (!normalized || !(normalized in AGENT_PROFILES)) return null;
	return normalized as AgentProfileId;
}

export function mergeRuntimeProfiles(
	runtimeProfiles: AgentProfileCatalogItem[],
): Record<AgentProfileId, AgentProfile> {
	const next = { ...AGENT_PROFILES };
	for (const runtimeProfile of runtimeProfiles) {
		const profileId = normalizeKnownProfileId(runtimeProfile.id);
		if (!profileId) continue;
		next[profileId] = {
			...next[profileId],
			name: runtimeProfile.name || next[profileId].name,
			tagline: runtimeProfile.tagline || next[profileId].tagline,
			focus: runtimeProfile.focus || next[profileId].focus,
			memoryNamespace:
				runtimeProfile.memory_namespace || next[profileId].memoryNamespace,
			modelPrimary:
				runtimeProfile.model_primary || next[profileId].modelPrimary,
			modelFallbacks: [],
		};
	}
	return next;
}

export function addToBoundedSet(
	target: Set<string>,
	value: string,
	maxSize: number,
): boolean {
	const key = String(value || "").trim();
	if (!key) return false;
	if (target.has(key)) return true;
	target.add(key);
	if (target.size <= maxSize) return false;
	const overflow = target.size - maxSize;
	let removed = 0;
	for (const existing of target) {
		target.delete(existing);
		removed += 1;
		if (removed >= overflow) break;
	}
	return false;
}

export function truncateText(value: string | undefined, maxChars: number): string {
	const text = String(value || "").trim();
	if (!text) return "";
	if (text.length <= maxChars) return text;
	return `${text.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

export function payloadText(
	payload: Record<string, unknown> | undefined,
	keys: string[],
): string {
	if (!payload) return "";
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}
	}
	return "";
}

export function deriveActivityDetail(
	item: AgentActivityItem,
): ActivityDetail | null {
	const payload = item.payload;
	if (!payload) return null;

	const eventType = String(item.eventType || "").toLowerCase();
	const error = payloadText(payload, ["error", "detail", "reason"]);
	const response = payloadText(payload, ["response", "output", "result"]);
	const reviewNote = payloadText(payload, ["reviewNote", "review_note"]);
	const stage = payloadText(payload, ["stage"]);
	const modelUsed = payloadText(payload, ["modelUsed", "model", "model_used"]);
	const latencyCandidate = Number(
		payload.latencyMs ?? payload.latency_ms ?? Number.NaN,
	);
	const latencyMs = Number.isFinite(latencyCandidate)
		? Math.max(0, Math.trunc(latencyCandidate))
		: 0;

	const metaParts: string[] = [];
	if (stage) metaParts.push(`stage ${stage}`);
	if (modelUsed) metaParts.push(`model ${modelUsed}`);
	if (latencyMs > 0) metaParts.push(`latency ${latencyMs}ms`);

	let text = "";
	if (error) {
		text = error;
	} else if (eventType.includes("awaiting_review")) {
		text = reviewNote || response;
	} else if (eventType.includes("agent_message")) {
		text = normalizeAgentResponseText(response);
	}

	if (!text && metaParts.length === 0) return null;
	return {
		text: text.trim(),
		meta: metaParts.join(" | "),
		isError: Boolean(error),
	};
}

export function normalizeAssistantReply(
	data: Record<string, unknown> | undefined,
): {
	text: string;
	incomplete: boolean;
	warning: string;
} {
	if (!data) {
		return { text: "", incomplete: false, warning: "" };
	}
	const responseText = String(data.response ?? "").trim();
	if (responseText) {
		const normalizedText = normalizeAgentResponseText(responseText);
		return {
			text: normalizedText || responseText,
			incomplete: Boolean(data.incomplete),
			warning: String(data.warning || "").trim(),
		};
	}
	return {
		text: JSON.stringify(data, null, 2),
		incomplete: Boolean(data.incomplete),
		warning: String(data.warning || "").trim(),
	};
}

export function eventBodyFromPayload(
	eventType: string,
	payload: Record<string, unknown> | undefined,
	defaultMessage: string,
): string {
	const normalizedType = String(eventType || "").toLowerCase();
	const detail = payloadText(payload, ["error", "detail", "reason"]);
	if (detail && normalizedType.includes("fail")) return detail;
	const response = payloadText(payload, ["response", "output", "result"]);
	if (response && normalizedType === "agent_message") {
		return normalizeAgentResponseText(response);
	}

	const stage = payloadText(payload, ["stage"]);
	const modelUsed = payloadText(payload, ["modelUsed", "model", "model_used"]);
	const latency = Number(payload?.latencyMs ?? payload?.latency_ms ?? Number.NaN);
	const metaParts: string[] = [];
	if (stage) metaParts.push(`stage ${stage}`);
	if (modelUsed) metaParts.push(`model ${modelUsed}`);
	if (Number.isFinite(latency) && latency > 0) {
		metaParts.push(`${Math.trunc(latency)}ms`);
	}
	if (metaParts.length === 0) return defaultMessage;
	return `${defaultMessage} (${metaParts.join(" | ")})`;
}

export function selectQueueTasks(taskItems: AgentTaskItem[]): AgentTaskItem[] {
	return taskItems.filter((task) => OPEN_QUEUE_STATUSES.includes(task.status));
}

export function deriveAvailableRunIds(
	taskItems: AgentTaskItem[],
	activityItems: AgentActivityItem[],
): string[] {
	const stampByRun = new Map<string, string>();
	for (const task of taskItems) {
		const runId = String(task.runId || "").trim();
		if (!runId) continue;
		const stamp = String(task.updatedAt || task.createdAt || "").trim();
		if (!stampByRun.has(runId) || stamp > String(stampByRun.get(runId) || "")) {
			stampByRun.set(runId, stamp);
		}
	}
	for (const activity of activityItems) {
		const runId = String(activity.runId || "").trim();
		if (!runId) continue;
		const stamp = String(activity.createdAt || "").trim();
		if (!stampByRun.has(runId) || stamp > String(stampByRun.get(runId) || "")) {
			stampByRun.set(runId, stamp);
		}
	}
	return Array.from(stampByRun.entries())
		.sort((left, right) => right[1].localeCompare(left[1]))
		.map(([runId]) => runId)
		.slice(0, 40);
}

export function filterQueueTasks(args: {
	queueTasks: AgentTaskItem[];
	statusFilter: QueueStatusFilter;
	priorityFilter: QueuePriorityFilter;
	queueProfileFilter: QueueProfileFilter;
	queueRunFilter: QueueRunFilter;
}): AgentTaskItem[] {
	const {
		queueTasks,
		statusFilter,
		priorityFilter,
		queueProfileFilter,
		queueRunFilter,
	} = args;
	return [...queueTasks]
		.filter((task) => (statusFilter === "all" ? true : task.status === statusFilter))
		.filter((task) =>
			priorityFilter === "all" ? true : task.priority === priorityFilter,
		)
		.filter((task) =>
			queueProfileFilter === "all"
				? true
				: String(task.assigneeProfile || "").trim().toLowerCase() ===
					queueProfileFilter,
		)
		.filter((task) =>
			queueRunFilter === "all"
				? true
				: String(task.runId || "").trim() === queueRunFilter,
		)
		.sort((left, right) => {
			const priorityDelta =
				PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
			if (priorityDelta !== 0) return priorityDelta;
			return String(right.createdAt || "").localeCompare(
				String(left.createdAt || ""),
			);
		});
}

export function filterActivityItems(args: {
	activityItems: AgentActivityItem[];
	activitySourceFilter: ActivitySourceFilter;
	activityProfileFilter: QueueProfileFilter;
	activityRunFilter: QueueRunFilter;
}): AgentActivityItem[] {
	const {
		activityItems,
		activitySourceFilter,
		activityProfileFilter,
		activityRunFilter,
	} = args;
	return activityItems
		.filter((item) =>
			activitySourceFilter === "all" ? true : item.source === activitySourceFilter,
		)
		.filter((item) =>
			activityProfileFilter === "all"
				? true
				: String(item.profileId || "").trim().toLowerCase() ===
					activityProfileFilter,
		)
		.filter((item) =>
			activityRunFilter === "all"
				? true
				: String(item.runId || "").trim() === activityRunFilter,
		);
}

export function selectReviewInboxTasks(args: {
	queueTasks: AgentTaskItem[];
	queueProfileFilter: QueueProfileFilter;
	queueRunFilter: QueueRunFilter;
}): AgentTaskItem[] {
	const { queueTasks, queueProfileFilter, queueRunFilter } = args;
	return queueTasks
		.filter((task) => task.status === "awaiting_review")
		.filter((task) =>
			queueProfileFilter === "all"
				? true
				: String(task.assigneeProfile || "").trim().toLowerCase() ===
					queueProfileFilter,
		)
		.filter((task) =>
			queueRunFilter === "all"
				? true
				: String(task.runId || "").trim() === queueRunFilter,
		);
}

export function countQueuePriorities(
	queueTasks: AgentTaskItem[],
): Record<AgentTaskPriority, number> {
	const counts: Record<AgentTaskPriority, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
	};
	for (const task of queueTasks) {
		counts[task.priority] += 1;
	}
	return counts;
}

export function buildProfileRoster(
	queueTasks: AgentTaskItem[],
): ProfileRosterEntry[] {
	return AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => {
		const assigned = queueTasks.filter((task) => task.assigneeProfile === id);
		const active = assigned.some((task) =>
			RUNNING_TASK_STATUSES.includes(task.status),
		);
		const warningCount = assigned.filter((task) =>
			REVIEW_WARNING_STATUSES.includes(task.status),
		).length;
		return {
			profileId: id,
			assignedCount: assigned.length,
			active,
			warningCount,
		};
	});
}

export function resolveVisibleConversations(
	channelScope: "team" | AgentProfileId,
	conversations: AgentConversation[],
): AgentConversation[] {
	if (channelScope !== "team") return conversations;
	const runConversations = conversations.filter(
		(conversation) =>
			conversation.kind === "run" ||
			Boolean(String(conversation.runId || "").trim()),
	);
	return runConversations.length > 0 ? runConversations : conversations;
}
