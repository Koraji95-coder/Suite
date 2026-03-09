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
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatMessages } from "./AgentChatMessages";
import styles from "./AgentChatPanel.module.css";
import {
	sanitizeActivityItems,
	sanitizeTaskItems,
} from "./agentPanelSanitizers";
import {
	type AgentChannelScope,
	isAgentProfileScope,
} from "./agentChannelScope";
import { AgentOrchestrationPanel } from "./AgentOrchestrationPanel";
import { AgentPixelMark } from "./AgentPixelMark";
import {
	type AgentMarkState,
	resolveAgentMarkState,
} from "./agentMarkState";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
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

function priorityColor(priority: AgentTaskPriority): "danger" | "warning" | "primary" | "default" {
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

function statusColor(status: AgentTaskStatus): "success" | "warning" | "danger" | "primary" | "default" {
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

function activityTone(item: AgentActivityItem): "success" | "warning" | "danger" | "primary" | "default" {
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
			if (stored && stored in AGENT_PROFILES) return stored as AgentChannelScope;
		} catch {
			/* noop */
		}
		return "team";
	});
	const [focusMode, setFocusMode] = useState(false);
	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [activeConvId, setActiveConvId] = useState<string | null>(null);
	const [isThinking, setIsThinking] = useState(false);

	const [taskItems, setTaskItems] = useState<AgentTaskItem[]>([]);
	const [activityItems, setActivityItems] = useState<AgentActivityItem[]>([]);
	const [workflowLoading, setWorkflowLoading] = useState(false);
	const [workflowInitialLoadDone, setWorkflowInitialLoadDone] = useState(false);
	const [workflowError, setWorkflowError] = useState("");
	const [reviewBusyTaskId, setReviewBusyTaskId] = useState("");
	const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
	const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
	const [priorityFilter, setPriorityFilter] = useState<QueuePriorityFilter>("all");
	const [profileSuccessUntil, setProfileSuccessUntil] = useState<
		Partial<Record<AgentProfileId, number>>
	>({});
	const seenActivityIdsRef = useRef<Set<string>>(new Set());
	const mountedRef = useRef(true);
	const workflowRefreshEpochRef = useRef(0);
	const workflowRefreshInFlightRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
			workflowRefreshEpochRef.current += 1;
		};
	}, []);

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
		setActiveConvId(convs[0]?.id ?? null);
		try {
			localStorage.setItem(
				ACTIVE_AGENT_STORAGE_KEY,
				channelScope === "team" ? profileId : channelScope,
			);
			localStorage.setItem(
				CHANNEL_SCOPE_STORAGE_KEY,
				conversationScope,
			);
		} catch {
			/* noop */
		}
	}, [channelScope, profileId]);

	const activeConv = useMemo(
		() => conversations.find((conversation) => conversation.id === activeConvId) ?? null,
		[conversations, activeConvId],
	);
	const scopeProfileId: AgentProfileId = isAgentProfileScope(channelScope)
		? channelScope
		: "koro";
	const scopeProfile = AGENT_PROFILES[scopeProfileId];
	const profile =
		channelScope === "team"
			? {
					name: "Team Home",
					tagline: "Unified multi-agent command view",
					focus: "Monitor collaboration, queue, and review flow across all agents.",
				}
			: scopeProfile;
	const templates = getAgentTaskTemplates(scopeProfileId);
	const profileRouteLabel =
		channelScope === "team"
			? `Coordinator ${scopeProfile.name} · aggregated channel`
			: scopeProfile.modelFallbacks.length
				? `Model ${scopeProfile.modelPrimary} (fallback ${scopeProfile.modelFallbacks[0]})`
				: `Model ${scopeProfile.modelPrimary}`;
	const channelLabel =
		channelScope === "team" ? "Team Home" : scopeProfile.name;

	const refreshConversations = useCallback(() => {
		const next = agentTaskManager.getConversations();
		setConversations(next);
	}, []);

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
			channelScope === "team" ? "Team Home conversation" : undefined,
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

	const handleSend = useCallback(
		async (message: string) => {
			if (!healthy || !paired) return;
			const outboundProfileId: AgentProfileId =
				channelScope === "team" ? "koro" : scopeProfileId;
			const outboundMessage =
				channelScope === "team" ? `[team-home]\n${message}` : message;

			let conversationId = activeConvId;
			if (!conversationId) {
				const created = agentTaskManager.createConversation(
					channelScope === "team" ? "team" : scopeProfileId,
					channelScope === "team" ? "Team Home conversation" : undefined,
				);
				agentTaskManager.saveConversation(created);
				conversationId = created.id;
				setActiveConvId(conversationId);
			}

			agentTaskManager.addMessageToConversation(conversationId, "user", message);
			refreshConversations();

			setIsThinking(true);
			try {
				const response = await agentService.sendMessage(outboundMessage, {
					profileId: outboundProfileId,
				});
				const reply = response.success
					? typeof response.data === "object"
						? JSON.stringify(response.data, null, 2)
						: String(response.data ?? "Task completed.")
					: response.error || "Request failed.";
				if (mountedRef.current) {
					setIsThinking(false);
				}
				agentTaskManager.addMessageToConversation(conversationId, "assistant", reply);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred.";
				if (mountedRef.current) {
					setIsThinking(false);
				}
				agentTaskManager.addMessageToConversation(
					conversationId,
					"assistant",
					errorMessage,
				);
			} finally {
				if (mountedRef.current) {
					setIsThinking(false);
					refreshConversations();
				}
			}
		},
		[
			healthy,
			paired,
			channelScope,
			scopeProfileId,
			activeConvId,
			refreshConversations,
		],
	);

	const refreshWorkflowData = useCallback((silent = false) => {
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
			return Promise.resolve();
		}
		if (!silent && mountedRef.current) {
			setWorkflowLoading(true);
		}

		const requestPromise = (async () => {
			try {
				const [tasksResult, activityResult] = await Promise.all([
					agentService.listAgentTasks({ limit: 240 }),
					agentService.getAgentActivity({ limit: 240 }),
				]);
				if (!mountedRef.current || epoch !== workflowRefreshEpochRef.current) {
					return;
				}

				const normalizedTasks = sanitizeTaskItems(tasksResult.tasks);
				const normalizedActivity = sanitizeActivityItems(activityResult.activity);

				if (tasksResult.success) {
					setTaskItems(normalizedTasks);
				} else {
					logger.warn("Task queue refresh returned unsuccessful response.", "AgentChatPanel", {
						stage: "refreshWorkflowData.tasks",
						scope: channelScope,
						activeProfile: scopeProfileId,
						error: tasksResult.error,
					});
					setWorkflowError(tasksResult.error || "Unable to load task queue.");
				}

				if (activityResult.success) {
					setActivityItems(normalizedActivity);
				} else if (!tasksResult.success) {
					logger.warn("Activity refresh returned unsuccessful response.", "AgentChatPanel", {
						stage: "refreshWorkflowData.activity",
						scope: channelScope,
						activeProfile: scopeProfileId,
						error: activityResult.error,
					});
					setWorkflowError(
						activityResult.error || "Unable to load unified activity feed.",
					);
				}

				if (tasksResult.success && activityResult.success) {
					setWorkflowError("");
				}
			} catch (error) {
				logger.error("Workflow refresh crashed.", "AgentChatPanel", {
					stage: "refreshWorkflowData.exception",
					scope: channelScope,
					activeProfile: scopeProfileId,
					silent,
					error,
				});
				if (!mountedRef.current || epoch !== workflowRefreshEpochRef.current) {
					return;
				}
				setWorkflowError(
					error instanceof Error
						? error.message
						: "Unable to load workflow data right now.",
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
	}, [channelScope, scopeProfileId]);

	useEffect(() => {
		void refreshWorkflowData();

		const interval = window.setInterval(() => {
			void refreshWorkflowData(true);
		}, 15_000);
		const onFocus = () => {
			void refreshWorkflowData(true);
		};
		const onPairingState = () => {
			void refreshWorkflowData(true);
		};
		window.addEventListener("focus", onFocus);
		window.addEventListener(
			AGENT_PAIRING_STATE_EVENT,
			onPairingState as EventListener,
		);
		return () => {
			window.clearInterval(interval);
			window.removeEventListener("focus", onFocus);
			window.removeEventListener(
				AGENT_PAIRING_STATE_EVENT,
				onPairingState as EventListener,
			);
		};
	}, [refreshWorkflowData]);

	useEffect(() => {
		for (const item of activityItems) {
			const activityId = String(item.activityId || "").trim();
			if (!activityId || seenActivityIdsRef.current.has(activityId)) continue;
			seenActivityIdsRef.current.add(activityId);

			const eventType = String(item.eventType || "").toLowerCase();
			if (
				!(eventType.includes("approved") || eventType.includes("completed"))
			) {
				continue;
			}
			const profile = String(item.profileId || "").trim();
			if (!profile || !(profile in AGENT_PROFILES)) continue;
			markProfileSuccess(profile as AgentProfileId);
		}
	}, [activityItems, markProfileSuccess]);

	const isReady = healthy && paired;
	const showQueueRefreshSpinner = workflowLoading && !workflowInitialLoadDone;

	const scopedTaskItems = useMemo(
		() =>
			channelScope === "team"
				? taskItems
				: taskItems.filter((task) => task.assigneeProfile === scopeProfileId),
		[channelScope, taskItems, scopeProfileId],
	);
	const scopedActivityItems = useMemo(
		() =>
			channelScope === "team"
				? activityItems
				: activityItems.filter((item) => item.profileId === scopeProfileId),
		[channelScope, activityItems, scopeProfileId],
	);

	const queueTasks = useMemo(
		() => scopedTaskItems.filter((task) => OPEN_QUEUE_STATUSES.includes(task.status)),
		[scopedTaskItems],
	);
	const globalQueueTasks = useMemo(
		() => taskItems.filter((task) => OPEN_QUEUE_STATUSES.includes(task.status)),
		[taskItems],
	);

	const filteredQueueTasks = useMemo(() => {
		return [...queueTasks]
			.filter((task) =>
				statusFilter === "all" ? true : task.status === statusFilter,
			)
			.filter((task) =>
				priorityFilter === "all" ? true : task.priority === priorityFilter,
			)
			.sort((left, right) => {
				const priorityDelta =
					PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
				if (priorityDelta !== 0) return priorityDelta;
				return String(right.createdAt || "").localeCompare(
					String(left.createdAt || ""),
				);
			});
	}, [queueTasks, statusFilter, priorityFilter]);

	const reviewInboxTasks = useMemo(
		() => scopedTaskItems.filter((task) => task.status === "awaiting_review"),
		[scopedTaskItems],
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
			const assigned = globalQueueTasks.filter(
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
	}, [globalQueueTasks]);

	const handleReviewAction = useCallback(
		async (taskId: string, action: AgentReviewAction) => {
			setReviewBusyTaskId(taskId);
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
		],
	);

	const conversationCount = conversations.length;
	const activeMessageCount = activeConv?.messages.length ?? 0;
	const now = Date.now();
	const hasRunningQueue = queueTasks.some((task) =>
		RUNNING_TASK_STATUSES.includes(task.status),
	);
	const hasReviewWarnings = queueTasks.some((task) =>
		REVIEW_WARNING_STATUSES.includes(task.status),
	);
	const activeProfileSuccess =
		channelScope === "team" ? false : (profileSuccessUntil[scopeProfileId] ?? 0) > now;
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
					(channelScope !== "team" && id === scopeProfileId && isThinking),
				warning: Boolean(rosterEntry?.warningCount),
				success: (profileSuccessUntil[id] ?? 0) > currentTime,
				focus: channelScope !== "team" && id === scopeProfileId && healthy && paired,
			});
		}
		return next;
	}, [
		profileRoster,
		healthy,
		paired,
		channelScope,
		scopeProfileId,
		isThinking,
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
									<p className={styles.rosterName}>Team Home</p>
									<p className={styles.rosterMeta}>
										Unified multi-agent command channel
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
							const profileData = AGENT_PROFILES[entry.profileId];
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
									statusFilter === filterValue && styles.statusFilterButtonActive,
								)}
							>
								{filterValue === "all" ? "all" : filterValue.replace("_", " ")}
							</button>
						))}
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
								<div key={task.taskId} className={styles.queueItem}>
									<HStack gap={2} align="center" className={styles.queueItemHeader}>
										<Badge size="sm" variant="soft" color={priorityColor(task.priority)}>
											{task.priority}
										</Badge>
										<Badge size="sm" variant="outline" color={statusColor(task.status)}>
											{task.status.replace("_", " ")}
										</Badge>
									</HStack>
									<p className={styles.queueItemTitle}>{task.title}</p>
									<p className={styles.queueItemMeta}>
										{task.assigneeProfile} · run {shortRunId(task.runId)}
									</p>
								</div>
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
							<Badge size="sm" variant="soft" color={healthy ? "success" : "danger"}>
								{healthy ? "online" : "offline"}
							</Badge>
							<Badge size="sm" variant="soft" color={paired ? "primary" : "warning"}>
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
					<button
						type="button"
						onClick={handleNewConversation}
						className={styles.threadNewButton}
					>
						<Plus size={13} />
						<span>New conversation</span>
					</button>
					<div className={styles.threadList}>
						{conversations.map((conversation) => (
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
									<span>{conversation.messages.length} msg</span>
								</button>
								<button
									type="button"
									onClick={() => handleDeleteConversation(conversation.id)}
									className={styles.threadDeleteButton}
									aria-label="Delete conversation"
								>
									<Trash2 size={13} />
								</button>
							</div>
						))}
					</div>
				</div>

				<div className={styles.transcriptRegion}>
					{activeConv && activeConv.messages.length > 0 ? (
						<AgentChatMessages
							messages={activeConv.messages}
							profileId={scopeProfileId}
							isThinking={isThinking}
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
								if (isReady) handleSend(prompt);
							}}
						/>
					)}
				</div>

				<div className={styles.composerDock}>
					<AgentChatComposer
						onSend={handleSend}
						disabled={!isReady || isThinking}
						templates={activeConv?.messages.length ? [] : templates.slice(0, 4)}
					/>
				</div>

				<div className={styles.orchestrationDock}>
					<AgentOrchestrationPanel healthy={healthy} paired={paired} />
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
							<line x1="182" y1="94" x2="204" y2="136" />
							<line x1="120" y1="126" x2="204" y2="136" />
						</svg>
						{[
							{ profileId: "koro" as AgentProfileId, x: 120, y: 34 },
							{ profileId: "devstral" as AgentProfileId, x: 58, y: 94 },
							{ profileId: "sentinel" as AgentProfileId, x: 182, y: 94 },
							{ profileId: "forge" as AgentProfileId, x: 120, y: 126 },
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
									{queued > 0 ? <span className={styles.networkCount}>{queued}</span> : null}
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
									<HStack gap={2} align="center" className={styles.reviewMetaRow}>
										<Badge size="sm" variant="soft" color={priorityColor(task.priority)}>
											{task.priority}
										</Badge>
										<Text size="xs" color="muted">
											{task.assigneeProfile}
										</Text>
									</HStack>
									<p className={styles.reviewTitle}>{task.title}</p>
									<textarea
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
											onClick={() => void handleReviewAction(task.taskId, "approve")}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(styles.reviewActionButton, styles.reviewApprove)}
										>
											<Check size={12} />
											Approve
										</button>
										<button
											type="button"
											onClick={() => void handleReviewAction(task.taskId, "rework")}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(styles.reviewActionButton, styles.reviewRework)}
										>
											<Undo2 size={12} />
											Rework
										</button>
										<button
											type="button"
											onClick={() => void handleReviewAction(task.taskId, "defer")}
											disabled={reviewBusyTaskId === task.taskId}
											className={cn(styles.reviewActionButton, styles.reviewDefer)}
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
					<div className={styles.activityList}>
						{scopedActivityItems.length === 0 ? (
							<div className={styles.emptyQueue}>
								<Text size="xs" color="muted">
									No activity yet. Start an orchestration run to generate events.
								</Text>
							</div>
						) : (
							scopedActivityItems.slice(0, 60).map((item) => (
								<div key={item.activityId} className={styles.activityItem}>
									<div className={styles.activityItemMeta}>
										<Badge size="sm" variant="soft" color={activityTone(item)}>
											{item.source}
										</Badge>
										<span>{formatTimestamp(item.createdAt)}</span>
									</div>
									<p className={styles.activityMessage}>{item.message}</p>
									<p className={styles.activityContext}>
										{item.profileId ? `${item.profileId} · ` : ""}
										{item.runId ? `run ${shortRunId(item.runId)}` : item.eventType}
									</p>
								</div>
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
