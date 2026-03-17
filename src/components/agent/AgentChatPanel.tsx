import {
	AlertCircle,
	Check,
	ClipboardList,
	Expand,
	House,
	Loader2,
	Minimize2,
	Network,
	Plus,
	RefreshCw,
	Settings2,
	Trash2,
	Undo2,
	WifiOff,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { IconButton } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
	AGENT_PAIRING_STATE_EVENT,
	type AgentActivityItem,
	type AgentProfileCatalogItem,
	type AgentReviewAction,
	type AgentTaskItem,
	type AgentTaskPriority,
	type AgentTaskStatus,
	agentService,
} from "@/services/agentService";
import {
	type AgentConversation,
	agentTaskManager,
} from "@/services/agentTaskManager";
import {
	AgentChatComposer,
	type AgentComposerMode,
} from "./AgentChatComposer";
import { AgentChatMessages } from "./AgentChatMessages";
import styles from "./AgentChatPanel.module.css";
import {
	AgentOrchestrationPanel,
	type AgentOrchestrationRunEventPayload,
	type AgentOrchestrationRunStartedPayload,
	type AgentOrchestrationRunStatusPayload,
} from "./AgentOrchestrationPanel";
import { AgentPixelMark } from "./AgentPixelMark";
import {
	type AgentChannelScope,
	isAgentProfileScope,
} from "./agentChannelScope";
import { type AgentMarkState, resolveAgentMarkState } from "./agentMarkState";
import { normalizeAgentResponseText } from "./agentResponseNormalizer";
import {
	sanitizeActivityItems,
	sanitizeTaskItems,
} from "./agentPanelSanitizers";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfile,
	type AgentProfileId,
	DEFAULT_AGENT_PROFILE,
} from "./agentProfiles";
import { getAgentTaskTemplates } from "./agentTaskTemplates";

interface AgentChatPanelProps {
	healthy: boolean;
	paired: boolean;
}

const OPEN_QUEUE_STATUSES: AgentTaskStatus[] = [
	"queued",
	"running",
	"awaiting_review",
	"rework_requested",
];
const RUNNING_TASK_STATUSES: AgentTaskStatus[] = ["queued", "running"];
const REVIEW_WARNING_STATUSES: AgentTaskStatus[] = [
	"awaiting_review",
	"rework_requested",
];
const SUCCESS_TRANSIENT_MS = 2_200;
const CHANNEL_SCOPE_STORAGE_KEY = "agent-channel-scope";
const ACTIVE_AGENT_STORAGE_KEY = "agent-active-profile";
const STATUS_FILTERS = ["all", ...OPEN_QUEUE_STATUSES] as const;
type QueueStatusFilter = (typeof STATUS_FILTERS)[number];
type QueuePriorityFilter = AgentTaskPriority | "all";
type QueueProfileFilter = AgentProfileId | "all";
type QueueRunFilter = string | "all";
type ActivitySourceFilter = AgentActivityItem["source"] | "all";
const ACTIVITY_DETAIL_PREVIEW_CHARS = 260;
const GENERAL_SCOPE_ID = "team";
const DEFAULT_ORCHESTRATION_OBJECTIVE =
	"Coordinate a reliability review for my active feature. Return concrete implementation steps, high-risk findings, and validation checks.";
const WORKFLOW_POLL_VISIBLE_MS = 20_000;
const WORKFLOW_POLL_HIDDEN_MS = 60_000;
const WORKFLOW_POLL_ERROR_MS = 45_000;
const WORKFLOW_POLL_MAX_BACKOFF_MS = 120_000;
const MAX_SEEN_ACTIVITY_IDS = 2_000;
const MAX_EVENT_MIRROR_KEYS = 4_000;
const TERMINAL_RUN_EVENT_TYPES = new Set([
	"run_completed",
	"run_failed",
	"run_cancelled",
]);
const ACTIVE_STEP_EVENT_TYPES = new Set([
	"step_started",
	"task_running",
	"run_started",
]);
const IDLE_STEP_EVENT_TYPES = new Set([
	"step_completed",
	"step_failed",
	"step_cancelled",
	"task_awaiting_review",
	"task_reviewed",
	"run_completed",
	"run_failed",
	"run_cancelled",
]);

type WorkflowThinkingEntry = {
	activeProfiles: AgentProfileId[];
	lastProfileId: AgentProfileId;
	updatedAt: number;
};

const PRIORITY_ORDER: Record<AgentTaskPriority, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

function formatTimestamp(value: string | undefined): string {
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

function priorityColor(
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

function statusColor(
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

function activityTone(
	item: AgentActivityItem,
): "success" | "warning" | "danger" | "primary" | "default" {
	const type = String(item.eventType || "").toLowerCase();
	if (type.includes("fail") || type.includes("deferred")) return "danger";
	if (type.includes("review") || type.includes("awaiting")) return "warning";
	if (type.includes("complete") || type.includes("approved")) return "success";
	if (type.includes("running") || type.includes("started")) return "primary";
	return "default";
}

function shortRunId(runId: string): string {
	const text = String(runId || "").trim();
	if (!text) return "";
	return text.length > 14 ? text.slice(-10) : text;
}

function runConversationTitle(runId: string): string {
	const normalized = String(runId || "").trim();
	if (!normalized) return "Run";
	return `Run ${shortRunId(normalized)}`;
}

function normalizeKnownProfileId(value: string | undefined): AgentProfileId | null {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (!normalized || !(normalized in AGENT_PROFILES)) return null;
	return normalized as AgentProfileId;
}

function mergeRuntimeProfiles(
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

function addToBoundedSet(
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

function truncateText(value: string | undefined, maxChars: number): string {
	const text = String(value || "").trim();
	if (!text) return "";
	if (text.length <= maxChars) return text;
	return `${text.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function payloadText(
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

function deriveActivityDetail(item: AgentActivityItem): {
	text: string;
	meta: string;
	isError: boolean;
} | null {
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

function normalizeAssistantReply(data: Record<string, unknown> | undefined): {
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

function eventBodyFromPayload(
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

export function AgentChatPanel({ healthy, paired }: AgentChatPanelProps) {
	const navigate = useNavigate();
	const [profileId, setProfileId] = useState<AgentProfileId>(() => {
		try {
			const stored = localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY);
			if (stored && stored in AGENT_PROFILES) return stored as AgentProfileId;
		} catch {
			/* noop */
		}
		return DEFAULT_AGENT_PROFILE;
	});
	const [channelScope, setChannelScope] = useState<AgentChannelScope>(() => {
		try {
			const stored = localStorage.getItem(CHANNEL_SCOPE_STORAGE_KEY);
			if (stored === "team") return "team";
			if (stored && stored in AGENT_PROFILES)
				return stored as AgentChannelScope;
		} catch {
			/* noop */
		}
		return "team";
	});
	const [focusMode, setFocusMode] = useState(false);
	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [activeConvId, setActiveConvId] = useState<string | null>(null);
	const [directThinking, setDirectThinking] = useState(false);
	const [composerMode, setComposerMode] =
		useState<AgentComposerMode>("direct");
	const [orchestrationObjective, setOrchestrationObjective] = useState(
		DEFAULT_ORCHESTRATION_OBJECTIVE,
	);
	const [orchestrationRunStartSignal, setOrchestrationRunStartSignal] =
		useState(0);
	const [directThinkingProfileId, setDirectThinkingProfileId] =
		useState<AgentProfileId>(DEFAULT_AGENT_PROFILE);
	const [workflowThinkingByRunId, setWorkflowThinkingByRunId] = useState<
		Record<string, WorkflowThinkingEntry>
	>({});
	const [liveStreamText, setLiveStreamText] = useState("");

	const [taskItems, setTaskItems] = useState<AgentTaskItem[]>([]);
	const [activityItems, setActivityItems] = useState<AgentActivityItem[]>([]);
	const [workflowLoading, setWorkflowLoading] = useState(false);
	const [workflowInitialLoadDone, setWorkflowInitialLoadDone] = useState(false);
	const [workflowError, setWorkflowError] = useState("");
	const [reviewBusyTaskId, setReviewBusyTaskId] = useState("");
	const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
	const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
	const [priorityFilter, setPriorityFilter] =
		useState<QueuePriorityFilter>("all");
	const [queueProfileFilter, setQueueProfileFilter] =
		useState<QueueProfileFilter>("all");
	const [queueRunFilter, setQueueRunFilter] = useState<QueueRunFilter>("all");
	const [activityProfileFilter, setActivityProfileFilter] =
		useState<QueueProfileFilter>("all");
	const [activityRunFilter, setActivityRunFilter] =
		useState<QueueRunFilter>("all");
	const [activitySourceFilter, setActivitySourceFilter] =
		useState<ActivitySourceFilter>("all");
	const [profileSuccessUntil, setProfileSuccessUntil] = useState<
		Partial<Record<AgentProfileId, number>>
	>({});
	const [runtimeProfiles, setRuntimeProfiles] = useState<
		AgentProfileCatalogItem[]
	>([]);
	const seenActivityIdsRef = useRef<Set<string>>(new Set());
	const eventMirrorKeysRef = useRef<Set<string>>(new Set());
	const activityBridgeReadyRef = useRef(false);
	const mountedRef = useRef(true);
	const workflowRefreshEpochRef = useRef(0);
	const workflowRefreshInFlightRef = useRef<Promise<void> | null>(null);
	const workflowPollFailureCountRef = useRef(0);
	const workflowErrorRef = useRef("");

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			agentService.cancelActiveRequest();
			workflowRefreshEpochRef.current += 1;
		};
	}, []);

	useEffect(() => {
		workflowErrorRef.current = workflowError;
	}, [workflowError]);

	useEffect(() => {
		if (!agentService.usesBroker()) return;
		let active = true;

		const loadRuntimeProfiles = async () => {
			const result = await agentService.fetchProfileCatalog();
			if (!active || !result.success) return;
			setRuntimeProfiles(result.profiles);
		};
		const handleRuntimeProfileRefresh = () => {
			void loadRuntimeProfiles();
		};

		handleRuntimeProfileRefresh();
		if (typeof window !== "undefined") {
			window.addEventListener(
				AGENT_PAIRING_STATE_EVENT,
				handleRuntimeProfileRefresh,
			);
		}
		return () => {
			active = false;
			if (typeof window !== "undefined") {
				window.removeEventListener(
					AGENT_PAIRING_STATE_EVENT,
					handleRuntimeProfileRefresh,
				);
			}
		};
	}, [paired]);

	useEffect(() => {
		if (isAgentProfileScope(channelScope) && channelScope !== profileId) {
			setProfileId(channelScope);
		}
	}, [channelScope, profileId]);

	useEffect(() => {
		const conversationScope = channelScope === "team" ? "team" : channelScope;
		agentTaskManager.setConversationScope(conversationScope);
		const convs = agentTaskManager.getConversations();
		setConversations(convs);
		setActiveConvId((current) => {
			if (current && convs.some((conversation) => conversation.id === current)) {
				return current;
			}
			return convs[0]?.id ?? null;
		});
		try {
			localStorage.setItem(
				ACTIVE_AGENT_STORAGE_KEY,
				channelScope === "team" ? profileId : channelScope,
			);
			localStorage.setItem(CHANNEL_SCOPE_STORAGE_KEY, conversationScope);
		} catch {
			/* noop */
		}
	}, [channelScope, profileId]);

	const activeConv = useMemo(
		() =>
			conversations.find((conversation) => conversation.id === activeConvId) ??
			null,
		[conversations, activeConvId],
	);
	const resolvedProfiles = useMemo(
		() => mergeRuntimeProfiles(runtimeProfiles),
		[runtimeProfiles],
	);
	const scopeProfileId: AgentProfileId = isAgentProfileScope(channelScope)
		? channelScope
		: profileId;
	const scopeProfile = resolvedProfiles[scopeProfileId];
	const profile =
		channelScope === "team"
			? {
					name: "General",
					tagline: "Unified multi-agent command view",
					focus:
						"Monitor collaboration, queue, and review flow across all agents.",
				}
			: scopeProfile;
	const templates = getAgentTaskTemplates(scopeProfileId);
	const profileRouteLabel =
		channelScope === "team"
			? `General live feed - coordinator ${scopeProfile.name}`
			: `Model ${scopeProfile.modelPrimary}`;
	const channelLabel =
		channelScope === "team" ? "General" : scopeProfile.name;

	const refreshConversations = useCallback(() => {
		const next = agentTaskManager.getConversations();
		setConversations(next);
	}, []);

	const openGeneralRunConversation = useCallback(
		(
			runId: string,
			options?: { focus?: boolean; title?: string },
		): AgentConversation | null => {
			const normalizedRunId = String(runId || "").trim();
			if (!normalizedRunId) return null;
			const shouldFocus =
				options?.focus !== false || channelScope === GENERAL_SCOPE_ID;
			const previousScope =
				channelScope === GENERAL_SCOPE_ID ? GENERAL_SCOPE_ID : channelScope;

			agentTaskManager.setConversationScope(GENERAL_SCOPE_ID);
			const conversation = agentTaskManager.getOrCreateRunConversation(
				normalizedRunId,
				{
					profileId: GENERAL_SCOPE_ID,
					title:
						String(options?.title || "").trim() ||
						runConversationTitle(normalizedRunId),
				},
			);
			if (shouldFocus) {
				const nextConversations = agentTaskManager.getConversations();
				setConversations(nextConversations);
				setActiveConvId(conversation.id);
				setChannelScope("team");
			} else {
				agentTaskManager.setConversationScope(previousScope);
			}
			return conversation;
		},
		[channelScope],
	);

	const appendRunEventToConversation = useCallback(
		(
			runId: string,
			eventType: string,
			message: string,
			options?: {
				profileId?: string;
				status?: string;
				source?: "run" | "task" | "review" | "system";
				requestId?: string;
				dedupeKey?: string;
			},
		) => {
			const normalizedRunId = String(runId || "").trim();
			const normalizedMessage = String(message || "").trim();
			if (!normalizedRunId || !normalizedMessage) return;
			const dedupeKey = String(options?.dedupeKey || "").trim();
			if (
				dedupeKey &&
				addToBoundedSet(
					eventMirrorKeysRef.current,
					dedupeKey,
					MAX_EVENT_MIRROR_KEYS,
				)
			) {
				return;
			}

			const previousScope =
				channelScope === GENERAL_SCOPE_ID ? GENERAL_SCOPE_ID : channelScope;
			agentTaskManager.setConversationScope(GENERAL_SCOPE_ID);
			const conversation = agentTaskManager.getOrCreateRunConversation(
				normalizedRunId,
				{
					profileId: GENERAL_SCOPE_ID,
					title: runConversationTitle(normalizedRunId),
				},
			);

			const normalizedEventType = String(eventType || "").trim().toLowerCase();
			const resolvedProfileId = String(options?.profileId || "").trim();
			const isAgentMessage = normalizedEventType === "agent_message";

			agentTaskManager.addMessageToConversation(
				conversation.id,
				"assistant",
				normalizedMessage,
				{
					profileId: resolvedProfileId || undefined,
					kind: isAgentMessage ? "chat" : "event",
					eventType: normalizedEventType,
					runId: normalizedRunId,
					status: options?.status,
					source: options?.source || "run",
					requestId: options?.requestId,
				},
			);
			if (channelScope === GENERAL_SCOPE_ID) {
				refreshConversations();
			} else {
				agentTaskManager.setConversationScope(previousScope);
			}
		},
		[channelScope, refreshConversations],
	);

	const applyWorkflowThinkingEvent = useCallback(
		(runId: string, eventType: string, profileIdCandidate?: string) => {
			const normalizedRunId = String(runId || "").trim();
			const normalizedEventType = String(eventType || "").trim().toLowerCase();
			if (!normalizedRunId || !normalizedEventType) return;
			const normalizedProfile = normalizeKnownProfileId(profileIdCandidate);
			if (ACTIVE_STEP_EVENT_TYPES.has(normalizedEventType)) {
				setWorkflowThinkingByRunId((current) => {
					const existing = current[normalizedRunId];
					const nextActiveProfiles = new Set(existing?.activeProfiles ?? []);
					nextActiveProfiles.add(normalizedProfile ?? DEFAULT_AGENT_PROFILE);
					return {
						...current,
						[normalizedRunId]: {
							activeProfiles: Array.from(nextActiveProfiles),
							lastProfileId: normalizedProfile ?? DEFAULT_AGENT_PROFILE,
							updatedAt: Date.now(),
						},
					};
				});
				return;
			}
			if (TERMINAL_RUN_EVENT_TYPES.has(normalizedEventType)) {
				setWorkflowThinkingByRunId((current) => {
					if (!(normalizedRunId in current)) return current;
					const next = { ...current };
					delete next[normalizedRunId];
					return next;
				});
				return;
			}
			if (IDLE_STEP_EVENT_TYPES.has(normalizedEventType)) {
				setWorkflowThinkingByRunId((current) => {
					const existing = current[normalizedRunId];
					if (!existing || !normalizedProfile) return current;
					const nextActiveProfiles = existing.activeProfiles.filter(
						(profile) => profile !== normalizedProfile,
					);
					if (nextActiveProfiles.length === 0) {
						const next = { ...current };
						delete next[normalizedRunId];
						return next;
					}
					return {
						...current,
						[normalizedRunId]: {
							activeProfiles: nextActiveProfiles,
							lastProfileId:
								nextActiveProfiles.includes(existing.lastProfileId)
									? existing.lastProfileId
									: nextActiveProfiles[nextActiveProfiles.length - 1],
							updatedAt: Date.now(),
						},
					};
				});
			}
		},
		[],
	);

	const applyChannelScope = useCallback((nextScope: AgentChannelScope) => {
		if (nextScope === "team") {
			setChannelScope("team");
			return;
		}
		setProfileId(nextScope);
		setChannelScope(nextScope);
	}, []);

	const markProfileSuccess = useCallback((profile: AgentProfileId) => {
		const expiry = Date.now() + SUCCESS_TRANSIENT_MS;
		setProfileSuccessUntil((current) => ({
			...current,
			[profile]: expiry,
		}));
		window.setTimeout(() => {
			setProfileSuccessUntil((current) => {
				if ((current[profile] ?? 0) > Date.now()) return current;
				const next = { ...current };
				delete next[profile];
				return next;
			});
		}, SUCCESS_TRANSIENT_MS + 120);
	}, []);

	const handleNewConversation = useCallback(() => {
		const conversation = agentTaskManager.createConversation(
			channelScope === "team" ? "team" : scopeProfileId,
			channelScope === "team" ? "General conversation" : undefined,
		);
		agentTaskManager.saveConversation(conversation);
		refreshConversations();
		setActiveConvId(conversation.id);
	}, [channelScope, scopeProfileId, refreshConversations]);

	const handleDeleteConversation = useCallback(
		(id: string) => {
			agentTaskManager.deleteConversation(id);
			refreshConversations();
			setActiveConvId((previous) => {
				if (previous === id) {
					const remaining = agentTaskManager.getConversations();
					return remaining[0]?.id ?? null;
				}
				return previous;
			});
		},
		[refreshConversations],
	);

	const handleDirectSend = useCallback(
		async (message: string) => {
			if (!healthy || !paired) return;
			const outboundProfileId: AgentProfileId =
				channelScope === "team" ? profileId : scopeProfileId;
			const outboundMessage = message;
			const templateMatch = getAgentTaskTemplates(outboundProfileId).find(
				(template) => template.prompt.trim() === outboundMessage.trim(),
			);

			let conversationId = activeConvId;
			if (!conversationId) {
				const created = agentTaskManager.createConversation(
					channelScope === "team" ? "team" : scopeProfileId,
					channelScope === "team" ? "General conversation" : undefined,
				);
				agentTaskManager.saveConversation(created);
				conversationId = created.id;
				setActiveConvId(conversationId);
			}

			agentTaskManager.addMessageToConversation(
				conversationId,
				"user",
				message,
				{ profileId: outboundProfileId },
			);
			refreshConversations();

			setDirectThinkingProfileId(outboundProfileId);
			setDirectThinking(true);
			setLiveStreamText("");
			try {
				const response = await agentService.sendMessage(outboundMessage, {
					profileId: outboundProfileId,
					promptMode: templateMatch ? "template" : "manual",
					templateLabel: templateMatch?.label,
					onStreamUpdate: (partialResponse) => {
						if (!mountedRef.current) return;
						setLiveStreamText(partialResponse);
					},
				});
				let reply = response.error || "Request failed.";
				if (response.success) {
					const normalized = normalizeAssistantReply(response.data);
					reply = normalized.text || "Task completed.";
					if (normalized.incomplete) {
						const suffix = normalized.warning
							? `\n\n[Response incomplete: ${normalized.warning}]`
							: "\n\n[Response incomplete]";
						reply += suffix;
					}
				}
				if (mountedRef.current) {
					setDirectThinking(false);
					setLiveStreamText("");
				}
				agentTaskManager.addMessageToConversation(
					conversationId,
					"assistant",
					reply,
					{ profileId: outboundProfileId },
				);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred.";
				if (mountedRef.current) {
					setDirectThinking(false);
					setLiveStreamText("");
				}
				agentTaskManager.addMessageToConversation(
					conversationId,
					"assistant",
					errorMessage,
					{ profileId: outboundProfileId },
				);
			} finally {
				if (mountedRef.current) {
					setDirectThinking(false);
					setLiveStreamText("");
					refreshConversations();
				}
			}
		},
		[
			healthy,
			paired,
			channelScope,
			profileId,
			scopeProfileId,
			activeConvId,
			refreshConversations,
		],
	);

	const handleCancel = useCallback(() => {
		agentService.cancelActiveRequest();
		setDirectThinking(false);
		setLiveStreamText("");
	}, []);

	const handleComposerSend = useCallback(
		(message: string) => {
			if (composerMode === "run") {
				setOrchestrationObjective(message);
				setOrchestrationRunStartSignal((current) => current + 1);
				if (channelScope !== GENERAL_SCOPE_ID) {
					applyChannelScope("team");
				}
				return;
			}
			void handleDirectSend(message);
		},
		[composerMode, channelScope, applyChannelScope, handleDirectSend],
	);

	const refreshWorkflowData = useCallback(
		(silent = false) => {
			if (workflowRefreshInFlightRef.current) {
				return workflowRefreshInFlightRef.current;
			}

			const epoch = ++workflowRefreshEpochRef.current;
			if (!agentService.usesBroker()) {
				if (mountedRef.current) {
					setTaskItems([]);
					setActivityItems([]);
					setWorkflowError("");
					if (!silent) setWorkflowLoading(false);
					setWorkflowInitialLoadDone(true);
				}
				workflowPollFailureCountRef.current = 0;
				return Promise.resolve();
			}
			if (!silent && mountedRef.current) {
				setWorkflowLoading(true);
			}

			const requestPromise = (async () => {
				try {
					const [tasksResult, activityResult] = await Promise.all([
						agentService.listAgentTasks({ limit: 120 }),
						agentService.getAgentActivity({ limit: 120 }),
					]);
					if (
						!mountedRef.current ||
						epoch !== workflowRefreshEpochRef.current
					) {
						return;
					}

					const normalizedTasks = sanitizeTaskItems(tasksResult.tasks);
					const normalizedActivity = sanitizeActivityItems(
						activityResult.activity,
					);
					const refreshErrors: string[] = [];

					if (tasksResult.success) {
						setTaskItems(normalizedTasks);
					} else {
						logger.warn(
							"Task queue refresh returned unsuccessful response.",
							"AgentChatPanel",
							{
								stage: "refreshWorkflowData.tasks",
								scope: channelScope,
								activeProfile: scopeProfileId,
								error: tasksResult.error,
							},
						);
						refreshErrors.push(
							tasksResult.error || "Unable to load task queue.",
						);
					}

					if (activityResult.success) {
						setActivityItems(normalizedActivity);
					} else {
						logger.warn(
							"Activity refresh returned unsuccessful response.",
							"AgentChatPanel",
							{
								stage: "refreshWorkflowData.activity",
								scope: channelScope,
								activeProfile: scopeProfileId,
								error: activityResult.error,
							},
						);
						refreshErrors.push(
							activityResult.error || "Unable to load unified activity feed.",
						);
					}

					if (refreshErrors.length === 0) {
						workflowPollFailureCountRef.current = 0;
						setWorkflowError("");
					} else {
						workflowPollFailureCountRef.current = Math.min(
							workflowPollFailureCountRef.current + 1,
							8,
						);
						setWorkflowError(refreshErrors.join(" | "));
					}
				} catch (error) {
					logger.error("Workflow refresh crashed.", "AgentChatPanel", {
						stage: "refreshWorkflowData.exception",
						scope: channelScope,
						activeProfile: scopeProfileId,
						silent,
						error,
					});
					if (
						!mountedRef.current ||
						epoch !== workflowRefreshEpochRef.current
					) {
						return;
					}
					setWorkflowError(
						error instanceof Error
							? error.message
							: "Unable to load workflow data right now.",
					);
					workflowPollFailureCountRef.current = Math.min(
						workflowPollFailureCountRef.current + 1,
						8,
					);
				}
			})();
			let trackedPromise: Promise<void> | null = null;
			trackedPromise = requestPromise.finally(() => {
				if (workflowRefreshInFlightRef.current === trackedPromise) {
					workflowRefreshInFlightRef.current = null;
				}
				if (
					!silent &&
					mountedRef.current &&
					epoch === workflowRefreshEpochRef.current
				) {
					setWorkflowLoading(false);
					setWorkflowInitialLoadDone(true);
				}
			});
			workflowRefreshInFlightRef.current = trackedPromise;
			return trackedPromise;
		},
		[channelScope, scopeProfileId],
	);

	useEffect(() => {
		void refreshWorkflowData();
		let cancelled = false;
		let pollTimeout: number | null = null;

		const nextPollDelay = () => {
			const hidden = document.visibilityState === "hidden";
			const baseDelay = hidden
				? WORKFLOW_POLL_HIDDEN_MS
				: WORKFLOW_POLL_VISIBLE_MS;
			const failureCount = workflowPollFailureCountRef.current;
			const backoffMultiplier =
				failureCount <= 0 ? 1 : 2 ** Math.min(failureCount - 1, 3);
			const backoffDelay = Math.min(
				WORKFLOW_POLL_MAX_BACKOFF_MS,
				baseDelay * backoffMultiplier,
			);
			const errorDelay = workflowErrorRef.current ? WORKFLOW_POLL_ERROR_MS : 0;
			return Math.max(baseDelay, errorDelay, backoffDelay);
		};

		const scheduleNextPoll = () => {
			if (cancelled) return;
			pollTimeout = window.setTimeout(async () => {
				await refreshWorkflowData(true);
				scheduleNextPoll();
			}, nextPollDelay());
		};

		scheduleNextPoll();

		const requestRefresh = () => {
			void refreshWorkflowData(true);
		};
		const onFocus = () => {
			requestRefresh();
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				requestRefresh();
			}
		};
		const onPairingState = () => {
			requestRefresh();
		};
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener(
			AGENT_PAIRING_STATE_EVENT,
			onPairingState as EventListener,
		);
		return () => {
			cancelled = true;
			if (pollTimeout !== null) {
				window.clearTimeout(pollTimeout);
			}
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener(
				AGENT_PAIRING_STATE_EVENT,
				onPairingState as EventListener,
			);
		};
	}, [refreshWorkflowData]);

	useEffect(() => {
		if (!activityBridgeReadyRef.current) {
			for (const item of activityItems) {
				const activityId = String(item.activityId || "").trim();
				if (activityId) {
					addToBoundedSet(
						seenActivityIdsRef.current,
						activityId,
						MAX_SEEN_ACTIVITY_IDS,
					);
				}
				const eventType = String(item.eventType || "").toLowerCase();
				if (
					eventType.includes("approved") ||
					eventType.includes("completed")
				) {
					const profile = String(item.profileId || "").trim().toLowerCase();
					if (profile && profile in AGENT_PROFILES) {
						markProfileSuccess(profile as AgentProfileId);
					}
				}
			}
			activityBridgeReadyRef.current = true;
			return;
		}

		for (const item of activityItems) {
			const activityId = String(item.activityId || "").trim();
			if (
				!activityId ||
				addToBoundedSet(
					seenActivityIdsRef.current,
					activityId,
					MAX_SEEN_ACTIVITY_IDS,
				)
			) {
				continue;
			}

			const eventType = String(item.eventType || "").toLowerCase();
			const profile = String(item.profileId || "").trim().toLowerCase();
			if (
				eventType.includes("approved") ||
				eventType.includes("completed")
			) {
				if (profile && profile in AGENT_PROFILES) {
					markProfileSuccess(profile as AgentProfileId);
				}
			}

			const runId = String(item.runId || "").trim();
			if (!runId) continue;
			const detail = eventBodyFromPayload(eventType, item.payload, item.message);
			const runEventId = Number(
				String(activityId || "")
					.trim()
					.replace(/^run-/, ""),
			);
			const dedupeKey =
				item.source === "run" && Number.isFinite(runEventId) && runEventId > 0
					? `run:${runId}:event:${Math.trunc(runEventId)}`
					: `activity:${activityId}`;
			appendRunEventToConversation(runId, eventType, detail, {
				profileId: item.profileId,
				status: item.status,
				source: item.source,
				requestId: item.requestId,
				dedupeKey,
			});
			applyWorkflowThinkingEvent(runId, eventType, profile);
		}
	}, [
		activityItems,
		appendRunEventToConversation,
		markProfileSuccess,
		applyWorkflowThinkingEvent,
	]);

	// Defensive guard: avoid a permanently spinning queue loader if first-load
	// workflow requests stall or are interrupted by fast route changes.
	useEffect(() => {
		if (workflowInitialLoadDone) return;
		const timer = window.setTimeout(() => {
			if (!mountedRef.current) return;
			setWorkflowLoading(false);
			setWorkflowInitialLoadDone(true);
		}, 10_000);
		return () => window.clearTimeout(timer);
	}, [workflowInitialLoadDone]);

	const isReady = healthy && paired;
	const showQueueRefreshSpinner =
		workflowLoading &&
		!workflowInitialLoadDone &&
		taskItems.length === 0 &&
		activityItems.length === 0 &&
		!workflowError;

	const queueTasks = useMemo(
		() => taskItems.filter((task) => OPEN_QUEUE_STATUSES.includes(task.status)),
		[taskItems],
	);

	const availableRunIds = useMemo(() => {
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
	}, [taskItems, activityItems]);

	useEffect(() => {
		if (queueRunFilter !== "all" && !availableRunIds.includes(queueRunFilter)) {
			setQueueRunFilter("all");
		}
		if (
			activityRunFilter !== "all" &&
			!availableRunIds.includes(activityRunFilter)
		) {
			setActivityRunFilter("all");
		}
	}, [queueRunFilter, activityRunFilter, availableRunIds]);

	const filteredQueueTasks = useMemo(() => {
		return [...queueTasks]
			.filter((task) =>
				statusFilter === "all" ? true : task.status === statusFilter,
			)
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
	}, [
		queueTasks,
		statusFilter,
		priorityFilter,
		queueProfileFilter,
		queueRunFilter,
	]);

	const filteredActivityItems = useMemo(() => {
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
	}, [
		activityItems,
		activitySourceFilter,
		activityProfileFilter,
		activityRunFilter,
	]);

	const reviewInboxTasks = useMemo(
		() =>
			queueTasks
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
				),
		[queueTasks, queueProfileFilter, queueRunFilter],
	);

	const priorityCounts = useMemo(() => {
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
	}, [queueTasks]);

	const profileRoster = useMemo(() => {
		return AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => {
			const assigned = queueTasks.filter(
				(task) => task.assigneeProfile === id,
			);
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
	}, [queueTasks]);

	const handleReviewAction = useCallback(
		async (taskId: string, action: AgentReviewAction) => {
			setReviewBusyTaskId(taskId);
			const task = taskItems.find((entry) => entry.taskId === taskId);
			const pendingRunId = String(task?.runId || "").trim();
			if (pendingRunId) {
				appendRunEventToConversation(
					pendingRunId,
					"task_review_pending",
					`Review action "${action}" submitted for ${String(
						task?.assigneeProfile || "agent",
					)}. Awaiting workflow update...`,
					{
						profileId: String(task?.assigneeProfile || "").trim(),
						status: String(task?.status || "").trim(),
						source: "review",
						dedupeKey: `review-pending:${taskId}:${action}:${Date.now()}`,
					},
				);
				openGeneralRunConversation(pendingRunId, { focus: true });
				applyWorkflowThinkingEvent(
					pendingRunId,
					"task_running",
					String(task?.assigneeProfile || "").trim(),
				);
			}
			try {
				const result = await agentService.reviewAgentTask(
					taskId,
					action,
					reviewNotes[taskId],
				);
				if (!mountedRef.current) return;
				if (!result.success) {
					setWorkflowError(result.error || "Unable to submit review action.");
					return;
				}
				setReviewNotes((current) => {
					const next = { ...current };
					delete next[taskId];
					return next;
				});
				if (action === "approve") {
					const task = taskItems.find((entry) => entry.taskId === taskId);
					const profile = String(task?.assigneeProfile || "").trim();
					if (profile && profile in AGENT_PROFILES) {
						markProfileSuccess(profile as AgentProfileId);
					}
				}
				void refreshWorkflowData(true);
			} catch (error) {
				logger.error("Review action crashed.", "AgentChatPanel", {
					stage: "handleReviewAction.exception",
					taskId,
					action,
					scope: channelScope,
					activeProfile: scopeProfileId,
					error,
				});
				if (mountedRef.current) {
					setWorkflowError("Unable to submit review action.");
				}
				if (pendingRunId) {
					appendRunEventToConversation(
						pendingRunId,
						"task_review_failed",
						`Review action failed: ${
							error instanceof Error ? error.message : "Unknown error"
						}`,
						{
							profileId: String(task?.assigneeProfile || "").trim(),
							source: "review",
							dedupeKey: `review-error:${taskId}:${action}:${Date.now()}`,
						},
					);
				}
			} finally {
				if (mountedRef.current) {
					setReviewBusyTaskId("");
				}
			}
		},
		[
			refreshWorkflowData,
			reviewNotes,
			taskItems,
			markProfileSuccess,
			channelScope,
			scopeProfileId,
			appendRunEventToConversation,
			openGeneralRunConversation,
			applyWorkflowThinkingEvent,
		],
	);

	const handleOrchestrationRunStarted = useCallback(
		(payload: AgentOrchestrationRunStartedPayload) => {
			const runId = String(payload.runId || "").trim();
			if (!runId) return;
			const conversation = openGeneralRunConversation(runId, {
				focus: true,
				title: runConversationTitle(runId),
			});
			if (conversation) {
				agentTaskManager.addMessageToConversation(
					conversation.id,
					"user",
					String(payload.objective || "").trim(),
					{
						profileId: "koro",
						kind: "chat",
						runId,
						source: "run",
					},
				);
			}
			appendRunEventToConversation(
				runId,
				"run_enqueued",
				"Run queued from Live Agent Collaboration.",
				{
					source: "run",
					requestId: payload.requestId,
				dedupeKey: `client-run-start:${runId}`,
				},
			);
			refreshConversations();
			applyWorkflowThinkingEvent(runId, "run_started", "koro");
		},
		[
			appendRunEventToConversation,
			openGeneralRunConversation,
			refreshConversations,
			applyWorkflowThinkingEvent,
		],
	);

	const handleOrchestrationRunEvent = useCallback(
		(payload: AgentOrchestrationRunEventPayload) => {
			const runId = String(payload.runId || "").trim();
			if (!runId) return;
			const event = payload.event;
			const normalizedType = String(event.eventType || "").trim().toLowerCase();
			const message = eventBodyFromPayload(
				normalizedType,
				event.payload,
				String(event.message || "Workflow event"),
			);
			const profile = String(event.profileId || "").trim();
			appendRunEventToConversation(runId, normalizedType, message, {
				profileId: profile,
				source: "run",
				requestId: event.requestId,
				status: payloadText(event.payload, ["status"]),
				dedupeKey:
					event.id > 0
						? `run:${runId}:event:${event.id}`
						: `run:${runId}:event:${normalizedType}:${event.requestId}`,
			});
			applyWorkflowThinkingEvent(runId, normalizedType, profile);
		},
		[appendRunEventToConversation, applyWorkflowThinkingEvent],
	);

	const handleOrchestrationRunStatusChange = useCallback(
		(payload: AgentOrchestrationRunStatusPayload) => {
			const runId = String(payload.runId || "").trim();
			if (!runId) return;
			const status = String(payload.status || "").trim().toLowerCase();
			if (status === "running" || status === "queued" || status === "cancel_requested") {
				setWorkflowThinkingByRunId((current) => {
					const existing = current[runId];
					if (existing) {
						return {
							...current,
							[runId]: {
								...existing,
								updatedAt: Date.now(),
							},
						};
					}
					return {
						...current,
						[runId]: {
							activeProfiles: [DEFAULT_AGENT_PROFILE],
							lastProfileId: DEFAULT_AGENT_PROFILE,
							updatedAt: Date.now(),
						},
					};
				});
				return;
			}
			setWorkflowThinkingByRunId((current) => {
				if (!(runId in current)) return current;
				const next = { ...current };
				delete next[runId];
				return next;
			});
		},
		[],
	);

	const handleOrchestrationRunCleared = useCallback(
		(payload: { runId: string }) => {
			const runId = String(payload.runId || "").trim();
			if (!runId) return;
			setWorkflowThinkingByRunId((current) => {
				if (!(runId in current)) return current;
				const next = { ...current };
				delete next[runId];
				return next;
			});
		},
		[],
	);

	const visibleConversations = useMemo(() => {
		if (channelScope !== "team") return conversations;
		const runConversations = conversations.filter(
			(conversation) =>
				conversation.kind === "run" ||
				Boolean(String(conversation.runId || "").trim()),
		);
		return runConversations.length > 0 ? runConversations : conversations;
	}, [channelScope, conversations]);
	const conversationCount = visibleConversations.length;
	const activeMessageCount = activeConv?.messages.length ?? 0;
	useEffect(() => {
		if (
			activeConvId &&
			visibleConversations.some((conversation) => conversation.id === activeConvId)
		) {
			return;
		}
		setActiveConvId(visibleConversations[0]?.id ?? null);
	}, [visibleConversations, activeConvId]);

	const activeConversationRunId = String(activeConv?.runId || "").trim();
	const activeWorkflowRuns = useMemo(
		() =>
			Object.entries(workflowThinkingByRunId)
				.sort((left, right) => right[1].updatedAt - left[1].updatedAt)
				.map(([runId, entry]) => ({ runId, entry })),
		[workflowThinkingByRunId],
	);
	const visibleWorkflowRunId =
		activeConversationRunId && workflowThinkingByRunId[activeConversationRunId]
			? activeConversationRunId
			: activeWorkflowRuns[0]?.runId ?? "";
	const visibleWorkflowThinkingEntry = visibleWorkflowRunId
		? workflowThinkingByRunId[visibleWorkflowRunId]
		: null;
	const showWorkflowThinking =
		channelScope === GENERAL_SCOPE_ID && Boolean(visibleWorkflowThinkingEntry);
	const isThinking = directThinking || showWorkflowThinking;
	const thinkingProfileId = directThinking
		? directThinkingProfileId
		: visibleWorkflowThinkingEntry?.lastProfileId ?? DEFAULT_AGENT_PROFILE;
	const thinkingContent = directThinking ? liveStreamText : "";
	const now = Date.now();
	const hasRunningQueue = queueTasks.some((task) =>
		RUNNING_TASK_STATUSES.includes(task.status),
	);
	const hasReviewWarnings = queueTasks.some((task) =>
		REVIEW_WARNING_STATUSES.includes(task.status),
	);
	const activeProfileSuccess =
		channelScope === "team"
			? false
			: (profileSuccessUntil[scopeProfileId] ?? 0) > now;
	const profileStateById = useMemo(() => {
		const entries = Object.fromEntries(
			profileRoster.map((entry) => [entry.profileId, entry]),
		) as Record<
			AgentProfileId,
			{
				profileId: AgentProfileId;
				assignedCount: number;
				active: boolean;
				warningCount: number;
			}
		>;
		const currentTime = Date.now();
		const next: Partial<Record<AgentProfileId, AgentMarkState>> = {};
		for (const id of AGENT_PROFILE_IDS) {
			const rosterEntry = entries[id];
			next[id] = resolveAgentMarkState({
				error: !healthy,
				waiting: healthy && !paired,
				running:
					Boolean(rosterEntry?.active) ||
					(channelScope !== "team" && id === scopeProfileId && directThinking),
				warning: Boolean(rosterEntry?.warningCount),
				success: (profileSuccessUntil[id] ?? 0) > currentTime,
				focus:
					channelScope !== "team" && id === scopeProfileId && healthy && paired,
			});
		}
		return next;
	}, [
		profileRoster,
		healthy,
		paired,
		channelScope,
		scopeProfileId,
		directThinking,
		profileSuccessUntil,
	]);
	const centerAvatarState = resolveAgentMarkState({
		error: !healthy,
		waiting: healthy && !paired,
		running: hasRunningQueue,
		speaking: isThinking,
		thinking: isThinking,
		warning: hasReviewWarnings,
		success: activeProfileSuccess,
		focus: isReady && channelScope !== "team",
	});
	const assistantBaseState = resolveAgentMarkState({
		error: !healthy,
		waiting: healthy && !paired,
		running: hasRunningQueue,
		warning: hasReviewWarnings,
		success: activeProfileSuccess,
		focus: isReady,
	});

	return (
		<Panel
			variant="default"
			padding="none"
			className={cn(styles.panelRoot, focusMode && styles.panelRootFocus)}
		>
			<div className={styles.leftRail}>
				<div className={styles.railCard}>
					<div className={styles.railHeaderRow}>
						<Text size="xs" weight="semibold" className={styles.railEyebrow}>
							Agents
						</Text>
						<Badge size="sm" variant="outline" color="default">
							{profileRoster.filter((item) => item.active).length} active
						</Badge>
					</div>
					<div className={styles.agentRosterList}>
						<button
							type="button"
							onClick={() => applyChannelScope("team")}
							className={cn(
								styles.rosterItem,
								channelScope === "team" && styles.rosterItemActive,
								styles.teamHomeItem,
							)}
						>
							<div className={styles.rosterIdentity}>
								<div className={styles.teamHomeIconShell}>
									<House size={14} />
								</div>
								<div>
									<p className={styles.rosterName}>General</p>
									<p className={styles.rosterMeta}>
										Unified live collaboration channel
									</p>
								</div>
							</div>
							<div className={styles.rosterStats}>
								<Badge
									size="sm"
									variant="soft"
									color={channelScope === "team" ? "primary" : "default"}
								>
									{channelScope === "team" ? "active" : "global"}
								</Badge>
								<span>{taskItems.length} tasks</span>
							</div>
						</button>
						{profileRoster.map((entry) => {
							const activeFilter = channelScope === entry.profileId;
							const profileData = resolvedProfiles[entry.profileId];
							return (
								<button
									key={entry.profileId}
									type="button"
									onClick={() => applyChannelScope(entry.profileId)}
									className={cn(
										styles.rosterItem,
										activeFilter && styles.rosterItemActive,
									)}
								>
									<div className={styles.rosterIdentity}>
										<AgentPixelMark
											profileId={entry.profileId}
											size={30}
											detailLevel="auto"
											state={
												profileStateById[entry.profileId] ??
												(entry.active ? "running" : "idle")
											}
										/>
										<div>
											<p className={styles.rosterName}>{profileData.name}</p>
											<p className={styles.rosterMeta}>{profileData.tagline}</p>
										</div>
									</div>
									<div className={styles.rosterStats}>
										<Badge
											size="sm"
											variant="soft"
											color={
												entry.warningCount > 0
													? "warning"
													: entry.active
														? "success"
														: "default"
											}
										>
											{entry.warningCount > 0
												? "review"
												: entry.active
													? "running"
													: "idle"}
										</Badge>
										<span>{entry.assignedCount} tasks</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>

				<div className={styles.railCard}>
					<div className={styles.railHeaderRow}>
						<HStack gap={2} align="center">
							<ClipboardList size={14} />
							<Text size="xs" weight="semibold" className={styles.railEyebrow}>
								Task queue
							</Text>
						</HStack>
						{showQueueRefreshSpinner ? (
							<Loader2 size={12} className={styles.spin} />
						) : (
							<button
								type="button"
								onClick={() => void refreshWorkflowData(true)}
								className={styles.inlineGhostButton}
							>
								<RefreshCw size={12} />
							</button>
						)}
					</div>

					<div className={styles.priorityBubbleRow}>
						{(["critical", "high", "medium", "low"] as AgentTaskPriority[]).map(
							(priority) => (
								<button
									key={priority}
									type="button"
									onClick={() =>
										setPriorityFilter((current) =>
											current === priority ? "all" : priority,
										)
									}
									className={cn(
										styles.priorityBubble,
										priorityFilter === priority && styles.priorityBubbleActive,
									)}
								>
									<span className={styles.priorityLabel}>{priority}</span>
									<span className={styles.priorityCount}>
										{priorityCounts[priority]}
									</span>
								</button>
							),
						)}
					</div>

					<div className={styles.statusFilterRow}>
						{STATUS_FILTERS.map((filterValue) => (
							<button
								key={filterValue}
								type="button"
								onClick={() => setStatusFilter(filterValue)}
								className={cn(
									styles.statusFilterButton,
									statusFilter === filterValue &&
										styles.statusFilterButtonActive,
								)}
							>
								{filterValue === "all" ? "all" : filterValue.replace("_", " ")}
							</button>
						))}
					</div>

					<div className={styles.filterGrid}>
						<label className={styles.filterField} htmlFor="queue-profile-filter">
							<span>profile</span>
							<select
								id="queue-profile-filter"
								name="queue_profile_filter"
								value={queueProfileFilter}
								onChange={(event) =>
									setQueueProfileFilter(
										event.target.value as QueueProfileFilter,
									)
								}
							>
								<option value="all">all profiles</option>
								{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => (
									<option key={id} value={id}>
										{resolvedProfiles[id].name}
									</option>
								))}
							</select>
						</label>
						<label className={styles.filterField} htmlFor="queue-run-filter">
							<span>run</span>
							<select
								id="queue-run-filter"
								name="queue_run_filter"
								value={queueRunFilter}
								onChange={(event) => setQueueRunFilter(event.target.value)}
							>
								<option value="all">all runs</option>
								{availableRunIds.map((runId) => (
									<option key={runId} value={runId}>
										{runConversationTitle(runId)}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className={styles.queueList}>
						{filteredQueueTasks.length === 0 ? (
							<div className={styles.emptyQueue}>
								<Text size="xs" color="muted">
									No queued tasks match your filters.
								</Text>
							</div>
						) : (
							filteredQueueTasks.slice(0, 16).map((task) => (
								<button
									key={task.taskId}
									type="button"
									className={cn(styles.queueItem, styles.queueItemButton)}
									onClick={() => {
										if (task.runId) {
											openGeneralRunConversation(task.runId, { focus: true });
										}
									}}
								>
									<HStack
										gap={2}
										align="center"
										className={styles.queueItemHeader}
									>
										<Badge
											size="sm"
											variant="soft"
											color={priorityColor(task.priority)}
										>
											{task.priority}
										</Badge>
										<Badge
											size="sm"
											variant="outline"
											color={statusColor(task.status)}
										>
											{task.status.replace("_", " ")}
										</Badge>
									</HStack>
									<p className={styles.queueItemTitle}>{task.title}</p>
									<p className={styles.queueItemMeta}>
										{task.assigneeProfile} | run {shortRunId(task.runId)}
									</p>
								</button>
							))
						)}
					</div>
				</div>
			</div>

			<div className={styles.centerRail}>
				<div className={styles.centerHeader}>
					<div className={styles.centerHeaderMain}>
						<div className={styles.profileIdentity}>
							<AgentPixelMark
								profileId={scopeProfileId}
								size={44}
								detailLevel="auto"
								state={centerAvatarState}
							/>
							<div>
								<p className={styles.headerEyebrow}>Command channel</p>
								<p className={styles.headerChannelName}>{channelLabel}</p>
								<p className={styles.headerRouteLabel}>{profileRouteLabel}</p>
							</div>
						</div>
						<div className={styles.centerHeaderMetrics}>
							<Badge
								size="sm"
								variant="soft"
								color={healthy ? "success" : "danger"}
							>
								{healthy ? "online" : "offline"}
							</Badge>
							<Badge
								size="sm"
								variant="soft"
								color={paired ? "primary" : "warning"}
							>
								{paired ? "paired" : "unpaired"}
							</Badge>
							<Badge size="sm" variant="outline" color="default">
								{conversationCount} conv
							</Badge>
							<Badge size="sm" variant="outline" color="default">
								{activeMessageCount} msgs
							</Badge>
						</div>
					</div>

					<div className={styles.centerHeaderActions}>
						<IconButton
							icon={focusMode ? <Minimize2 size={16} /> : <Expand size={16} />}
							aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
							variant="ghost"
							size="sm"
							onClick={() => setFocusMode((value) => !value)}
							className={styles.headerIconButton}
						/>
						<IconButton
							icon={<Settings2 size={16} />}
							aria-label="Agent settings"
							variant="ghost"
							size="sm"
							onClick={() => navigate("/app/settings")}
							className={styles.headerIconButton}
						/>
					</div>
				</div>

				<div className={styles.threadStrip}>
					{channelScope !== "team" ? (
						<button
							type="button"
							onClick={handleNewConversation}
							className={styles.threadNewButton}
						>
							<Plus size={13} />
							<span>New conversation</span>
						</button>
					) : (
						<div className={styles.threadStaticLabel}>
							<span>Run threads</span>
						</div>
					)}
					<div className={styles.threadList}>
						{visibleConversations.map((conversation) => (
							<div
								key={conversation.id}
								className={cn(
									styles.threadItem,
									conversation.id === activeConvId && styles.threadItemActive,
								)}
							>
								<button
									type="button"
									onClick={() => setActiveConvId(conversation.id)}
									className={styles.threadSelectButton}
								>
									<p>{conversation.title}</p>
									<span>
										{conversation.runId
											? `run ${shortRunId(conversation.runId)}`
											: `${conversation.messages.length} msg`}
									</span>
								</button>
								{channelScope !== "team" ? (
									<button
										type="button"
										onClick={() => handleDeleteConversation(conversation.id)}
										className={styles.threadDeleteButton}
										aria-label="Delete conversation"
									>
										<Trash2 size={13} />
									</button>
								) : null}
							</div>
						))}
					</div>
				</div>

				<div className={styles.transcriptRegion}>
					{activeConv && activeConv.messages.length > 0 ? (
						<AgentChatMessages
							messages={activeConv.messages}
							defaultProfileId={scopeProfileId}
							thinkingProfileId={thinkingProfileId}
							isThinking={isThinking}
							thinkingContent={thinkingContent}
							baseAvatarState={assistantBaseState}
						/>
					) : (
						<EmptyState
							profile={profile}
							profileId={scopeProfileId}
							templates={templates}
							isReady={isReady}
							avatarState={centerAvatarState}
							onTemplateClick={(prompt) => {
								if (!isReady) return;
								setComposerMode("direct");
								void handleDirectSend(prompt);
							}}
						/>
					)}
				</div>

				<div className={styles.composerDock}>
					<AgentChatComposer
						mode={composerMode}
						onModeChange={setComposerMode}
						onSend={handleComposerSend}
						disabled={!isReady || (composerMode === "direct" && directThinking)}
						isStreaming={composerMode === "direct" && directThinking}
						onCancel={composerMode === "direct" ? handleCancel : undefined}
						runModeDisabled={!agentService.usesBroker()}
						templates={
							composerMode === "run"
								? []
								: activeConv?.messages.length
									? []
									: templates.slice(0, 4)
						}
					/>
				</div>

				<div className={styles.orchestrationDock}>
					<AgentOrchestrationPanel
						healthy={healthy}
						paired={paired}
						objective={orchestrationObjective}
						runStartSignal={orchestrationRunStartSignal}
						onRunStarted={handleOrchestrationRunStarted}
						onRunEvent={handleOrchestrationRunEvent}
						onRunStatusChange={handleOrchestrationRunStatusChange}
						onRunCleared={handleOrchestrationRunCleared}
					/>
				</div>
			</div>

			<div className={styles.rightRail}>
				<div className={styles.railCard}>
					<HStack gap={2} align="center" className={styles.railHeaderRow}>
						<Network size={14} />
						<Text size="xs" weight="semibold" className={styles.railEyebrow}>
							Agent network
						</Text>
					</HStack>
					<div className={styles.networkSurface}>
						<svg
							className={styles.networkLines}
							viewBox="0 0 240 180"
							aria-hidden
						>
							<line x1="120" y1="34" x2="58" y2="94" />
							<line x1="120" y1="34" x2="120" y2="126" />
							<line x1="120" y1="34" x2="182" y2="94" />
							<line x1="58" y1="94" x2="182" y2="94" />
							<line x1="58" y1="94" x2="120" y2="126" />
							<line x1="182" y1="94" x2="120" y2="126" />
							<line x1="58" y1="94" x2="36" y2="136" />
							<line x1="120" y1="126" x2="36" y2="136" />
							<line x1="182" y1="94" x2="204" y2="136" />
							<line x1="120" y1="126" x2="204" y2="136" />
						</svg>
						{[
							{ profileId: "koro" as AgentProfileId, x: 120, y: 34 },
							{ profileId: "devstral" as AgentProfileId, x: 58, y: 94 },
							{ profileId: "sentinel" as AgentProfileId, x: 182, y: 94 },
							{ profileId: "forge" as AgentProfileId, x: 120, y: 126 },
							{ profileId: "gridsage" as AgentProfileId, x: 36, y: 136 },
							{ profileId: "draftsmith" as AgentProfileId, x: 204, y: 136 },
						].map((node) => {
							const queued = taskItems.filter(
								(task) =>
									task.assigneeProfile === node.profileId &&
									OPEN_QUEUE_STATUSES.includes(task.status),
							).length;
							const nodeState =
								profileStateById[node.profileId] ??
								resolveAgentMarkState({
									error: !healthy,
									waiting: healthy && !paired,
									running: queued > 0,
								});
							return (
								<button
									key={node.profileId}
									type="button"
									onClick={() => applyChannelScope(node.profileId)}
									className={cn(
										styles.networkNode,
										styles.networkNodeButton,
										channelScope === node.profileId && styles.networkNodeActive,
									)}
									style={{ left: `${node.x}px`, top: `${node.y}px` }}
								>
									<AgentPixelMark
										profileId={node.profileId}
										size={34}
										detailLevel="auto"
										state={nodeState}
									/>
									{queued > 0 ? (
										<span className={styles.networkCount}>{queued}</span>
									) : null}
								</button>
							);
						})}
					</div>
				</div>

				<div className={styles.railCard}>
					<div className={styles.railHeaderRow}>
						<Text size="xs" weight="semibold" className={styles.railEyebrow}>
							Review inbox
						</Text>
						<Badge size="sm" variant="soft" color="warning">
							{reviewInboxTasks.length}
						</Badge>
					</div>

					<div className={styles.reviewList}>
						{reviewInboxTasks.length === 0 ? (
							<div className={styles.emptyQueue}>
								<Text size="xs" color="muted">
									No tasks waiting for review.
								</Text>
							</div>
						) : (
							reviewInboxTasks.slice(0, 8).map((task) => (
								<div key={task.taskId} className={styles.reviewItem}>
									<HStack
										gap={2}
										align="center"
										className={styles.reviewMetaRow}
									>
										<Badge
											size="sm"
											variant="soft"
											color={priorityColor(task.priority)}
										>
											{task.priority}
										</Badge>
										<Text size="xs" color="muted">
											{task.assigneeProfile}
										</Text>
									</HStack>
									<p className={styles.reviewTitle}>{task.title}</p>
									{task.description ? (
										<p className={styles.reviewDescription}>
											{truncateText(task.description, 220)}
										</p>
									) : null}
									<textarea
										id={`review-note-${task.taskId}`}
										name={`review_note_${task.taskId}`}
										value={reviewNotes[task.taskId] || ""}
										onChange={(event) =>
											setReviewNotes((current) => ({
												...current,
												[task.taskId]: event.target.value,
											}))
										}
										rows={2}
										placeholder="Optional reviewer note"
										className={styles.reviewNoteInput}
									/>
									<div className={styles.reviewActions}>
										<button
											type="button"
											onClick={() =>
												void handleReviewAction(task.taskId, "approve")
											}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(
												styles.reviewActionButton,
												styles.reviewApprove,
											)}
										>
											<Check size={12} />
											Approve
										</button>
										<button
											type="button"
											onClick={() =>
												void handleReviewAction(task.taskId, "rework")
											}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(
												styles.reviewActionButton,
												styles.reviewRework,
											)}
										>
											<Undo2 size={12} />
											Rework
										</button>
										<button
											type="button"
											onClick={() =>
												void handleReviewAction(task.taskId, "defer")
											}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(
												styles.reviewActionButton,
												styles.reviewDefer,
											)}
										>
											<WifiOff size={12} />
											Defer
										</button>
									</div>
								</div>
							))
						)}
					</div>
				</div>

				<div className={styles.railCard}>
					<div className={styles.railHeaderRow}>
						<Text size="xs" weight="semibold" className={styles.railEyebrow}>
							Unified activity
						</Text>
					</div>
					<div className={styles.filterGrid}>
						<label className={styles.filterField} htmlFor="activity-profile-filter">
							<span>profile</span>
							<select
								id="activity-profile-filter"
								name="activity_profile_filter"
								value={activityProfileFilter}
								onChange={(event) =>
									setActivityProfileFilter(
										event.target.value as QueueProfileFilter,
									)
								}
							>
								<option value="all">all profiles</option>
								{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => (
									<option key={id} value={id}>
										{resolvedProfiles[id].name}
									</option>
								))}
							</select>
						</label>
						<label className={styles.filterField} htmlFor="activity-run-filter">
							<span>run</span>
							<select
								id="activity-run-filter"
								name="activity_run_filter"
								value={activityRunFilter}
								onChange={(event) => setActivityRunFilter(event.target.value)}
							>
								<option value="all">all runs</option>
								{availableRunIds.map((runId) => (
									<option key={runId} value={runId}>
										{runConversationTitle(runId)}
									</option>
								))}
							</select>
						</label>
						<label className={styles.filterField} htmlFor="activity-source-filter">
							<span>source</span>
							<select
								id="activity-source-filter"
								name="activity_source_filter"
								value={activitySourceFilter}
								onChange={(event) =>
									setActivitySourceFilter(
										event.target.value as ActivitySourceFilter,
									)
								}
							>
								<option value="all">all sources</option>
								<option value="run">run</option>
								<option value="task">task</option>
								<option value="review">review</option>
							</select>
						</label>
					</div>
					<div className={styles.activityList}>
						{filteredActivityItems.length === 0 ? (
							<div className={styles.emptyQueue}>
								<Text size="xs" color="muted">
									No activity yet. Start an orchestration run to generate
									events.
								</Text>
							</div>
						) : (
							filteredActivityItems.slice(0, 60).map((item) => (
								<button
									key={item.activityId}
									type="button"
									className={cn(styles.activityItem, styles.activityItemButton)}
									onClick={() => {
										if (item.runId) {
											openGeneralRunConversation(item.runId, { focus: true });
										}
									}}
								>
									<div className={styles.activityItemMeta}>
										<Badge size="sm" variant="soft" color={activityTone(item)}>
											{item.source}
										</Badge>
										<span>{formatTimestamp(item.createdAt)}</span>
									</div>
									<p className={styles.activityMessage}>{item.message}</p>
									<p className={styles.activityContext}>
										{item.profileId ? `${item.profileId} | ` : ""}
										{item.eventType}
										{item.runId ? ` | run ${shortRunId(item.runId)}` : ""}
									</p>
									{(() => {
										const detail = deriveActivityDetail(item);
										if (!detail) return null;
										return (
											<>
												{detail.meta ? (
													<p className={styles.activityDetailMeta}>
														{detail.meta}
													</p>
												) : null}
												{detail.text ? (
													<p
														title={detail.text}
														className={cn(
															styles.activityDetail,
															detail.isError && styles.activityDetailError,
														)}
													>
														{truncateText(
															detail.text,
															ACTIVITY_DETAIL_PREVIEW_CHARS,
														)}
													</p>
												) : null}
											</>
										);
									})()}
								</button>
							))
						)}
					</div>
				</div>
			</div>

			{workflowError ? (
				<div className={styles.workflowErrorBanner}>
					<AlertCircle size={14} />
					<span>{workflowError}</span>
				</div>
			) : null}
		</Panel>
	);
}

function EmptyState({
	profile,
	profileId,
	templates,
	isReady,
	avatarState,
	onTemplateClick,
}: {
	profile: { name: string; tagline: string; focus: string };
	profileId: AgentProfileId;
	templates: Array<{ label: string; prompt: string }>;
	isReady: boolean;
	avatarState: AgentMarkState;
	onTemplateClick: (prompt: string) => void;
}) {
	return (
		<div className={styles.emptyRoot}>
			<div className={styles.emptyAmbient} />
			<div className={styles.emptyContent}>
				<div className={styles.emptyAvatarWrap}>
					<AgentPixelMark
						profileId={profileId}
						size={176}
						detailLevel="auto"
						state={avatarState}
					/>
				</div>
				<h2 className={styles.emptyTitle}>{profile.name}</h2>
				<p className={styles.emptyTagline}>{profile.tagline}</p>
				<p className={styles.emptyFocus}>{profile.focus}</p>

				{!isReady ? (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillWarning)}
					>
						<WifiOff size={14} className={styles.warningIcon} />
						<Text size="sm" color="warning">
							Waiting for connection...
						</Text>
					</HStack>
				) : (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillSuccess)}
					>
						<div className={styles.readyDot} />
						<Text size="sm" color="success">
							Ready to assist
						</Text>
					</HStack>
				)}

				{templates.length > 0 && isReady && (
					<div className={styles.templateGrid}>
						{templates.slice(0, 4).map((template) => (
							<button
								key={template.label}
								type="button"
								onClick={() => onTemplateClick(template.prompt)}
								className={styles.templateCard}
							>
								<Zap size={14} />
								<span>{template.label}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
