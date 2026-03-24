import type { AgentProfileId } from "@/components/agent/agentProfiles";
import type { AgentPromptMode } from "../agentPromptPacks";

export interface AgentResponse {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
	taskId?: string;
	status?: "pending" | "running" | "complete" | "failed";
	executionTime?: number;
}

export interface AgentTask {
	task: string;
	params?: Record<string, unknown>;
	timeout?: number;
	profileId?: AgentProfileId;
}

export interface AgentSendOptions {
	profileId?: AgentProfileId;
	promptMode?: AgentPromptMode;
	templateLabel?: string;
	onStreamUpdate?: (partialResponse: string) => void;
}

export interface AgentRunCreateRequest {
	objective: string;
	profiles?: AgentProfileId[];
	synthesisProfile?: AgentProfileId;
	context?: Record<string, unknown>;
	timeoutMs?: number;
}

export interface AgentRunEvent {
	id: number;
	eventType: string;
	runId?: string;
	stage: string;
	profileId: string;
	requestId: string;
	message: string;
	payload?: Record<string, unknown>;
	createdAt?: string;
}

export interface AgentRunSnapshot {
	runId: string;
	status: string;
	requestId: string;
	steps: Array<Record<string, unknown>>;
	messages: Array<Record<string, unknown>>;
	stages: Record<string, unknown>;
	tasks?: AgentTaskItem[];
	taskSummary?: {
		total: number;
		queued: number;
		running: number;
		awaitingReview: number;
		approved: number;
		reworkRequested: number;
		deferred: number;
	};
	finalOutput?: string;
	finalError?: string;
}

export interface AgentProfileCatalogItem {
	id: AgentProfileId;
	name: string;
	tagline: string;
	focus: string;
	memory_namespace: string;
	model_primary: string;
	model_fallbacks: string[];
}

export type AgentTaskStatus =
	| "queued"
	| "running"
	| "awaiting_review"
	| "approved"
	| "rework_requested"
	| "deferred";

export type AgentTaskPriority = "critical" | "high" | "medium" | "low";
export type AgentReviewAction = "approve" | "rework" | "defer";

export interface AgentTaskItem {
	taskId: string;
	runId: string;
	userId: string;
	assigneeProfile: string;
	stage: string;
	title: string;
	description: string;
	priority: AgentTaskPriority;
	status: AgentTaskStatus;
	reviewAction?: string;
	reviewerId?: string;
	reviewerNote?: string;
	requestId?: string;
	createdAt?: string;
	updatedAt?: string;
	startedAt?: string;
	finishedAt?: string;
}

export interface AgentActivityItem {
	activityId: string;
	source: "run" | "task" | "review";
	eventType: string;
	runId: string;
	taskId?: string;
	profileId?: string;
	status?: string;
	priority?: string;
	stage?: string;
	requestId: string;
	message: string;
	payload?: Record<string, unknown>;
	createdAt?: string;
}

export interface AgentRunEventStreamHandlers {
	onEvent: (event: AgentRunEvent) => void;
	onOpen?: () => void;
	onError?: (message: string) => void;
	onClosed?: () => void;
	lastEventId?: number;
}

export interface AgentRunEventStream {
	close: () => void;
}

export type AgentPairingAction = "pair" | "unpair";

export interface AgentPairingVerificationOptions {
	redirectTo?: string;
	redirectPath?:
		| "/login"
		| "/agent/pairing-callback"
		| "/app/agent/pairing-callback"
		| "/app/agent"
		| "/app/settings";
}

export type AgentPairingRefreshFailureKind =
	| "none"
	| "session-required"
	| "unauthorized"
	| "provider-timeout"
	| "rate-limited"
	| "server-error"
	| "network"
	| "bad-response";

export interface AgentPairingRefreshResult {
	paired: boolean;
	ok: boolean;
	transient: boolean;
	terminal: boolean;
	status: number;
	code: string;
	message: string;
	retryAfterSeconds: number;
	kind: AgentPairingRefreshFailureKind;
}

export const AGENT_PAIRING_STATE_EVENT = "suite:agent-pairing-state-changed";

export interface AgentPairingState {
	version: 1;
	endpoint: string;
	device: string;
	token: string;
	pairedAt: string;
	updatedAt: string;
}

export type AgentPairingThrottleSource =
	| "local-abuse"
	| "supabase"
	| "none"
	| "unknown";

export interface AgentBrokerErrorDetails {
	message: string;
	status: number;
	retryAfterSeconds: number;
	reason: string;
	throttleSource: AgentPairingThrottleSource;
}

export class AgentPairingRequestError extends Error {
	readonly status: number;
	readonly retryAfterSeconds: number;
	readonly reason: string;
	readonly throttleSource: AgentPairingThrottleSource;

	constructor(details: AgentBrokerErrorDetails) {
		super(details.message);
		this.name = "AgentPairingRequestError";
		this.status = details.status;
		this.retryAfterSeconds = details.retryAfterSeconds;
		this.reason = details.reason;
		this.throttleSource = details.throttleSource;
	}
}

export type PythonToolRequest = Record<string, unknown> & {
	script: string;
	args: Record<string, unknown>;
	cwd?: string;
};
