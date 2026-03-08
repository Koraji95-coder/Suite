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
import { TextArea } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { type AgentRunSnapshot, agentService } from "@/services/agentService";
import styles from "./AgentOrchestrationPanel.module.css";
import { AgentPixelMark } from "./AgentPixelMark";
import {
	type AgentMarkState,
	resolveAgentMarkState,
} from "./agentMarkState";
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

type OrchestrationEvent = {
	id: number;
	eventType: string;
	stage: string;
	profileId: string;
	requestId: string;
	message: string;
	createdAt: string;
	payload: Record<string, unknown>;
};

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
	return parsed;
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

function streamStateColor(
	state: StreamState,
): "default" | "primary" | "success" | "warning" | "danger" {
	switch (state) {
		case "connecting":
			return "warning";
		case "live":
			return "success";
		case "error":
			return "danger";
		default:
			return "default";
	}
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
	if (typeof error === "string" && error.trim()) return error.trim();
	return event.message;
}

function eventAvatarState(eventType: string): AgentMarkState {
	const normalizedType = String(eventType || "").toLowerCase();
	return resolveAgentMarkState({
		error:
			normalizedType.includes("failed") ||
			normalizedType.includes("cancelled"),
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
	healthy: boolean;
	paired: boolean;
}

export function AgentOrchestrationPanel({
	healthy,
	paired,
}: AgentOrchestrationPanelProps) {
	const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
	const [selectedProfiles, setSelectedProfiles] =
		useState<AgentProfileId[]>(DEFAULT_PROFILES);
	const [runId, setRunId] = useState<string>("");
	const [requestId, setRequestId] = useState<string>("");
	const [status, setStatus] = useState<RunStatus>("idle");
	const [events, setEvents] = useState<OrchestrationEvent[]>([]);
	const [stageSummary, setStageSummary] = useState<
		ReturnType<typeof parseStageSummary>
	>([]);
	const [finalOutput, setFinalOutput] = useState("");
	const [finalError, setFinalError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
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

	const orchestrationAvailable = agentService.usesBroker();
	const ready = orchestrationAvailable && healthy && paired;
	const runActive = runId.length > 0 && !TERMINAL_STATUSES.has(status);
	const streamActive = runActive && streamState === "live";
	const streamError = streamState === "error";

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
			if (event.id > 0 && current.some((item) => item.id === event.id)) {
				return current;
			}
			const next = [...current, event].sort((a, b) => a.id - b.id);
			return next.slice(-600);
		});
	}, []);

	const hydrateFromSnapshot = useCallback((snapshot?: AgentRunSnapshot) => {
		if (!snapshot) return;
		const nextStatus = String(snapshot.status || "running") as RunStatus;
		const parsedEvents = parseEvents(snapshot);
		const parsedSummary = parseStageSummary(snapshot);
		const maxId = parsedEvents[parsedEvents.length - 1]?.id ?? 0;
		if (maxId > 0) {
			lastEventIdRef.current = Math.max(lastEventIdRef.current, maxId);
		}
		setStatus(nextStatus);
		setEvents(parsedEvents);
		setStageSummary(parsedSummary);
		setFinalOutput(String(snapshot.finalOutput || ""));
		setFinalError(String(snapshot.finalError || ""));
	}, []);

	const refreshRun = useCallback(async () => {
		if (!runId) return;
		const result = await agentService.getOrchestrationRun(runId);
		if (!result.success) {
			setError(result.error || "Unable to refresh run.");
			return;
		}
		setError("");
		setRequestId(String(result.requestId || ""));
		hydrateFromSnapshot(result.run);
	}, [runId, hydrateFromSnapshot]);

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

				const payloadStatus = String(normalized.payload.status || "").trim();
				if (
					payloadStatus === "queued" ||
					payloadStatus === "running" ||
					payloadStatus === "cancel_requested" ||
					payloadStatus === "completed" ||
					payloadStatus === "failed" ||
					payloadStatus === "cancelled"
				) {
					setStatus(payloadStatus as RunStatus);
				} else if (normalized.eventType === "run_started") {
					setStatus("running");
				} else if (normalized.eventType === "run_cancel_requested") {
					setStatus("cancel_requested");
				}

				if (TERMINAL_EVENT_TYPES.has(normalized.eventType)) {
					void refreshRun();
				}
			},
			onError: (message) => {
				if (!effectActive) return;
				setStreamState("error");
				setError(message);
				scheduleReconnect("disconnected");
			},
			onClosed: () => {
				streamRef.current = null;
				if (!effectActive) return;
				if (manualStopRef.current) return;
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
	]);

	useEffect(() => {
		if (!runActive) return;
		const timer = window.setInterval(() => {
			void refreshRun();
		}, 2800);
		return () => window.clearInterval(timer);
	}, [runActive, refreshRun]);

	useEffect(() => {
		return () => {
			manualStopRef.current = true;
			clearReconnectTimer();
			closeStreamSilently();
		};
	}, [clearReconnectTimer, closeStreamSilently]);

	useEffect(() => {
		if (!events.length) return;
		timelineRef.current?.scrollTo({
			top: timelineRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [events]);

	const handleStart = useCallback(async () => {
		if (!ready) {
			setError("Agent orchestration requires online paired broker mode.");
			return;
		}
		const objectiveText = objective.trim();
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
			setRequestId(String(result.requestId || ""));
			setStatus((result.status || "queued") as RunStatus);
			setEvents([]);
			setStageSummary([]);
			setFinalOutput("");
			setFinalError("");
			setStreamState("idle");
			setStreamNotice("");
			setIsExpanded(true);
			const snapshot = await agentService.getOrchestrationRun(result.runId);
			if (snapshot.success) {
				setRequestId(String(snapshot.requestId || result.requestId || ""));
				hydrateFromSnapshot(snapshot.run);
			}
		} finally {
			setIsSubmitting(false);
		}
	}, [ready, objective, selectedProfiles, hydrateFromSnapshot, stopStreaming]);

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
		stopStreaming();
		reconnectAttemptRef.current = 0;
		lastEventIdRef.current = 0;
		setRunId("");
		setRequestId("");
		setStatus("idle");
		setEvents([]);
		setStageSummary([]);
		setFinalOutput("");
		setFinalError("");
		setStreamState("idle");
		setStreamNotice("");
	}, [stopStreaming]);

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

	if (!orchestrationAvailable) {
		return (
			<Panel variant="inset" padding="md" className={styles.container}>
				<HStack align="center" gap={2}>
					<Bot size={16} />
					<Text size="sm" weight="semibold">
						Live Agent Collaboration
					</Text>
					<Badge size="sm" color="warning" variant="soft">
						Broker mode required
					</Badge>
				</HStack>
				<Text size="xs" color="muted" block>
					Set <code>VITE_AGENT_TRANSPORT=backend</code> to enable animated
					multi-agent runs.
				</Text>
			</Panel>
		);
	}

	return (
		<Panel variant="inset" padding="md" className={styles.container}>
			<div className={styles.header}>
				<HStack gap={2} align="center">
					<Sparkles size={16} />
					<Text size="sm" weight="semibold">
						Live Agent Collaboration
					</Text>
					<Badge color={statusBadgeColor} variant="soft" size="sm">
						{status === "idle" ? "ready" : status}
					</Badge>
					<Badge color={streamStateColor(streamState)} variant="soft" size="sm">
						{streamActive
							? "stream live"
							: streamState === "connecting"
								? "stream connecting"
								: streamState === "error"
									? "stream error"
									: "stream idle"}
					</Badge>
				</HStack>
				<HStack gap={1} align="center">
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
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsExpanded((value) => !value)}
					>
						{isExpanded ? "Hide" : "Show"}
					</Button>
				</HStack>
			</div>

			<TextArea
				minRows={2}
				value={objective}
				onChange={(event) => setObjective(event.target.value)}
				placeholder="Describe the objective for your multi-agent run..."
				disabled={runActive || isSubmitting}
				className={styles.objectiveInput}
			/>

			<div className={styles.profileRow}>
				{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((profileId) => {
					const active = selectedProfiles.includes(profileId);
					const profileState = resolveAgentMarkState({
						error: !healthy || streamError || status === "failed" || status === "cancelled",
						waiting: healthy && !paired,
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
								size={26}
								detailLevel="auto"
								state={profileState}
							/>
							<span>{AGENT_PROFILES[profileId].name}</span>
						</button>
					);
				})}
			</div>

			<HStack gap={2} align="center" className={styles.controls}>
				<Button
					variant="primary"
					size="sm"
					iconLeft={isSubmitting ? <Loader2 size={14} /> : <Play size={14} />}
					loading={isSubmitting}
					onClick={() => void handleStart()}
					disabled={runActive || !healthy || !paired}
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

			{isExpanded ? (
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
									No events yet. Start a run to watch agents collaborate in real
									time.
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
														<Badge size="sm" variant="outline" color="default">
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
		</Panel>
	);
}
