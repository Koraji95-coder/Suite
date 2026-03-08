/**
 * Suite Agent Bridge Service
 * Connects Suite frontend to ZeroClaw agent (Koro) for automation tasks
 *
 * IMPLEMENTATION GUIDE FOR BOLT:
 * ==============================
 * Agent: ZeroClaw/Koro running at http://127.0.0.1:3000/gateway
 *
 * All methods must:
 * 1. Make HTTP POST requests to the agent gateway
 * 2. Include Authorization bearer token after pairing
 * 3. Handle timeouts (default 30s, max 5min for long tasks)
 * 4. Return Promise<AgentResponse> with success/data/error fields
 *
 * Methods to implement:
 * - pair(pairingCode): Get token from agent
 * - sendMessage(message): Direct message to agent
 * - executePythonScript(path, args): Run Python via agent
 * - generateFloorPlan(projectId): Create floor plan
 * - analyzeDrawingList(filePath): Validate drawings
 * - generateTransmittal(drawingIds): Create transmittal
 * - analyzeProject(projectId): Full project analysis
 *
 * See: /workspaces/Suite/BOLT_AGENT_INTEGRATION_PROMPT.md for full spec
 * See: src/services/agentService.ts for TypeScript interfaces
 */

import {
	type AgentProfileId,
	DEFAULT_AGENT_PROFILE,
	getAgentModelCandidates,
} from "../components/agent/agentProfiles";
import { isDevAdminEmail } from "../lib/devAccess";
import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "../lib/fetchWithTimeout";
import { logger } from "../lib/logger";
import { secureTokenStorage } from "../lib/secureTokenStorage";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "../settings/userSettings";
import { supabase } from "../supabase/client";
import { isSupabaseConfigured } from "../supabase/utils";
import { logSecurityEvent } from "./securityEventService";

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
	finalOutput?: string;
	finalError?: string;
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

export type PythonToolRequest = Record<string, unknown> & {
	script: string;
	args: Record<string, unknown>;
	cwd?: string;
};

const AGENT_PAIRING_SETTING_KEY = "agent_pairing_state_v1";
const MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1000;
const AGENT_SESSION_RETRY_AFTER_MAX_SECONDS = 120;
export const AGENT_PAIRING_STATE_EVENT = "suite:agent-pairing-state-changed";

interface AgentPairingState {
	version: 1;
	endpoint: string;
	device: string;
	token: string;
	pairedAt: string;
	updatedAt: string;
}

type AgentPairingThrottleSource =
	| "local-abuse"
	| "supabase"
	| "none"
	| "unknown";

interface AgentBrokerErrorDetails {
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

class AgentService {
	private baseUrl: string;
	private gatewayUrl: string;
	private brokerUrl: string;
	private useBroker: boolean;
	private brokerPaired = false;
	private lastHealthError: string | null = null;
	private activeUserId: string | null = null;
	private activeUserEmail: string | null = null;
	private activeUserIsAdmin = false;
	private pairingRefreshInFlight: Promise<AgentPairingRefreshResult> | null =
		null;

	constructor() {
		const transport = String(import.meta.env.VITE_AGENT_TRANSPORT || "")
			.trim()
			.toLowerCase();
		this.useBroker = transport === "backend" || transport === "broker";
		this.brokerUrl = String(
			import.meta.env.VITE_AGENT_BROKER_URL || "/api/agent",
		).replace(/\/+$/, "");
		// VITE_AGENT_URL → legacy alias, kept for backward compat
		// VITE_AGENT_GATEWAY_URL → canonical ZeroClaw gateway endpoint
		this.gatewayUrl =
			import.meta.env.VITE_AGENT_GATEWAY_URL ||
			import.meta.env.VITE_AGENT_URL ||
			"http://127.0.0.1:3000";
		// Strip trailing slash for consistency
		this.baseUrl = this.gatewayUrl.replace(/\/+$/, "");
		if (!this.useBroker && typeof window !== "undefined") {
			const hostname = String(window.location.hostname || "")
				.trim()
				.toLowerCase();
			const isLocalHost =
				hostname === "localhost" ||
				hostname === "127.0.0.1" ||
				hostname === "::1" ||
				hostname.endsWith(".local");
			if (!import.meta.env.DEV && hostname && !isLocalHost) {
				logger.warn(
					"Direct agent transport enabled outside local/dev; broker mode is recommended.",
					"AgentService",
					{
						transport: transport || "direct",
						host: hostname,
					},
				);
			}
		}
	}

	getEndpoint(): string {
		return this.useBroker ? this.brokerUrl : this.baseUrl;
	}

	usesBroker(): boolean {
		return this.useBroker;
	}

	async getBrokerConfig(): Promise<{
		ok: boolean;
		missing: string[];
		warnings?: string[];
		require_webhook_secret?: boolean;
	} | null> {
		if (!this.useBroker) return null;

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				ok: false,
				missing: ["Supabase session required"],
				warnings: [],
			};
		}

		try {
			const response = await fetchWithTimeout(`${this.brokerUrl}/config`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				timeoutMs: 15_000,
				requestName: "Agent broker config request",
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				logger.warn("Broker config request failed", "AgentService", {
					status: response.status,
					body,
				});
				return {
					ok: false,
					missing: ["Agent broker unavailable"],
					warnings: [],
				};
			}

			return (await response.json()) as {
				ok: boolean;
				missing: string[];
				warnings?: string[];
				require_webhook_secret?: boolean;
			};
		} catch (error) {
			logger.warn("Broker config lookup failed", "AgentService", { error });
			return {
				ok: false,
				missing: ["Agent broker unavailable"],
				warnings: [],
			};
		}
	}

	getLastHealthError(): string | null {
		return this.lastHealthError;
	}

	setActiveUser(
		userId: string | null,
		email?: string | null,
		isAdmin = false,
	): void {
		const nextUserId = userId?.trim() || null;
		if (this.activeUserId && this.activeUserId !== nextUserId) {
			secureTokenStorage.setScope(this.activeUserId);
			secureTokenStorage.clearToken();
			this.brokerPaired = false;
		}

		this.activeUserId = nextUserId;
		this.activeUserEmail = email?.trim().toLowerCase() || null;
		this.activeUserIsAdmin = Boolean(isAdmin);
		secureTokenStorage.setScope(this.activeUserId);
	}

	private isAdminUser(): boolean {
		if (this.activeUserIsAdmin) return true;
		return isDevAdminEmail(this.activeUserEmail);
	}

	private async getSupabaseAccessToken(): Promise<string | null> {
		if (!isSupabaseConfigured()) {
			logger.warn(
				"Supabase not configured; agent broker requires auth.",
				"AgentService",
			);
			return null;
		}

		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn("Failed to fetch Supabase session", "AgentService", {
					error,
				});
				return null;
			}
			return session?.access_token ?? null;
		} catch (error) {
			logger.warn("Supabase session lookup failed", "AgentService", { error });
			return null;
		}
	}

	private async readBrokerError(
		response: Response,
		fallback: string,
	): Promise<string> {
		return parseResponseErrorMessage(response, fallback);
	}

	private parsePositiveInteger(value: unknown): number {
		if (typeof value === "number" && Number.isFinite(value)) {
			return Math.max(0, Math.trunc(value));
		}
		if (typeof value === "string") {
			const parsed = Number.parseInt(value.trim(), 10);
			if (Number.isFinite(parsed)) {
				return Math.max(0, parsed);
			}
		}
		return 0;
	}

	private parseRetryAfterSeconds(response: Response): number {
		const fromHeader = this.parsePositiveInteger(
			response.headers.get("Retry-After"),
		);
		return Math.min(AGENT_SESSION_RETRY_AFTER_MAX_SECONDS, fromHeader);
	}

	private async readSessionBrokerError(response: Response): Promise<{
		code: string;
		message: string;
		retryAfterSeconds: number;
		retryable: boolean;
	}> {
		let code = "";
		let message = "";
		let payloadRetryAfter = 0;
		let retryable = false;

		try {
			const payload = (await response.clone().json()) as
				| {
						code?: string;
						error?: string;
						message?: string;
						retry_after_seconds?: number | string;
						meta?: {
							retryable?: boolean;
						};
				  }
				| null;
			code = String(payload?.code || "").trim();
			message = String(payload?.error || payload?.message || "").trim();
			payloadRetryAfter = this.parsePositiveInteger(payload?.retry_after_seconds);
			retryable = Boolean(payload?.meta?.retryable);
		} catch {
			// Ignore parse issues and fallback to response text.
		}

		if (!message) {
			message = await this.readBrokerError(
				response,
				`Agent session request failed (${response.status}).`,
			);
		}
		if (!message) {
			message = `Agent session request failed (${response.status}).`;
		}

		const retryAfterSeconds = Math.min(
			AGENT_SESSION_RETRY_AFTER_MAX_SECONDS,
			Math.max(this.parseRetryAfterSeconds(response), payloadRetryAfter),
		);

		return {
			code,
			message,
			retryAfterSeconds,
			retryable,
		};
	}

	private emitPairingStateChanged(): void {
		if (typeof window === "undefined") return;
		window.dispatchEvent(new CustomEvent(AGENT_PAIRING_STATE_EVENT));
	}

	private normalizePairingThrottleSource(
		responseStatus: number,
		message: string,
		reason: string,
		payloadSource: string,
	): AgentPairingThrottleSource {
		const explicit = payloadSource.trim().toLowerCase();
		if (
			explicit === "local-abuse" ||
			explicit === "supabase" ||
			explicit === "none"
		) {
			return explicit;
		}
		if (responseStatus !== 429) {
			return "none";
		}
		const sourceText = `${reason} ${message}`.toLowerCase();
		if (
			sourceText.includes("supabase") ||
			sourceText.includes("smtp") ||
			sourceText.includes("email rate limit")
		) {
			return "supabase";
		}
		return "local-abuse";
	}

	private async readPairingBrokerError(
		response: Response,
		fallback: string,
	): Promise<AgentBrokerErrorDetails> {
		const defaultMessage = await this.readBrokerError(response, fallback);
		const retryFromHeader = this.parsePositiveInteger(
			response.headers.get("Retry-After"),
		);

		let payloadMessage = "";
		let payloadReason = "";
		let payloadSource = "";
		let payloadRetryAfter = 0;

		try {
			const payload = (await response.clone().json()) as
				| {
						error?: string;
						message?: string;
						reason?: string;
						retry_after_seconds?: number | string;
						throttle_source?: string;
				  }
				| null;
			payloadMessage = String(payload?.error || payload?.message || "").trim();
			payloadReason = String(payload?.reason || "").trim().toLowerCase();
			payloadSource = String(payload?.throttle_source || "").trim();
			payloadRetryAfter = this.parsePositiveInteger(payload?.retry_after_seconds);
		} catch {
			// Ignore parse errors; fallback message handling already covers this.
		}

		const retryAfterSeconds =
			retryFromHeader > 0 ? retryFromHeader : payloadRetryAfter;
		const messageCandidate = payloadMessage || defaultMessage || fallback;
		const throttleSource = this.normalizePairingThrottleSource(
			response.status,
			messageCandidate,
			payloadReason,
			payloadSource,
		);

		let message = messageCandidate;
		if (response.status === 429 && retryAfterSeconds > 0) {
			if (throttleSource === "supabase") {
				message = `Email provider rate limit is active. Retry in ${retryAfterSeconds} seconds.`;
			} else {
				message = `Too many verification requests. Retry in ${retryAfterSeconds} seconds.`;
			}
			if (payloadReason) {
				message = `${message} (${payloadReason})`;
			}
		}

		return {
			message,
			status: response.status,
			retryAfterSeconds,
			reason: payloadReason,
			throttleSource,
		};
	}

	async requestPairingVerificationLink(
		action: AgentPairingAction,
		pairingCode?: string,
		options?: AgentPairingVerificationOptions,
	): Promise<void> {
		if (!this.useBroker) {
			throw new Error(
				"Pairing verification email flow is only available in broker transport mode.",
			);
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			throw new Error("Supabase session required for brokered pairing.");
		}

		const payload: Record<string, string> = { action };
		if (action === "pair") {
			const code = (pairingCode || "").trim();
			if (code) {
				payload.pairing_code = code;
			}
		}
		const redirectTo = (options?.redirectTo || "").trim();
		if (redirectTo) {
			payload.redirect_to = redirectTo;
		}
		const redirectPath = (options?.redirectPath || "").trim();
		if (redirectPath) {
			payload.redirect_path = redirectPath;
		}

		const response = await fetchWithTimeout(
			`${this.brokerUrl}/pairing-challenge`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify(payload),
				timeoutMs: 20_000,
				requestName: "Agent pairing challenge request",
			},
		);

		if (!response.ok) {
			const details = await this.readPairingBrokerError(
				response,
				"Unable to send verification email for pairing action.",
			);
			throw new AgentPairingRequestError(details);
		}
	}

	async requestPairingCodeByEmail(
		options?: AgentPairingVerificationOptions,
	): Promise<void> {
		if (!this.useBroker) {
			throw new Error(
				"Email pairing-code request is only available in broker transport mode.",
			);
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			throw new Error("Supabase session required for brokered pairing.");
		}

		const payload: Record<string, string> = {};
		const redirectTo = (options?.redirectTo || "").trim();
		if (redirectTo) {
			payload.redirect_to = redirectTo;
		}
		const redirectPath = (options?.redirectPath || "").trim();
		if (redirectPath) {
			payload.redirect_path = redirectPath;
		}

		const response = await fetchWithTimeout(
			`${this.brokerUrl}/pairing-code/request`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify(payload),
				timeoutMs: 20_000,
				requestName: "Agent pairing code email request",
			},
		);

		if (!response.ok) {
			const details = await this.readPairingBrokerError(
				response,
				"Unable to request pairing code email.",
			);
			throw new AgentPairingRequestError(details);
		}
	}

	async confirmPairingVerification(
		action: AgentPairingAction,
		challengeId: string,
	): Promise<boolean> {
		if (!this.useBroker) {
			throw new Error(
				"Pairing verification email flow is only available in broker transport mode.",
			);
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			throw new Error("Supabase session required for brokered pairing.");
		}

		const response = await fetchWithTimeout(
			`${this.brokerUrl}/pairing-confirm`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify({ challenge_id: challengeId.trim() }),
				timeoutMs: 20_000,
				requestName: "Agent pairing confirm request",
			},
		);

		if (!response.ok) {
			const details = await this.readPairingBrokerError(
				response,
				"Unable to verify pairing action.",
			);
			throw new AgentPairingRequestError(details);
		}

		const data = (await response.json()) as
			| { paired?: boolean; action?: AgentPairingAction }
			| undefined;
		if (data?.action && data.action !== action) {
			throw new Error(
				`Verification action mismatch. Expected ${action}, received ${data.action}.`,
			);
		}
		this.brokerPaired = Boolean(data?.paired);

		if (action === "pair") {
			await logSecurityEvent(
				"agent_pair_success",
				"Agent pair action verified and completed via email challenge.",
			);
			this.emitPairingStateChanged();
		}

		if (action === "unpair") {
			secureTokenStorage.clearToken();
			await this.clearPersistedPairingForActiveUser();
			await logSecurityEvent(
				"agent_unpair",
				"Agent unpair action verified and completed via email challenge.",
			);
			this.emitPairingStateChanged();
		}

		return this.brokerPaired;
	}

	private isTaskAllowedForCurrentUser(taskName: string): boolean {
		if (this.isAdminUser()) return true;

		const nonAdminAllowedTasks = new Set(["chat"]);
		return nonAdminAllowedTasks.has(taskName);
	}

	async restorePairingForActiveUser(): Promise<{
		restored: boolean;
		reason: string;
	}> {
		if (this.useBroker) {
			const wasPaired = this.brokerPaired;
			const result = await this.refreshPairingStatusDetailed();
			if (result.paired) {
				if (!wasPaired) {
					await logSecurityEvent(
						"agent_restore_success",
						"Agent pairing restored via broker session.",
					);
				}
				return { restored: true, reason: "restored" };
			}
			if (result.transient) {
				return {
					restored: false,
					reason: result.code || "session-transient",
				};
			}
			return { restored: false, reason: "no-server-session" };
		}

		if (!this.activeUserId) {
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore skipped: no active user.",
			);
			return { restored: false, reason: "no-active-user" };
		}

		if (this.checkPairing()) {
			return { restored: true, reason: "already-paired" };
		}

		const saved = await loadSetting<AgentPairingState | null>(
			AGENT_PAIRING_SETTING_KEY,
			null,
			null,
		);

		if (!saved) {
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore skipped: no saved pairing.",
			);
			return { restored: false, reason: "no-saved-pairing" };
		}

		if (
			saved.version !== 1 ||
			saved.endpoint !== this.baseUrl ||
			saved.device !== secureTokenStorage.getDeviceFingerprint() ||
			typeof saved.token !== "string"
		) {
			await this.clearPersistedPairingForActiveUser();
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore failed: saved pairing did not match device or endpoint.",
			);
			return { restored: false, reason: "invalid-saved-pairing" };
		}

		const updatedAt = Date.parse(saved.updatedAt);
		if (
			!Number.isFinite(updatedAt) ||
			Date.now() - updatedAt > MAX_RESTORE_AGE_MS
		) {
			await this.clearPersistedPairingForActiveUser();
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore failed: trusted pairing window expired.",
			);
			return { restored: false, reason: "restore-window-expired" };
		}

		const imported = secureTokenStorage.importOpaqueToken(saved.token);
		if (!imported) {
			await this.clearPersistedPairingForActiveUser();
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore failed: saved token expired or invalid.",
			);
			return { restored: false, reason: "expired-or-invalid-token" };
		}

		await logSecurityEvent(
			"agent_restore_success",
			"Agent pairing restored for trusted device.",
		);

		return { restored: true, reason: "restored" };
	}

	private async persistPairingForActiveUser(): Promise<void> {
		if (this.useBroker) return;
		if (!this.activeUserId) return;

		const token = secureTokenStorage.exportOpaqueToken();
		if (!token) return;

		const timestamp = new Date().toISOString();
		const payload: AgentPairingState = {
			version: 1,
			endpoint: this.baseUrl,
			device: secureTokenStorage.getDeviceFingerprint(),
			token,
			pairedAt: timestamp,
			updatedAt: timestamp,
		};

		const result = await saveSetting(AGENT_PAIRING_SETTING_KEY, payload, null);
		if (!result.success) {
			logger.warn("Failed to persist agent pairing state", "AgentService", {
				error: result.error,
			});
		}
	}

	private async clearPersistedPairingForActiveUser(): Promise<void> {
		if (this.useBroker) return;
		if (!this.activeUserId) return;
		await deleteSetting(AGENT_PAIRING_SETTING_KEY, null);
	}

	/**
	 * Pair with the agent using the 6-digit code
	 * This must be done once when the agent starts
	 */
	async pair(pairingCode: string): Promise<boolean> {
		try {
			logger.info("Attempting to pair with agent", "AgentService");

			if (this.useBroker) {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					throw new Error("Supabase session required for brokered pairing.");
				}

				const response = await fetchWithTimeout(`${this.brokerUrl}/pair`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({ pairing_code: pairingCode.trim() }),
					timeoutMs: 20_000,
					requestName: "Agent broker pair request",
				});

				if (!response.ok) {
					const message = await this.readBrokerError(
						response,
						"Unable to pair with the provided code.",
					);
					throw new Error(message);
				}

				const data = (await response.json()) as
					| { paired?: boolean }
					| undefined;
				this.brokerPaired = Boolean(data?.paired);
				this.emitPairingStateChanged();
				await logSecurityEvent(
					"agent_pair_success",
					"Agent paired successfully via backend broker.",
				);
				return this.brokerPaired;
			}

			// ZeroClaw gateway expects the 6-digit pairing code in the
			// X-Pairing-Code header (NOT in a JSON body).
			// See: suite-agent/crates/gateway/src/handlers.rs → handle_pair
			const response = await fetchWithTimeout(`${this.baseUrl}/pair`, {
				method: "POST",
				headers: {
					"X-Pairing-Code": pairingCode.trim(),
				},
				timeoutMs: 20_000,
				requestName: "Agent gateway pair request",
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				logger.error(
					`Pairing failed: ${response.status} ${body}`,
					"AgentService",
					new Error(response.statusText),
				);
				throw new Error(`Pairing failed: ${response.statusText}`);
			}

			const data = await response.json();

			// Store token securely using obfuscated sessionStorage
			secureTokenStorage.setToken(data.token);
			await this.persistPairingForActiveUser();
			await logSecurityEvent(
				"agent_pair_success",
				"Agent paired successfully with provided pairing code.",
			);

			logger.info("Successfully paired with agent", "AgentService");
			return true;
		} catch (error) {
			logger.error("Agent pairing error", "AgentService", error);
			await logSecurityEvent(
				"agent_pair_failed",
				"Agent pairing failed for provided pairing code.",
			);
			return false;
		}
	}

	/**
	 * Check if we're already paired (token exists and is valid)
	 */
	checkPairing(): boolean {
		if (this.useBroker) {
			return this.brokerPaired;
		}
		return secureTokenStorage.hasToken();
	}

	async refreshPairingStatus(): Promise<boolean> {
		const result = await this.refreshPairingStatusDetailed();
		return result.paired;
	}

	async refreshPairingStatusDetailed(): Promise<AgentPairingRefreshResult> {
		if (!this.useBroker) {
			const paired = this.checkPairing();
			return {
				paired,
				ok: true,
				transient: false,
				terminal: false,
				status: 200,
				code: "OK",
				message: "",
				retryAfterSeconds: 0,
				kind: "none",
			};
		}

		if (this.pairingRefreshInFlight) {
			return this.pairingRefreshInFlight;
		}

		const inFlight = (async (): Promise<AgentPairingRefreshResult> => {
			const accessToken = await this.getSupabaseAccessToken();
			if (!accessToken) {
				this.brokerPaired = false;
				return {
					paired: false,
					ok: false,
					transient: false,
					terminal: true,
					status: 401,
					code: "AUTH_REQUIRED",
					message: "Supabase session required for brokered agent access.",
					retryAfterSeconds: 0,
					kind: "session-required",
				};
			}

			try {
				const response = await fetchWithTimeout(`${this.brokerUrl}/session`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					timeoutMs: 15_000,
					requestName: "Agent broker pairing session request",
				});

				if (response.ok) {
					const data = (await response.json()) as { paired?: boolean } | null;
					this.brokerPaired = Boolean(data?.paired);
					return {
						paired: this.brokerPaired,
						ok: true,
						transient: false,
						terminal: false,
						status: response.status,
						code: "OK",
						message: "",
						retryAfterSeconds: 0,
						kind: "none",
					};
				}

				const errorPayload = await this.readSessionBrokerError(response);
				const isUnauthorized = response.status === 401 || response.status === 403;
				const isProviderTimeout =
					response.status === 503 &&
					(errorPayload.code === "AUTH_PROVIDER_TIMEOUT" ||
						errorPayload.retryable);
				const isRateLimited = response.status === 429;
				const isTransient =
					isRateLimited || isProviderTimeout || response.status >= 500;

				if (isUnauthorized) {
					this.brokerPaired = false;
					return {
						paired: false,
						ok: false,
						transient: false,
						terminal: true,
						status: response.status,
						code: errorPayload.code || "AUTH_INVALID",
						message:
							errorPayload.message || "Invalid or expired Supabase token.",
						retryAfterSeconds: 0,
						kind: "unauthorized",
					};
				}

				if (!isTransient) {
					this.brokerPaired = false;
				}

				const code = errorPayload.code
					? errorPayload.code
					: isRateLimited
						? "AGENT_SESSION_RATE_LIMITED"
						: isProviderTimeout
							? "AUTH_PROVIDER_TIMEOUT"
							: response.status >= 500
								? "AGENT_SESSION_SERVER_ERROR"
								: "AGENT_SESSION_INVALID";

				return {
					paired: isTransient ? this.brokerPaired : false,
					ok: false,
					transient: isTransient,
					terminal: !isTransient,
					status: response.status,
					code,
					message: errorPayload.message,
					retryAfterSeconds: errorPayload.retryAfterSeconds,
					kind: isRateLimited
						? "rate-limited"
						: isProviderTimeout
							? "provider-timeout"
							: response.status >= 500
								? "server-error"
								: "bad-response",
				};
			} catch (error) {
				logger.warn(
					"Failed to refresh broker pairing status; keeping prior state.",
					"AgentService",
					{
						error,
					},
				);
				return {
					paired: this.brokerPaired,
					ok: false,
					transient: true,
					terminal: false,
					status: 0,
					code: "AGENT_SESSION_NETWORK_ERROR",
					message: "Unable to refresh pairing status right now.",
					retryAfterSeconds: 0,
					kind: "network",
				};
			}
		})();

		this.pairingRefreshInFlight = inFlight;
		try {
			return await inFlight;
		} finally {
			if (this.pairingRefreshInFlight === inFlight) {
				this.pairingRefreshInFlight = null;
			}
		}
	}

	/**
	 * Unpair from the agent (clear token)
	 */
	async unpair(): Promise<void> {
		if (this.useBroker) {
			const accessToken = await this.getSupabaseAccessToken();
			if (accessToken) {
				await fetchWithTimeout(`${this.brokerUrl}/session/clear`, {
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}` },
					credentials: "include",
					timeoutMs: 15_000,
					requestName: "Agent broker unpair request",
				}).catch(() => null);
			}
			this.brokerPaired = false;
			this.emitPairingStateChanged();
		}

		secureTokenStorage.clearToken();
		await this.clearPersistedPairingForActiveUser();
		await logSecurityEvent(
			"agent_unpair",
			"Agent pairing was removed for current device/session.",
		);
		logger.info("Unpaired from agent", "AgentService");
	}

	/**
	 * Get token (for internal use only - never expose to UI)
	 */
	private getToken(): string | null {
		return secureTokenStorage.getToken();
	}

	private shouldRequireWebhookSecret(): boolean {
		if (this.useBroker) return false;
		const value = import.meta.env.VITE_AGENT_REQUIRE_WEBHOOK_SECRET;
		if (typeof value !== "string") return true;
		return value.trim().toLowerCase() !== "false";
	}

	/**
	 * Send a message to the agent for AI processing
	 */
	async sendMessage(
		message: string,
		options?: AgentSendOptions,
	): Promise<AgentResponse> {
		return this.makeRequest({
			task: "chat",
			params: { message },
			profileId: options?.profileId,
		});
	}

	/**
	 * Execute a Python script via the agent
	 */
	async executePythonScript(
		request: PythonToolRequest,
	): Promise<AgentResponse> {
		return this.makeRequest({
			task: "python_execute",
			params: request,
		});
	}

	/**
	 * AutoCAD automation tasks
	 */
	async generateFloorPlan(specs: {
		width: number;
		height: number;
		rooms: number;
		output_path?: string;
	}): Promise<AgentResponse> {
		return this.executePythonScript({
			script: "suite_autocad_generator.py",
			args: {
				task: "floor_plan",
				params: specs,
			},
		});
	}

	async calculateElectricalGrid(specs: {
		conductor_size?: string;
		grid_spacing?: number;
		soil_resistivity?: number;
		fault_current?: number;
	}): Promise<AgentResponse> {
		return this.executePythonScript({
			script: "suite_autocad_generator.py",
			args: {
				task: "electrical_grid",
				params: specs,
			},
		});
	}

	async calculateVoltageDrop(specs: {
		length: number;
		current: number;
		voltage?: number;
		conductor?: "Copper" | "Aluminum";
	}): Promise<AgentResponse> {
		return this.executePythonScript({
			script: "suite_autocad_generator.py",
			args: {
				task: "voltage_drop",
				params: specs,
			},
		});
	}

	/**
	 * Project management AI tasks
	 */
	async analyzeProject(
		projectData: Record<string, unknown>,
	): Promise<AgentResponse> {
		return this.sendMessage(
			`Analyze this electrical engineering project and provide recommendations: ${JSON.stringify(projectData)}`,
		);
	}

	async forecastTimeline(projectData: {
		type: string;
		complexity: "low" | "medium" | "high";
		team_size?: number;
	}): Promise<AgentResponse> {
		return this.sendMessage(
			`Based on similar projects in memory, forecast the timeline for: ${JSON.stringify(projectData)}`,
		);
	}

	async generateTransmittal(data: {
		project_id: string;
		files: string[];
		recipient: string;
		notes?: string;
	}): Promise<AgentResponse> {
		return this.makeRequest({
			task: "generate_transmittal",
			params: data,
		});
	}

	/**
	 * Memory management
	 */
	async rememberProjectPattern(pattern: string): Promise<AgentResponse> {
		return this.makeRequest({
			task: "memory_store",
			params: {
				content: pattern,
				tags: ["project_pattern", "suite"],
			},
		});
	}

	async recallSimilarProjects(query: string): Promise<AgentResponse> {
		return this.makeRequest({
			task: "memory_recall",
			params: { query },
		});
	}

	/**
	 * Research and documentation
	 */
	async researchStandard(standard: string): Promise<AgentResponse> {
		return this.sendMessage(
			`Research and summarize key requirements from ${standard} standard for electrical engineering`,
		);
	}

	async researchTopic(topic: string, context?: string): Promise<AgentResponse> {
		const prompt = context
			? `Research and provide comprehensive information about "${topic}" in the context of ${context}. Include current standards, best practices, and any relevant regulations.`
			: `Research and provide comprehensive information about "${topic}". Include current standards, best practices, and relevant documentation.`;
		return this.sendMessage(prompt);
	}

	async searchElectricalStandards(query: string): Promise<AgentResponse> {
		return this.sendMessage(
			`Search for electrical engineering standards, codes, and regulations related to: ${query}. Include NEC 2023, NFPA 70, IEEE standards where applicable.`,
		);
	}

	async analyzeRegulations(specifications: string): Promise<AgentResponse> {
		return this.sendMessage(
			`Analyze the following electrical specifications against current NEC 2023 and NFPA 70 regulations: ${specifications}. Identify any compliance issues and recommend corrections.`,
		);
	}

	async generateDocumentation(specs: {
		type: "design_report" | "calculation_sheet" | "test_report";
		data: Record<string, unknown>;
	}): Promise<AgentResponse> {
		return this.sendMessage(
			`Generate a ${specs.type} document based on: ${JSON.stringify(specs.data)}`,
		);
	}

	/**
	 * Core request method
	 */
	private async makeRequest(task: AgentTask): Promise<AgentResponse> {
		if (!this.isTaskAllowedForCurrentUser(task.task)) {
			await logSecurityEvent(
				"agent_task_blocked_non_admin",
				`Non-admin task blocked: ${task.task}`,
			);
			return {
				success: false,
				error:
					"This agent action is admin-only. Contact an administrator for elevated agent permissions.",
			};
		}

		const startTime = Date.now();
		const profileId = task.profileId || DEFAULT_AGENT_PROFILE;
		const modelCandidates = getAgentModelCandidates(profileId);

		if (!this.checkPairing()) {
			if (this.useBroker) {
				const refreshed = await this.refreshPairingStatus();
				if (!refreshed) {
					logger.warn("Attempted request without pairing", "AgentService");
					return {
						success: false,
						error: "Not paired with agent. Please pair first.",
					};
				}
			} else {
				logger.warn("Attempted request without pairing", "AgentService");
				return {
					success: false,
					error: "Not paired with agent. Please pair first.",
				};
			}
		}

		if (this.useBroker) {
			const accessToken = await this.getSupabaseAccessToken();
			if (!accessToken) {
				return {
					success: false,
					error:
						"Supabase session required for brokered agent access. Please sign in.",
				};
			}

			const timeout =
				task.timeout ?? (Number(import.meta.env.VITE_AGENT_TIMEOUT) || 30_000);

			try {
				const response = await fetchWithTimeout(`${this.brokerUrl}/webhook`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({
						message: JSON.stringify(task),
						profile_id: profileId,
						model: modelCandidates[0],
						model_candidates: modelCandidates,
						fallback_models: modelCandidates.slice(1),
					}),
					timeoutMs: timeout,
					requestName: "Agent broker webhook request",
				});

				if (!response.ok) {
					if (response.status === 401 || response.status === 403) {
						await this.unpair();
						await logSecurityEvent(
							"agent_request_unauthorized",
							"Agent request returned unauthorized; pairing was revoked.",
						);
					}
					logger.error(
						`Agent request failed: ${response.statusText}`,
						"AgentService",
					);
					throw new Error(`Agent request failed: ${response.statusText}`);
				}

				const data = await response.json();
				const executionTime = Date.now() - startTime;

				logger.info(
					`Agent request completed in ${executionTime}ms`,
					"AgentService",
					{ task: task.task },
				);

				return {
					success: true,
					data: data,
					executionTime: executionTime,
				};
			} catch (error) {
				const executionTime = Date.now() - startTime;
				logger.error("Agent request error", "AgentService", error);
				return {
					success: false,
					error: mapFetchErrorMessage(error, "Unknown error"),
					executionTime,
				};
			}
		}

		const token = this.getToken();
		if (!token) {
			logger.error("Token validation failed", "AgentService");
			return {
				success: false,
				error: "Invalid token. Please pair again.",
			};
		}

		try {
			logger.debug(`Making agent request: ${task.task}`, "AgentService");

			// ZeroClaw gateway: POST /webhook
			// Required: Authorization: Bearer <token>
			// Optional: X-Webhook-Secret (if configured on agent side)
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			};

			const webhookSecret = import.meta.env.VITE_AGENT_WEBHOOK_SECRET;
			const requireWebhookSecret = this.shouldRequireWebhookSecret();

			if (requireWebhookSecret && !webhookSecret) {
				return {
					success: false,
					error:
						"Agent webhook secret is required but not configured. Set VITE_AGENT_WEBHOOK_SECRET in your environment.",
				};
			}

			if (webhookSecret) {
				headers["X-Webhook-Secret"] = webhookSecret;
			}

			const timeout =
				task.timeout ?? (Number(import.meta.env.VITE_AGENT_TIMEOUT) || 30_000);
			const attempts = modelCandidates.length > 0 ? modelCandidates : [""];
			let response: Response | null = null;

			for (let index = 0; index < attempts.length; index += 1) {
				const model = attempts[index];
				const payload: Record<string, unknown> = {
					message: JSON.stringify(task),
					profile_id: profileId,
				};
				if (model) {
					payload.model = model;
				}
				if (index < attempts.length - 1) {
					payload.fallback_models = attempts.slice(index + 1);
				}

				response = await fetchWithTimeout(`${this.baseUrl}/webhook`, {
					method: "POST",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: timeout,
					requestName: "Agent gateway webhook request",
				});

				const canRetry =
					!response.ok && response.status >= 500 && index < attempts.length - 1;
				if (canRetry) {
					logger.warn(
						"Agent model attempt failed; trying fallback.",
						"AgentService",
						{
							profileId,
							failedModel: model,
							nextModel: attempts[index + 1],
							status: response.status,
						},
					);
					continue;
				}
				break;
			}

			if (!response) {
				throw new Error("Agent gateway did not return a response.");
			}

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					const responseBody = await response.text().catch(() => "");
					const mentionsSecret = /secret/i.test(responseBody);

					if (mentionsSecret) {
						await logSecurityEvent(
							"agent_webhook_secret_rejected",
							"Agent rejected webhook secret; check VITE_AGENT_WEBHOOK_SECRET and gateway secret configuration.",
						);
						throw new Error(
							"Webhook secret rejected by gateway. Verify VITE_AGENT_WEBHOOK_SECRET matches the gateway configuration.",
						);
					}

					await this.unpair();
					await logSecurityEvent(
						"agent_request_unauthorized",
						"Agent request returned unauthorized; pairing was revoked.",
					);
				}
				logger.error(
					`Agent request failed: ${response.statusText}`,
					"AgentService",
				);
				throw new Error(`Agent request failed: ${response.statusText}`);
			}

			const data = await response.json();
			const executionTime = Date.now() - startTime;

			logger.info(
				`Agent request completed in ${executionTime}ms`,
				"AgentService",
				{ task: task.task },
			);

			return {
				success: true,
				data: data,
				executionTime: executionTime,
			};
		} catch (error) {
			const executionTime = Date.now() - startTime;
			logger.error("Agent request error", "AgentService", error);
			return {
				success: false,
				error: mapFetchErrorMessage(error, "Unknown error"),
				executionTime,
			};
		}
	}

	/**
	 * Check if agent is running and healthy
	 */
	async healthCheck(): Promise<boolean> {
		try {
			if (this.useBroker) {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					this.lastHealthError =
						"Supabase session required for brokered agent access.";
					return false;
				}

				const response = await fetchWithTimeout(`${this.brokerUrl}/health`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					timeoutMs: 3000,
					requestName: "Agent broker health check",
				});

				const isHealthy = response.ok;
				this.lastHealthError = isHealthy
					? null
					: `Gateway responded with status ${response.status}`;
				logger.debug(
					`Agent health check: ${isHealthy ? "healthy" : "unhealthy"}`,
					"AgentService",
				);
				return isHealthy;
			}

			const response = await fetchWithTimeout(`${this.baseUrl}/health`, {
				method: "GET",
				timeoutMs: 3000,
				requestName: "Agent gateway health check",
			});
			const isHealthy = response.ok;
			this.lastHealthError = isHealthy
				? null
				: `Gateway responded with status ${response.status}`;
			logger.debug(
				`Agent health check: ${isHealthy ? "healthy" : "unhealthy"}`,
				"AgentService",
			);
			return isHealthy;
		} catch (error) {
			const message = mapFetchErrorMessage(error, "Unknown connection error");
			this.lastHealthError = message;
			logger.warn(
				`Agent health check unavailable at ${this.baseUrl}: ${message}`,
				"AgentService",
			);
			return false;
		}
	}

	async createOrchestrationRun(input: AgentRunCreateRequest): Promise<{
		success: boolean;
		runId?: string;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				error:
					"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				error: "Supabase session required for orchestration runs.",
			};
		}

		try {
			const response = await fetchWithTimeout(`${this.brokerUrl}/runs`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify({
					objective: input.objective,
					profiles: input.profiles,
					synthesisProfile: input.synthesisProfile,
					context: input.context ?? {},
					timeoutMs: input.timeoutMs,
				}),
				timeoutMs: 20_000,
				requestName: "Agent orchestration run create request",
			});

			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() ||
						"Unable to create orchestration run.",
				};
			}

			return {
				success: Boolean(data.success),
				runId: String(data.runId || ""),
				status: String(data.status || ""),
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				error: mapFetchErrorMessage(
					error,
					"Unable to create orchestration run.",
				),
			};
		}
	}

	async getOrchestrationRun(runId: string): Promise<{
		success: boolean;
		run?: AgentRunSnapshot;
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				error:
					"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				error: "Supabase session required for orchestration runs.",
			};
		}

		try {
			const response = await fetchWithTimeout(
				`${this.brokerUrl}/runs/${encodeURIComponent(runId)}`,
				{
					method: "GET",
					headers: { Authorization: `Bearer ${accessToken}` },
					credentials: "include",
					timeoutMs: 20_000,
					requestName: "Agent orchestration run get request",
				},
			);

			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() ||
						"Unable to fetch orchestration run.",
				};
			}

			return {
				success: Boolean(data.success),
				run: (data.run || undefined) as AgentRunSnapshot | undefined,
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				error: mapFetchErrorMessage(
					error,
					"Unable to fetch orchestration run.",
				),
			};
		}
	}

	async cancelOrchestrationRun(runId: string): Promise<{
		success: boolean;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				error:
					"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				error: "Supabase session required for orchestration runs.",
			};
		}

		try {
			const response = await fetchWithTimeout(
				`${this.brokerUrl}/runs/${encodeURIComponent(runId)}/cancel`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}` },
					credentials: "include",
					timeoutMs: 20_000,
					requestName: "Agent orchestration run cancel request",
				},
			);

			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() ||
						"Unable to cancel orchestration run.",
				};
			}

			return {
				success: Boolean(data.success),
				status: String(data.status || ""),
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				error: mapFetchErrorMessage(
					error,
					"Unable to cancel orchestration run.",
				),
			};
		}
	}

	async listAgentTasks(filters?: {
		status?: AgentTaskStatus | AgentTaskStatus[];
		priority?: AgentTaskPriority;
		assigneeProfile?: string;
		runId?: string;
		limit?: number;
	}): Promise<{
		success: boolean;
		tasks: AgentTaskItem[];
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				tasks: [],
				error:
					"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				tasks: [],
				error: "Supabase session required for agent task workflows.",
			};
		}

		try {
			const search = new URLSearchParams();
			if (filters?.status) {
				const values = Array.isArray(filters.status)
					? filters.status
					: [filters.status];
				const normalized = values
					.map((value) => String(value || "").trim())
					.filter(Boolean);
				if (normalized.length) {
					search.set("status", normalized.join(","));
				}
			}
			if (filters?.priority) {
				search.set("priority", String(filters.priority));
			}
			if (filters?.assigneeProfile) {
				search.set("assigneeProfile", String(filters.assigneeProfile).trim());
			}
			if (filters?.runId) {
				search.set("runId", String(filters.runId).trim());
			}
			if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
				search.set("limit", String(Math.max(1, Math.trunc(filters.limit))));
			}
			const url = `${this.brokerUrl}/tasks${search.toString() ? `?${search.toString()}` : ""}`;

			const response = await fetchWithTimeout(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 20_000,
				requestName: "Agent task list request",
			});
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					tasks: [],
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() || "Unable to list agent tasks.",
				};
			}
			const tasks = Array.isArray(data.tasks)
				? (data.tasks as AgentTaskItem[])
				: [];
			return {
				success: Boolean(data.success),
				tasks,
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				tasks: [],
				error: mapFetchErrorMessage(error, "Unable to list agent tasks."),
			};
		}
	}

	async getAgentTask(taskId: string): Promise<{
		success: boolean;
		task?: AgentTaskItem;
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				error:
					"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				error: "Supabase session required for agent task workflows.",
			};
		}

		try {
			const response = await fetchWithTimeout(
				`${this.brokerUrl}/tasks/${encodeURIComponent(taskId)}`,
				{
					method: "GET",
					headers: { Authorization: `Bearer ${accessToken}` },
					credentials: "include",
					timeoutMs: 20_000,
					requestName: "Agent task detail request",
				},
			);
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() || "Unable to fetch agent task.",
				};
			}
			return {
				success: Boolean(data.success),
				task: (data.task || undefined) as AgentTaskItem | undefined,
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				error: mapFetchErrorMessage(error, "Unable to fetch agent task."),
			};
		}
	}

	async reviewAgentTask(
		taskId: string,
		action: AgentReviewAction,
		note?: string,
	): Promise<{
		success: boolean;
		task?: AgentTaskItem;
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				error:
					"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				error: "Supabase session required for agent task workflows.",
			};
		}

		try {
			const response = await fetchWithTimeout(
				`${this.brokerUrl}/tasks/${encodeURIComponent(taskId)}/review`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({
						action,
						note: String(note || "").trim(),
					}),
					timeoutMs: 20_000,
					requestName: "Agent task review request",
				},
			);
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					requestId: String(data.requestId || ""),
					error:
						String(data.error || "").trim() || "Unable to review agent task.",
				};
			}
			return {
				success: Boolean(data.success),
				task: (data.task || undefined) as AgentTaskItem | undefined,
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				error: mapFetchErrorMessage(error, "Unable to review agent task."),
			};
		}
	}

	async getAgentActivity(options?: {
		runId?: string;
		limit?: number;
	}): Promise<{
		success: boolean;
		activity: AgentActivityItem[];
		requestId?: string;
		error?: string;
	}> {
		if (!this.useBroker) {
			return {
				success: false,
				activity: [],
				error:
					"Agent activity requires broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			};
		}
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				success: false,
				activity: [],
				error: "Supabase session required for agent activity.",
			};
		}

		try {
			const search = new URLSearchParams();
			if (options?.runId) {
				search.set("runId", String(options.runId).trim());
			}
			if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
				search.set("limit", String(Math.max(1, Math.trunc(options.limit))));
			}
			const url = `${this.brokerUrl}/activity${search.toString() ? `?${search.toString()}` : ""}`;
			const response = await fetchWithTimeout(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 20_000,
				requestName: "Agent activity request",
			});
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					success: false,
					activity: [],
					requestId: String(data.requestId || ""),
					error: String(data.error || "").trim() || "Unable to load activity.",
				};
			}
			const activity = Array.isArray(data.activity)
				? (data.activity as AgentActivityItem[])
				: [];
			return {
				success: Boolean(data.success),
				activity,
				requestId: String(data.requestId || ""),
			};
		} catch (error) {
			return {
				success: false,
				activity: [],
				error: mapFetchErrorMessage(error, "Unable to load activity."),
			};
		}
	}

	subscribeOrchestrationRunEvents(
		runId: string,
		handlers: AgentRunEventStreamHandlers,
	): AgentRunEventStream {
		const abortController = new AbortController();
		let closed = false;
		let closedNotified = false;

		const notifyClosed = () => {
			if (closedNotified) return;
			closedNotified = true;
			handlers.onClosed?.();
		};

		const close = () => {
			if (closed) return;
			closed = true;
			abortController.abort();
			notifyClosed();
		};

		if (!this.useBroker) {
			handlers.onError?.(
				"Agent orchestration event streaming requires broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			);
			notifyClosed();
			return { close };
		}

		const normalizedRunId = String(runId || "").trim();
		if (!normalizedRunId) {
			handlers.onError?.("Run id is required to stream orchestration events.");
			notifyClosed();
			return { close };
		}

		const parseEventBlock = (block: string): AgentRunEvent | null => {
			const lines = block.split("\n");
			let eventType = "message";
			let rawId = "";
			const dataLines: string[] = [];

			for (const line of lines) {
				if (!line || line.startsWith(":")) continue;
				const separator = line.indexOf(":");
				const field =
					separator >= 0 ? line.slice(0, separator).trim() : line.trim();
				const value =
					separator >= 0 ? line.slice(separator + 1).trimStart() : "";

				if (field === "event") {
					eventType = value || eventType;
					continue;
				}
				if (field === "id") {
					rawId = value;
					continue;
				}
				if (field === "data") {
					dataLines.push(value);
				}
			}

			if (dataLines.length === 0) return null;
			const dataText = dataLines.join("\n").trim();
			if (!dataText) return null;

			let parsed: Record<string, unknown> = {};
			try {
				const decoded = JSON.parse(dataText) as unknown;
				if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
					parsed = decoded as Record<string, unknown>;
				}
			} catch {
				parsed = {};
			}

			const payloadCandidate = parsed.payload;
			const payload =
				payloadCandidate &&
				typeof payloadCandidate === "object" &&
				!Array.isArray(payloadCandidate)
					? (payloadCandidate as Record<string, unknown>)
					: {};

			const numericIdFromPayload = Number(parsed.id ?? 0);
			const numericIdFromHeader = Number(rawId || 0);
			const numericId = Number.isFinite(numericIdFromPayload)
				? numericIdFromPayload
				: Number.isFinite(numericIdFromHeader)
					? numericIdFromHeader
					: 0;

			return {
				id: numericId > 0 ? numericId : 0,
				eventType: String(parsed.eventType ?? eventType ?? "message"),
				stage: String(parsed.stage ?? ""),
				profileId: String(parsed.profileId ?? ""),
				requestId: String(parsed.requestId ?? ""),
				message: String(parsed.message ?? ""),
				payload,
				createdAt: String(parsed.createdAt ?? ""),
			};
		};

		void (async () => {
			try {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					handlers.onError?.(
						"Supabase session required for orchestration event streaming.",
					);
					return;
				}

				const lastEventId = Math.max(0, Number(handlers.lastEventId || 0));
				const search = new URLSearchParams();
				if (lastEventId > 0) {
					search.set("lastEventId", String(lastEventId));
				}
				const url = `${this.brokerUrl}/runs/${encodeURIComponent(normalizedRunId)}/events${
					search.toString() ? `?${search.toString()}` : ""
				}`;

				const response = await fetch(url, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: "text/event-stream",
					},
					credentials: "include",
					signal: abortController.signal,
				});

				if (!response.ok) {
					const body = await response.text().catch(() => "");
					handlers.onError?.(
						body.trim() ||
							`Unable to subscribe to orchestration events (status ${response.status}).`,
					);
					return;
				}

				if (!response.body) {
					handlers.onError?.(
						"Streaming transport unavailable in this browser environment.",
					);
					return;
				}

				handlers.onOpen?.();

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (!closed) {
					const read = await reader.read();
					if (read.done) break;
					buffer += decoder
						.decode(read.value, { stream: true })
						.replace(/\r\n/g, "\n")
						.replace(/\r/g, "\n");

					let separatorIndex = buffer.indexOf("\n\n");
					while (separatorIndex !== -1) {
						const block = buffer.slice(0, separatorIndex).trim();
						buffer = buffer.slice(separatorIndex + 2);
						separatorIndex = buffer.indexOf("\n\n");

						if (!block) continue;
						const event = parseEventBlock(block);
						if (event) {
							handlers.onEvent(event);
						}
					}
				}
			} catch (error) {
				if (abortController.signal.aborted) return;
				handlers.onError?.(
					mapFetchErrorMessage(
						error,
						"Orchestration event stream disconnected unexpectedly.",
					),
				);
			} finally {
				notifyClosed();
			}
		})();

		return { close };
	}
}

// Export singleton instance
export const agentService = new AgentService();

