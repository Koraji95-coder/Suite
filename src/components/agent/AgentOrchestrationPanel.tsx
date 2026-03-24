import {
	Bot,
	Loader2,
	PauseCircle,
	Play,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import type { AgentTaskItem } from "@/services/agent/types";
import { type AgentRunSnapshot, agentService } from "@/services/agentService";
import styles from "./AgentOrchestrationPanel.module.css";
import { AgentPixelMark } from "./AgentPixelMark";
import { type AgentMarkState, resolveAgentMarkState } from "./agentMarkState";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfileId,
} from "./agentProfiles";

type RunStatus =
	| "idle"
	| "queued"
	| "running"
	| "cancel_requested"
	| "completed"
	| "failed"
	| "cancelled";

type StreamState = "idle" | "connecting" | "live" | "error";

export type OrchestrationEvent = {
	id: number;
	eventType: string;
	stage: string;
	profileId: string;
	requestId: string;
	message: string;
	createdAt: string;
	payload: Record<string, unknown>;
};

export type AgentOrchestrationRunStatus =
	| "idle"
	| "queued"
	| "running"
	| "cancel_requested"
	| "completed"
	| "failed"
	| "cancelled";

export interface AgentOrchestrationRunStartedPayload {
	runId: string;
	requestId: string;
	objective: string;
	profiles: AgentProfileId[];
	status: AgentOrchestrationRunStatus;
}

export interface AgentOrchestrationRunEventPayload {
	runId: string;
	event: OrchestrationEvent;
}

export interface AgentOrchestrationRunStatusPayload {
	runId: string;
	status: AgentOrchestrationRunStatus;
}

const DEFAULT_OBJECTIVE =
	"Coordinate a reliability review for my active feature. Return concrete implementation steps, high-risk findings, and validation checks.";

const DEFAULT_PROFILES: AgentProfileId[] = [
	"devstral",
	"sentinel",
	"forge",
	"draftsmith",
];
const TERMINAL_STATUSES = new Set<RunStatus>([
	"completed",
	"failed",
	"cancelled",
]);
const TERMINAL_EVENT_TYPES = new Set([
	"run_completed",
	"run_failed",
	"run_cancelled",
]);
const STREAM_RETRY_BASE_MS = 800;
const STREAM_RETRY_MAX_MS = 10_000;
const MAX_TIMELINE_EVENTS = 400;
const REFRESH_POLL_INTERVAL_MS = 5_000;
const ORCHESTRATION_STORAGE_KEY = "agent-last-orchestration-run";
const ORCHESTRATION_DEBUG_ENABLED = /^(1|true|yes)$/i.test(
	String(import.meta.env.VITE_AGENT_DEBUG_ORCHESTRATION || "").trim(),
);

type RunTaskSummary = {
	total: number;
	queued: number;
	running: number;
	awaitingReview: number;
	approved: number;
	reworkRequested: number;
	deferred: number;
};

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function parseEvents(snapshot?: AgentRunSnapshot): OrchestrationEvent[] {
	const raw = snapshot?.messages;
	if (!Array.isArray(raw)) return [];
	const parsed: OrchestrationEvent[] = [];
	const seenIds = new Set<number>();
	for (const row of raw) {
		const item = asRecord(row);
		const id = Number(item.id ?? 0);
		if (!Number.isFinite(id) || id <= 0) continue;
		if (seenIds.has(id)) continue;
		seenIds.add(id);
		parsed.push({
			id,
			eventType: String(item.eventType ?? "event"),
			stage: String(item.stage ?? ""),
			profileId: String(item.profileId ?? ""),
			requestId: String(item.requestId ?? ""),
			message: String(item.message ?? ""),
			createdAt: String(item.createdAt ?? ""),
			payload: asRecord(item.payload),
		});
	}
	parsed.sort((a, b) => a.id - b.id);
	return parsed.slice(-MAX_TIMELINE_EVENTS);
}

function eventWindowMatches(
	current: OrchestrationEvent[],
	next: OrchestrationEvent[],
): boolean {
	if (current.length !== next.length) return false;
	for (let index = 0; index < current.length; index += 1) {
		if (current[index]?.id !== next[index]?.id) return false;
	}
	return true;
}

function parseStageSummary(snapshot?: AgentRunSnapshot): Array<{
	stage: string;
	total: number;
	completed: number;
	failed: number;
	cancelled: number;
	inProgress: number;
}> {
	const data = asRecord(snapshot?.stages);
	return Object.keys(data)
		.map((stage) => {
			const row = asRecord(data[stage]);
			return {
				stage,
				total: Number(row.total ?? 0),
				completed: Number(row.completed ?? 0),
				failed: Number(row.failed ?? 0),
				cancelled: Number(row.cancelled ?? 0),
				inProgress: Number(row.inProgress ?? 0),
			};
		})
		.sort((a, b) => a.stage.localeCompare(b.stage));
}

function parseTaskSummary(snapshot?: AgentRunSnapshot): RunTaskSummary {
	const source = snapshot?.taskSummary;
	return {
		total: Math.max(0, Number(source?.total ?? 0)),
		queued: Math.max(0, Number(source?.queued ?? 0)),
		running: Math.max(0, Number(source?.running ?? 0)),
		awaitingReview: Math.max(0, Number(source?.awaitingReview ?? 0)),
		approved: Math.max(0, Number(source?.approved ?? 0)),
		reworkRequested: Math.max(0, Number(source?.reworkRequested ?? 0)),
		deferred: Math.max(0, Number(source?.deferred ?? 0)),
	};
}

function parseRunTasks(snapshot?: AgentRunSnapshot): AgentTaskItem[] {
	if (!Array.isArray(snapshot?.tasks)) return [];
	return snapshot.tasks
		.filter((task): task is AgentTaskItem => Boolean(task?.taskId))
		.map((task) => ({
			...task,
			taskId: String(task.taskId || "").trim(),
			runId: String(task.runId || "").trim(),
			assigneeProfile: String(task.assigneeProfile || "").trim(),
			stage: String(task.stage || "").trim(),
			title: String(task.title || "").trim(),
			description: String(task.description || "").trim(),
			priority: task.priority,
			status: task.status,
			userId: String(task.userId || "").trim(),
			requestId: String(task.requestId || "").trim(),
			createdAt: String(task.createdAt || "").trim(),
			updatedAt: String(task.updatedAt || "").trim(),
			startedAt: String(task.startedAt || "").trim(),
			finishedAt: String(task.finishedAt || "").trim(),
			reviewAction: String(task.reviewAction || "").trim(),
			reviewerId: String(task.reviewerId || "").trim(),
			reviewerNote: String(task.reviewerNote || "").trim(),
		}))
		.filter((task) => task.taskId.length > 0);
}

function readPersistedRunId(): string {
	try {
		return String(localStorage.getItem(ORCHESTRATION_STORAGE_KEY) || "").trim();
	} catch {
		return "";
	}
}

function persistRunId(runId: string): void {
	try {
		const normalized = String(runId || "").trim();
		if (!normalized) {
			localStorage.removeItem(ORCHESTRATION_STORAGE_KEY);
			return;
		}
		localStorage.setItem(ORCHESTRATION_STORAGE_KEY, normalized);
	} catch {
		/* noop */
	}
}

function statusColor(
	status: RunStatus,
): "default" | "primary" | "success" | "warning" | "danger" {
	switch (status) {
		case "queued":
			return "warning";
		case "running":
		case "cancel_requested":
			return "primary";
		case "completed":
			return "success";
		case "failed":
		case "cancelled":
			return "danger";
		default:
			return "default";
	}
}

function eventColor(
	eventType: string,
): "default" | "primary" | "success" | "warning" | "danger" {
	if (eventType === "step_completed" || eventType === "run_completed")
		return "success";
	if (eventType === "step_failed" || eventType === "run_failed")
		return "danger";
	if (eventType === "step_started" || eventType === "run_started")
		return "primary";
	if (eventType.includes("cancel")) return "warning";
	return "default";
}

function isProfileId(value: string): value is AgentProfileId {
	return value in AGENT_PROFILES;
}

function formatTime(value: string): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function extractEventBody(event: OrchestrationEvent): string {
	const response = event.payload.response;
	if (typeof response === "string" && response.trim()) return response.trim();
	const error = event.payload.error;
	const detailParts: string[] = [];
	const modelUsed = String(event.payload.modelUsed || "").trim();
	if (modelUsed) {
		detailParts.push(`model ${modelUsed}`);
	}
	const latencyMs = Number(event.payload.latencyMs ?? 0);
	if (Number.isFinite(latencyMs) && latencyMs > 0) {
		detailParts.push(`${Math.trunc(latencyMs)}ms`);
	}
	const detailSuffix =
		event.eventType.startsWith("step_") && detailParts.length
			? ` (${detailParts.join(" \u00b7 ")})`
			: "";
	if (typeof error === "string" && error.trim()) {
		return `${error.trim()}${detailSuffix}`;
	}
	return `${event.message}${detailSuffix}`;
}

function eventAvatarState(eventType: string): AgentMarkState {
	const normalizedType = String(eventType || "").toLowerCase();
	return resolveAgentMarkState({
		error:
			normalizedType.includes("failed") || normalizedType.includes("cancelled"),
		warning: normalizedType.includes("cancel_requested"),
		running:
			normalizedType.includes("started") ||
			normalizedType === "step_started" ||
			normalizedType === "run_started",
		success:
			normalizedType.includes("completed") ||
			normalizedType.includes("approved"),
		focus: true,
	});
}

interface AgentOrchestrationPanelProps {
	healthy: boolean | null;
	paired: boolean;
	condensed?: boolean;
	objective?: string;
	runStartSignal?: number;
	resumeRunId?: string;
	onRunStarted?: (payload: AgentOrchestrationRunStartedPayload) => void;
	onRunEvent?: (payload: AgentOrchestrationRunEventPayload) => void;
	onRunStatusChange?: (payload: AgentOrchestrationRunStatusPayload) => void;
	onRunCleared?: (payload: { runId: string }) => void;
	onOpenReviewInbox?: (payload: { runId: string }) => void;
}

export function AgentOrchestrationPanel({
	healthy,
	paired,
	condensed = false,
	objective,
	runStartSignal,
	resumeRunId,
	onRunStarted,
	onRunEvent,
	onRunStatusChange,
	onRunCleared,
	onOpenReviewInbox,
}: AgentOrchestrationPanelProps) {
	const [selectedProfiles, setSelectedProfiles] =
		useState<AgentProfileId[]>(DEFAULT_PROFILES);
	const [runId, setRunId] = useState<string>("");
	const [requestId, setRequestId] = useState<string>("");
	const [status, setStatus] = useState<RunStatus>("idle");
	const [events, setEvents] = useState<OrchestrationEvent[]>([]);
	const [stageSummary, setStageSummary] = useState<
		ReturnType<typeof parseStageSummary>
	>([]);
	const [taskSummary, setTaskSummary] = useState<RunTaskSummary>(() =>
		parseTaskSummary(),
	);
	const [runTasks, setRunTasks] = useState<AgentTaskItem[]>([]);
	const [finalOutput, setFinalOutput] = useState("");
	const [finalError, setFinalError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [error, setError] = useState<string>("");
	const [streamState, setStreamState] = useState<StreamState>("idle");
	const [streamNotice, setStreamNotice] = useState<string>("");
	const [streamEpoch, setStreamEpoch] = useState(0);

	const timelineRef = useRef<HTMLDivElement>(null);
	const streamRef = useRef<ReturnType<
		typeof agentService.subscribeOrchestrationRunEvents
	> | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const manualStopRef = useRef(false);
	const lastEventIdRef = useRef(0);
	const lastScrolledEventIdRef = useRef(0);
	const lastRunStartSignalRef = useRef(0);
	const resumeAttemptedRunIdRef = useRef("");

	const orchestrationAvailable = agentService.usesBroker();
	const isHealthy = healthy === true;
	const healthPending = healthy === null;
	const ready = orchestrationAvailable && isHealthy && paired;
	const runActive = runId.length > 0 && !TERMINAL_STATUSES.has(status);
	const streamError = streamState === "error";
	const idleCompact =
		condensed &&
		!runId &&
		!isExpanded &&
		!error &&
		!streamNotice &&
		status === "idle";
	const showExpandedRunDetails =
		isExpanded &&
		(Boolean(runId) ||
			stageSummary.length > 0 ||
			events.length > 0 ||
			Boolean(finalOutput) ||
			Boolean(finalError));

	const clearReconnectTimer = useCallback(() => {
		if (reconnectTimerRef.current !== null) {
			window.clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	}, []);

	const closeStreamSilently = useCallback(() => {
		streamRef.current?.close();
		streamRef.current = null;
	}, []);

	const stopStreaming = useCallback(() => {
		manualStopRef.current = true;
		clearReconnectTimer();
		reconnectAttemptRef.current = 0;
		closeStreamSilently();
		setStreamState("idle");
		setStreamNotice("");
	}, [clearReconnectTimer, closeStreamSilently]);

	const scheduleReconnect = useCallback(
		(reason: string) => {
			if (manualStopRef.current) return;
			if (!runId || TERMINAL_STATUSES.has(status)) return;
			if (reconnectTimerRef.current !== null) return;

			const attempt = reconnectAttemptRef.current + 1;
			reconnectAttemptRef.current = attempt;
			const backoff = Math.min(
				STREAM_RETRY_MAX_MS,
				STREAM_RETRY_BASE_MS * 2 ** (attempt - 1),
			);
			const jitter = Math.floor(Math.random() * 350);
			const delayMs = backoff + jitter;

			setStreamState("connecting");
			setStreamNotice(
				`Stream ${reason}. Reconnecting in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt}).`,
			);

			reconnectTimerRef.current = window.setTimeout(() => {
				reconnectTimerRef.current = null;
				setStreamNotice("");
				setStreamEpoch((value) => value + 1);
			}, delayMs);
		},
		[runId, status],
	);

	const handleToggleProfile = useCallback((profileId: AgentProfileId) => {
		setSelectedProfiles((current) => {
			if (current.includes(profileId)) {
				return current.filter((item) => item !== profileId);
			}
			return [...current, profileId];
		});
	}, []);

	const appendEvent = useCallback((event: OrchestrationEvent) => {
		if (event.id > 0) {
			lastEventIdRef.current = Math.max(lastEventIdRef.current, event.id);
		}
		setEvents((current) => {
			if (event.id > 0) {
				const last = current[current.length - 1];
				if (last?.id === event.id) return current;
				if (!last || event.id > last.id) {
					if (current.length >= MAX_TIMELINE_EVENTS) {
						return [...current.slice(-(MAX_TIMELINE_EVENTS - 1)), event];
					}
					return [...current, event];
				}
				if (current.some((item) => item.id === event.id)) {
					return current;
				}
			}
			const next = [...current, event].sort((a, b) => a.id - b.id);
			return next.slice(-MAX_TIMELINE_EVENTS);
		});
	}, []);

	const hydrateFromSnapshot = useCallback((snapshot?: AgentRunSnapshot) => {
		if (!snapshot) return;
		const nextStatus = String(snapshot.status || "running") as RunStatus;
		const parsedEvents = parseEvents(snapshot);
		const parsedSummary = parseStageSummary(snapshot);
		const parsedTaskSummary = parseTaskSummary(snapshot);
		const parsedRunTasks = parseRunTasks(snapshot);
		const nextFinalOutput = String(snapshot.finalOutput || "");
		const nextFinalError = String(snapshot.finalError || "");
		const maxId = parsedEvents[parsedEvents.length - 1]?.id ?? 0;
		if (maxId > 0) {
			lastEventIdRef.current = Math.max(lastEventIdRef.current, maxId);
		}
		const snapshotRunId = String(snapshot.runId || "").trim();
		if (snapshotRunId) {
			setRunId((current) =>
				current === snapshotRunId ? current : snapshotRunId,
			);
			persistRunId(snapshotRunId);
		}
		const snapshotRequestId = String(snapshot.requestId || "").trim();
		if (snapshotRequestId) {
			setRequestId((current) =>
				current === snapshotRequestId ? current : snapshotRequestId,
			);
		}
		const snapshotProfiles = Array.isArray(snapshot.profiles)
			? snapshot.profiles
					.map((value) =>
						String(value || "")
							.trim()
							.toLowerCase(),
					)
					.filter(
						(value): value is AgentProfileId =>
							isProfileId(value) && value !== "koro",
					)
			: [];
		if (snapshotProfiles.length > 0) {
			setSelectedProfiles((current) =>
				current.join("|") === snapshotProfiles.join("|")
					? current
					: snapshotProfiles,
			);
		}
		setStatus((current) => (current === nextStatus ? current : nextStatus));
		setEvents((current) =>
			eventWindowMatches(current, parsedEvents) ? current : parsedEvents,
		);
		setStageSummary(parsedSummary);
		setTaskSummary((current) =>
			JSON.stringify(current) === JSON.stringify(parsedTaskSummary)
				? current
				: parsedTaskSummary,
		);
		setRunTasks((current) =>
			JSON.stringify(current) === JSON.stringify(parsedRunTasks)
				? current
				: parsedRunTasks,
		);
		setFinalOutput((current) =>
			current === nextFinalOutput ? current : nextFinalOutput,
		);
		setFinalError((current) =>
			current === nextFinalError ? current : nextFinalError,
		);
	}, []);

	const refreshRun = useCallback(async () => {
		if (!runId) return;
		const result = await agentService.getOrchestrationRun(runId);
		if (!result.success) {
			setError(result.error || "Unable to refresh run.");
			if (ORCHESTRATION_DEBUG_ENABLED) {
				logger.warn(
					"Orchestration run refresh failed",
					"AgentOrchestrationPanel",
					{
						runId,
						error: result.error,
					},
				);
			}
			return;
		}
		setError("");
		setRequestId(String(result.requestId || ""));
		hydrateFromSnapshot(result.run);
		if (ORCHESTRATION_DEBUG_ENABLED) {
			logger.debug(
				"Orchestration run refresh succeeded",
				"AgentOrchestrationPanel",
				{
					runId,
					status: result.run?.status,
					eventCount: Array.isArray(result.run?.messages)
						? result.run?.messages.length
						: 0,
				},
			);
		}
	}, [runId, hydrateFromSnapshot]);

	useEffect(() => {
		if (!orchestrationAvailable) return;
		const candidateRunId = String(resumeRunId || readPersistedRunId()).trim();
		if (!candidateRunId) return;
		if (runActive) return;
		if (candidateRunId === runId) return;
		if (resumeAttemptedRunIdRef.current === candidateRunId) return;

		let cancelled = false;
		resumeAttemptedRunIdRef.current = candidateRunId;
		setIsRestoring(true);

		void (async () => {
			try {
				const result = await agentService.getOrchestrationRun(candidateRunId);
				if (cancelled) return;
				if (!result.success || !result.run) {
					const errorText = String(result.error || "")
						.trim()
						.toLowerCase();
					if (
						candidateRunId === readPersistedRunId() &&
						errorText.includes("not found")
					) {
						persistRunId("");
					}
					return;
				}
				setError("");
				setRunId(candidateRunId);
				setIsExpanded(true);
				hydrateFromSnapshot(result.run);
			} catch (error) {
				if (cancelled) return;
				logger.warn(
					"Unable to restore orchestration run state.",
					"AgentOrchestrationPanel",
					{
						runId: candidateRunId,
						error,
					},
				);
			} finally {
				if (!cancelled) {
					setIsRestoring(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		orchestrationAvailable,
		resumeRunId,
		runActive,
		runId,
		hydrateFromSnapshot,
	]);

	useEffect(() => {
		const reconnectCycle = streamEpoch;
		if (reconnectCycle < 0) return;

		if (!runActive || !runId) {
			stopStreaming();
			return;
		}
		if (streamRef.current) return;

		manualStopRef.current = false;
		setStreamState("connecting");
		let effectActive = true;
		streamRef.current = agentService.subscribeOrchestrationRunEvents(runId, {
			lastEventId: lastEventIdRef.current,
			onOpen: () => {
				clearReconnectTimer();
				reconnectAttemptRef.current = 0;
				setStreamState("live");
				setStreamNotice("");
				setError("");
				if (ORCHESTRATION_DEBUG_ENABLED) {
					logger.debug(
						"Orchestration stream connected",
						"AgentOrchestrationPanel",
						{ runId },
					);
				}
			},
			onEvent: (event) => {
				if (!effectActive) return;
				const normalized: OrchestrationEvent = {
					id: Number(event.id || 0),
					eventType: String(event.eventType || "event"),
					stage: String(event.stage || ""),
					profileId: String(event.profileId || ""),
					requestId: String(event.requestId || ""),
					message: String(event.message || ""),
					createdAt: String(event.createdAt || new Date().toISOString()),
					payload: asRecord(event.payload),
				};
				appendEvent(normalized);
				onRunEvent?.({ runId, event: normalized });
				if (ORCHESTRATION_DEBUG_ENABLED) {
					logger.debug(
						"Orchestration stream event",
						"AgentOrchestrationPanel",
						{
							runId,
							eventId: normalized.id,
							eventType: normalized.eventType,
							stage: normalized.stage,
							profileId: normalized.profileId,
							latencyMs: Number(normalized.payload.latencyMs ?? 0),
						},
					);
				}

				const payloadStatus = String(normalized.payload.status || "").trim();
				let nextStatus: RunStatus | null = null;
				if (
					payloadStatus === "queued" ||
					payloadStatus === "running" ||
					payloadStatus === "cancel_requested" ||
					payloadStatus === "completed" ||
					payloadStatus === "failed" ||
					payloadStatus === "cancelled"
				) {
					nextStatus = payloadStatus as RunStatus;
				} else if (normalized.eventType === "run_started") {
					nextStatus = "running";
				} else if (normalized.eventType === "run_cancel_requested") {
					nextStatus = "cancel_requested";
				}

				if (nextStatus) {
					setStatus((current) =>
						current === nextStatus ? current : nextStatus,
					);
				}

				if (TERMINAL_EVENT_TYPES.has(normalized.eventType)) {
					void refreshRun();
				}
			},
			onError: (message) => {
				if (!effectActive) return;
				setStreamState("error");
				setError(message);
				if (ORCHESTRATION_DEBUG_ENABLED) {
					logger.warn("Orchestration stream error", "AgentOrchestrationPanel", {
						runId,
						message,
					});
				}
				scheduleReconnect("disconnected");
			},
			onClosed: () => {
				streamRef.current = null;
				if (!effectActive) return;
				if (manualStopRef.current) return;
				if (ORCHESTRATION_DEBUG_ENABLED) {
					logger.warn(
						"Orchestration stream closed",
						"AgentOrchestrationPanel",
						{
							runId,
						},
					);
				}
				scheduleReconnect("closed");
			},
		});

		return () => {
			effectActive = false;
			closeStreamSilently();
		};
	}, [
		runActive,
		runId,
		appendEvent,
		refreshRun,
		stopStreaming,
		clearReconnectTimer,
		scheduleReconnect,
		closeStreamSilently,
		streamEpoch,
		onRunEvent,
	]);

	useEffect(() => {
		if (!runId) return;
		onRunStatusChange?.({ runId, status });
	}, [runId, status, onRunStatusChange]);

	useEffect(() => {
		if (!runActive || streamState === "live") return;
		const timer = window.setInterval(() => {
			void refreshRun();
		}, REFRESH_POLL_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [runActive, streamState, refreshRun]);

	useEffect(() => {
		return () => {
			manualStopRef.current = true;
			clearReconnectTimer();
			closeStreamSilently();
		};
	}, [clearReconnectTimer, closeStreamSilently]);

	useEffect(() => {
		const latestEventId = events[events.length - 1]?.id ?? 0;
		if (latestEventId <= 0) return;
		if (latestEventId === lastScrolledEventIdRef.current) return;
		lastScrolledEventIdRef.current = latestEventId;
		timelineRef.current?.scrollTo({
			top: timelineRef.current.scrollHeight,
			behavior: "auto",
		});
	}, [events]);

	const handleStart = useCallback(async () => {
		if (!ready) {
			setError("Agent orchestration requires online paired broker mode.");
			return;
		}
		if (runActive || isSubmitting) {
			setError("A run is already active.");
			return;
		}
		const objectiveText = String(objective || DEFAULT_OBJECTIVE).trim();
		if (objectiveText.length < 12) {
			setError("Add a more specific objective before starting.");
			return;
		}
		if (!selectedProfiles.length) {
			setError("Select at least one profile.");
			return;
		}

		stopStreaming();
		reconnectAttemptRef.current = 0;
		lastEventIdRef.current = 0;
		lastScrolledEventIdRef.current = 0;
		setError("");
		setIsSubmitting(true);
		try {
			const result = await agentService.createOrchestrationRun({
				objective: objectiveText,
				profiles: selectedProfiles,
				synthesisProfile: "koro",
				context: {
					source: "agent-ui-collaboration-panel",
					launchedAt: new Date().toISOString(),
				},
				timeoutMs: 90_000,
			});

			if (!result.success || !result.runId) {
				setError(result.error || "Unable to start run.");
				return;
			}

			setRunId(result.runId);
			resumeAttemptedRunIdRef.current = result.runId;
			persistRunId(result.runId);
			setRequestId(String(result.requestId || ""));
			setStatus((result.status || "queued") as RunStatus);
			setEvents([]);
			setStageSummary([]);
			setTaskSummary(parseTaskSummary());
			setRunTasks([]);
			setFinalOutput("");
			setFinalError("");
			setStreamState("idle");
			setStreamNotice("");
			onRunStarted?.({
				runId: result.runId,
				requestId: String(result.requestId || ""),
				objective: objectiveText,
				profiles: selectedProfiles,
				status: (result.status || "queued") as AgentOrchestrationRunStatus,
			});
			setIsExpanded(true);
			const snapshot = await agentService.getOrchestrationRun(result.runId);
			if (snapshot.success) {
				setRequestId(String(snapshot.requestId || result.requestId || ""));
				hydrateFromSnapshot(snapshot.run);
			}
		} finally {
			setIsSubmitting(false);
		}
	}, [
		ready,
		runActive,
		isSubmitting,
		objective,
		selectedProfiles,
		hydrateFromSnapshot,
		stopStreaming,
		onRunStarted,
	]);

	useEffect(() => {
		const signal = Number(runStartSignal ?? 0);
		if (!Number.isFinite(signal) || signal <= 0) return;
		if (signal === lastRunStartSignalRef.current) return;
		lastRunStartSignalRef.current = signal;
		void handleStart();
	}, [runStartSignal, handleStart]);

	const handleCancel = useCallback(async () => {
		if (!runId || TERMINAL_STATUSES.has(status)) return;
		const result = await agentService.cancelOrchestrationRun(runId);
		if (!result.success) {
			setError(result.error || "Unable to cancel run.");
			return;
		}
		setError("");
		setStatus((result.status || "cancel_requested") as RunStatus);
	}, [runId, status]);

	const handleClear = useCallback(() => {
		if (runId) {
			onRunCleared?.({ runId });
		}
		stopStreaming();
		reconnectAttemptRef.current = 0;
		lastEventIdRef.current = 0;
		lastScrolledEventIdRef.current = 0;
		setRunId("");
		setRequestId("");
		setStatus("idle");
		setEvents([]);
		setStageSummary([]);
		setTaskSummary(parseTaskSummary());
		setRunTasks([]);
		setFinalOutput("");
		setFinalError("");
		setStreamState("idle");
		setStreamNotice("");
		persistRunId("");
		resumeAttemptedRunIdRef.current = "";
	}, [stopStreaming, runId, onRunCleared]);

	const handleReconnectNow = useCallback(() => {
		if (!runId || !runActive) return;
		manualStopRef.current = true;
		clearReconnectTimer();
		closeStreamSilently();
		manualStopRef.current = false;
		reconnectAttemptRef.current = 0;
		setStreamState("connecting");
		setStreamNotice("Reconnecting stream now...");
		setStreamEpoch((value) => value + 1);
		void refreshRun();
	}, [runId, runActive, clearReconnectTimer, closeStreamSilently, refreshRun]);

	const statusBadgeColor = useMemo(() => statusColor(status), [status]);
	const reviewPendingCount =
		taskSummary.awaitingReview + taskSummary.reworkRequested;
	const activeTaskCount = taskSummary.queued + taskSummary.running;
	const reviewProfiles = useMemo(
		() =>
			Array.from(
				new Set(
					runTasks
						.filter(
							(task) =>
								task.status === "awaiting_review" ||
								task.status === "rework_requested",
						)
						.map((task) => String(task.assigneeProfile || "").trim())
						.filter(Boolean),
				),
			),
		[runTasks],
	);
	const runSummaryText = useMemo(() => {
		if (!runId && isRestoring) {
			return "Restoring the latest orchestration run so the review handoff stays intact.";
		}
		if (!runId) return "";
		if (status === "queued") {
			return "Run is queued. The crew ledger is ready and tasks will start shortly.";
		}
		if (status === "running" || status === "cancel_requested") {
			return activeTaskCount > 0
				? `${activeTaskCount} task${activeTaskCount === 1 ? "" : "s"} currently active across the selected crew.`
				: "The crew is coordinating now. The timeline will fill in as steps complete.";
		}
		if (status === "completed") {
			if (reviewPendingCount > 0) {
				return `${reviewPendingCount} task${
					reviewPendingCount === 1 ? "" : "s"
				} still need reviewer action before this run is truly finished.`;
			}
			if (taskSummary.approved > 0) {
				return "Run finished and all tracked task handoffs have been reviewed.";
			}
			return "Run finished cleanly.";
		}
		if (status === "failed") {
			return "Run stopped with an error. Review the timeline and any queued follow-up tasks before retrying.";
		}
		if (status === "cancelled") {
			return "Run was cancelled. Any unfinished task handoffs were deferred for later review.";
		}
		return "";
	}, [
		activeTaskCount,
		isRestoring,
		reviewPendingCount,
		runId,
		status,
		taskSummary.approved,
	]);
	const summaryTone =
		status === "failed" || status === "cancelled"
			? "danger"
			: reviewPendingCount > 0
				? "warning"
				: status === "completed"
					? "success"
					: "default";

	if (!orchestrationAvailable) {
		return (
			<Panel variant="sunken" padding="md" className={styles.container}>
				<HStack align="center" gap={2}>
					<Bot size={16} />
					<Text size="sm" weight="semibold">
						Run coordination
					</Text>
				</HStack>
				<Text size="xs" color="muted" block>
					Switch the transport to backend mode when you want the crew to run a
					shared objective.
				</Text>
			</Panel>
		);
	}

	return (
		<Panel variant="sunken" padding="md" className={styles.container}>
			<div className={styles.header}>
				<HStack gap={2} align="center">
					<Sparkles size={16} />
					<Text size="sm" weight="semibold">
						Run coordination
					</Text>
					{runId ? (
						<Badge color={statusBadgeColor} variant="soft" size="sm">
							{status.replaceAll("_", " ")}
						</Badge>
					) : null}
				</HStack>
				<HStack gap={1} align="center">
					{runId ? (
						<>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => void handleReconnectNow()}
								disabled={!runActive}
							>
								Reconnect
							</Button>
							<Button
								variant="ghost"
								size="sm"
								iconLeft={<RefreshCw size={14} />}
								onClick={() => void refreshRun()}
								disabled={!runId}
							>
								Refresh
							</Button>
						</>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsExpanded((value) => !value)}
					>
						{isExpanded ? "Hide" : "Show"}
					</Button>
				</HStack>
			</div>

			{idleCompact ? (
				<div className={styles.idleSummaryRow}>
					<Text size="xs" color="muted" className={styles.idleSummaryText}>
						Run coordination stays tucked away while direct chat is in focus.
						Switch to Run objective when you want the crew to execute.
					</Text>
					<Badge size="sm" variant="outline" color="default">
						{selectedProfiles.length} profiles selected
					</Badge>
				</div>
			) : (
				<>
					<Text size="xs" color="muted" block>
						Choose the profiles you want in the crew, then launch the current
						objective from the unified composer.
					</Text>

					<div className={styles.profileRow}>
						{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map(
							(profileId) => {
								const active = selectedProfiles.includes(profileId);
								const profileState = resolveAgentMarkState({
									error:
										healthy === false ||
										streamError ||
										status === "failed" ||
										status === "cancelled",
									waiting: healthPending || (isHealthy && !paired),
									running: runActive && active,
									warning: active && status === "cancel_requested",
									success: active && !runActive && status === "completed",
									focus: active && !runActive && ready,
								});
								return (
									<button
										key={profileId}
										type="button"
										onClick={() => handleToggleProfile(profileId)}
										className={styles.profilePill}
										data-active={active ? "true" : "false"}
										disabled={runActive || isSubmitting}
									>
										<AgentPixelMark
											profileId={profileId}
											size={24}
											detailLevel="auto"
											state={profileState}
										/>
										<span>{AGENT_PROFILES[profileId].name}</span>
									</button>
								);
							},
						)}
					</div>

					<HStack gap={2} align="center" className={styles.controls}>
						<Button
							variant="primary"
							size="sm"
							iconLeft={
								isSubmitting ? <Loader2 size={14} /> : <Play size={14} />
							}
							loading={isSubmitting}
							onClick={() => void handleStart()}
							disabled={runActive || !ready}
						>
							Start Run
						</Button>
						<Button
							variant="outline"
							size="sm"
							iconLeft={<PauseCircle size={14} />}
							onClick={() => void handleCancel()}
							disabled={!runActive}
						>
							Cancel
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleClear}
							disabled={runActive && status !== "cancel_requested"}
						>
							Clear
						</Button>
					</HStack>

					{error && (
						<Text size="xs" color="danger" className={styles.errorText} block>
							{error}
						</Text>
					)}
					{streamNotice && (
						<Text size="xs" color="warning" className={styles.errorText} block>
							{streamNotice}
						</Text>
					)}

					{runId && (
						<HStack gap={2} align="center" className={styles.metaRow}>
							<Badge size="sm" variant="outline" color="default">
								run {runId.slice(-8)}
							</Badge>
							{requestId ? (
								<Badge size="sm" variant="outline" color="default">
									req {requestId.slice(0, 14)}
								</Badge>
							) : null}
						</HStack>
					)}

					{(runSummaryText || runId) && (
						<div className={styles.summaryPanel} data-tone={summaryTone}>
							<div className={styles.summaryMain}>
								<Text size="xs" weight="semibold" block>
									{status === "completed" && reviewPendingCount > 0
										? "Review handoff ready"
										: status === "completed"
											? "Run finished"
											: status === "failed"
												? "Run needs attention"
												: status === "cancelled"
													? "Run cancelled"
													: status === "queued"
														? "Run queued"
														: status === "running" ||
																status === "cancel_requested"
															? "Run in progress"
															: isRestoring
																? "Restoring run"
																: "Run state"}
								</Text>
								{runSummaryText ? (
									<Text size="xs" color="muted" block>
										{runSummaryText}
									</Text>
								) : null}
								{reviewProfiles.length > 0 ? (
									<Text size="xs" color="muted" block>
										Waiting on {reviewProfiles.join(", ")}.
									</Text>
								) : null}
							</div>
							<div className={styles.summaryBadges}>
								{taskSummary.total > 0 ? (
									<Badge size="sm" variant="soft" color="default">
										{taskSummary.total} tracked tasks
									</Badge>
								) : null}
								{activeTaskCount > 0 ? (
									<Badge size="sm" variant="soft" color="primary">
										{activeTaskCount} active
									</Badge>
								) : null}
								{reviewPendingCount > 0 ? (
									<Badge size="sm" variant="soft" color="warning">
										{reviewPendingCount} awaiting review
									</Badge>
								) : null}
								{taskSummary.approved > 0 ? (
									<Badge size="sm" variant="soft" color="success">
										{taskSummary.approved} approved
									</Badge>
								) : null}
							</div>
							{runId && reviewPendingCount > 0 && onOpenReviewInbox ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => onOpenReviewInbox({ runId })}
								>
									Open review inbox
								</Button>
							) : null}
						</div>
					)}

					{showExpandedRunDetails ? (
						<>
							{stageSummary.length > 0 && (
								<div className={styles.stageGrid}>
									{stageSummary.map((stage) => (
										<div key={stage.stage} className={styles.stageCard}>
											<Text size="xs" weight="semibold" block>
												{stage.stage.replace("_", " ").toUpperCase()}
											</Text>
											<Text size="xs" color="muted" block>
												{stage.completed}/{stage.total} complete
											</Text>
											{stage.inProgress > 0 && (
												<Text size="xs" color="primary" block>
													{stage.inProgress} in progress
												</Text>
											)}
											{stage.failed > 0 && (
												<Text size="xs" color="danger" block>
													{stage.failed} failed
												</Text>
											)}
										</div>
									))}
								</div>
							)}

							<div className={styles.timeline} ref={timelineRef}>
								{events.length === 0 ? (
									<div className={styles.emptyTimeline}>
										<Text size="xs" color="muted">
											No events yet. Start a run to watch agents collaborate in
											real time.
										</Text>
									</div>
								) : (
									<Stack gap={2}>
										{events.map((event) => {
											const eventBody = extractEventBody(event);
											const profileId = isProfileId(event.profileId)
												? event.profileId
												: null;
											return (
												<div key={event.id} className={styles.eventRow}>
													<div className={styles.eventAvatar}>
														{profileId ? (
															<AgentPixelMark
																profileId={profileId}
																size={30}
																detailLevel="auto"
																state={eventAvatarState(event.eventType)}
															/>
														) : (
															<div className={styles.systemAvatar}>SYS</div>
														)}
													</div>
													<div className={styles.eventBubble}>
														<HStack
															gap={1}
															align="center"
															className={styles.eventMeta}
														>
															<Badge
																size="sm"
																variant="soft"
																color={eventColor(event.eventType)}
															>
																{event.eventType}
															</Badge>
															{event.stage ? (
																<Badge
																	size="sm"
																	variant="outline"
																	color="default"
																>
																	{event.stage}
																</Badge>
															) : null}
															<Text size="xs" color="muted">
																{formatTime(event.createdAt)}
															</Text>
														</HStack>
														<Text size="sm" className={styles.eventText} block>
															{eventBody}
														</Text>
													</div>
												</div>
											);
										})}
									</Stack>
								)}
							</div>

							{finalOutput && (
								<div className={styles.outputPanel}>
									<Text
										size="xs"
										weight="semibold"
										className={styles.outputHeading}
										block
									>
										Final synthesis
									</Text>
									<pre className={styles.outputText}>{finalOutput}</pre>
								</div>
							)}

							{finalError && !finalOutput && (
								<div className={styles.outputPanel}>
									<Text size="xs" color="danger" weight="semibold" block>
										Run error
									</Text>
									<Text size="sm" color="danger" block>
										{finalError}
									</Text>
								</div>
							)}
						</>
					) : null}
				</>
			)}
		</Panel>
	);
}
