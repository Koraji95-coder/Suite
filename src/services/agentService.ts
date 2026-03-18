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
	isFetchRequestError,
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
import { buildPromptForProfile } from "./agentPromptPacks";
import { fetchAgentProfileCatalog, healthCheckAgent } from "./agent/catalog";
import {
	cancelBrokerOrchestrationRun,
	createBrokerOrchestrationRun,
	getBrokerAgentActivity,
	getBrokerAgentTask,
	getBrokerOrchestrationRun,
	listBrokerAgentTasks,
	reviewBrokerAgentTask,
	subscribeBrokerRunEvents,
} from "./agent/orchestration";
import {
	confirmPairingVerificationViaBroker,
	requestPairingCodeByEmailViaBroker,
	requestPairingVerificationLinkViaBroker,
} from "./agent/pairingVerification";
import {
	AGENT_PAIRING_STATE_EVENT,
	type AgentActivityItem,
	type AgentBrokerErrorDetails,
	type AgentPairingAction,
	type AgentPairingRefreshResult,
	type AgentPairingState,
	type AgentPairingThrottleSource,
	type AgentPairingVerificationOptions,
	type AgentProfileCatalogItem,
	type AgentResponse,
	type AgentReviewAction,
	type AgentRunCreateRequest,
	type AgentRunEventStream,
	type AgentRunEventStreamHandlers,
	type AgentRunSnapshot,
	type AgentSendOptions,
	type AgentTask,
	type AgentTaskItem,
	type AgentTaskPriority,
	type AgentTaskStatus,
	type PythonToolRequest,
} from "./agent/types";
import { logSecurityEvent } from "./securityEventService";
export { AGENT_PAIRING_STATE_EVENT, AgentPairingRequestError } from "./agent/types";
export type {
	AgentActivityItem,
	AgentPairingAction,
	AgentPairingRefreshResult,
	AgentPairingVerificationOptions,
	AgentProfileCatalogItem,
	AgentResponse,
	AgentReviewAction,
	AgentRunCreateRequest,
	AgentRunEventStream,
	AgentRunEventStreamHandlers,
	AgentRunSnapshot,
	AgentSendOptions,
	AgentTask,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
	PythonToolRequest,
} from "./agent/types";

const AGENT_PAIRING_SETTING_KEY = "agent_pairing_state_v1";
const DEFAULT_RESTORE_WINDOW_HOURS = 24;
const MAX_RESTORE_WINDOW_HOURS = 24 * 30;
const NO_EXPIRY_ENV_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTrueEnvValue(rawValue: string | undefined): boolean {
	return NO_EXPIRY_ENV_TRUE_VALUES.has(
		String(rawValue || "")
			.trim()
			.toLowerCase(),
	);
}

function resolvePairingRestoreWindowMs(): number {
	const rawValue = Number(
		String(
			import.meta.env.VITE_AGENT_PAIRING_RESTORE_WINDOW_HOURS || "",
		).trim(),
	);
	const normalizedHours =
		Number.isFinite(rawValue) && rawValue > 0
			? Math.min(MAX_RESTORE_WINDOW_HOURS, Math.max(1, Math.trunc(rawValue)))
			: DEFAULT_RESTORE_WINDOW_HOURS;
	return normalizedHours * 60 * 60 * 1000;
}

const MAX_RESTORE_AGE_MS = resolvePairingRestoreWindowMs();
const PAIRING_RESTORE_NO_EXPIRY = isTrueEnvValue(
	import.meta.env.VITE_AGENT_PAIRING_RESTORE_NO_EXPIRY,
);
const AGENT_SESSION_RETRY_AFTER_MAX_SECONDS = 120;
const SUPABASE_SESSION_LOOKUP_TIMEOUT_MS = 8_000;
const DEFAULT_AGENT_CONNECT_TIMEOUT_MS = 30_000;
const MAX_DIRECT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_HEALTH_TIMEOUT_MS = 8_000;
const MIN_AGENT_HEALTH_TIMEOUT_MS = 3_000;
const MAX_AGENT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_STREAM_MAX_MS = 20 * 60 * 1000;
const MIN_AGENT_STREAM_MAX_MS = 30_000;
const MAX_AGENT_STREAM_MAX_MS = 60 * 60 * 1000;

class AgentService {
	private baseUrl: string;
	private gatewayUrl: string;
	private brokerUrl: string;
	private useBroker: boolean;
	private brokerPaired = false;
	private pairingConfirmInFlight = new Map<string, Promise<boolean>>();
	private lastHealthError: string | null = null;
	private activeUserId: string | null = null;
	private activeUserEmail: string | null = null;
	private activeUserIsAdmin = false;
	private pairingRefreshInFlight: Promise<AgentPairingRefreshResult> | null =
		null;
	private activeDirectChatAbortController: AbortController | null = null;
	private activeDirectChatCancelledByUser = false;

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
			let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
			const sessionResult = await Promise.race([
				supabase.auth.getSession().then((value) => ({
					timedOut: false as const,
					value,
				})),
				new Promise<{ timedOut: true }>((resolve) => {
					timeoutHandle = setTimeout(
						() => resolve({ timedOut: true }),
						SUPABASE_SESSION_LOOKUP_TIMEOUT_MS,
					);
				}),
			]);
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			if (sessionResult.timedOut) {
				logger.warn("Supabase session lookup timed out", "AgentService", {
					timeoutMs: SUPABASE_SESSION_LOOKUP_TIMEOUT_MS,
				});
				return null;
			}
			const {
				data: { session },
				error,
			} = sessionResult.value;
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

	private formatAgentGatewayFailureMessage(
		status: number,
		details: string,
	): string {
		const message = String(details || "").trim();
		if (message && !/internal server error/i.test(message)) {
			if (status >= 500 && /llm request failed/i.test(message)) {
				return (
					"Agent model request failed in the gateway. " +
					"Try another agent/profile or restart the gateway/provider runtime."
				);
			}
			return message;
		}
		if (status >= 500) {
			return (
				"Agent request failed in the gateway/provider runtime. " +
				"Try another profile or restart gateway/provider services."
			);
		}
		if (status === 429) {
			return "Agent request is rate-limited. Please retry in a few seconds.";
		}
		return message || `Agent request failed (status ${status}).`;
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
			const payload = (await response.clone().json()) as {
				code?: string;
				error?: string;
				message?: string;
				retry_after_seconds?: number | string;
				meta?: {
					retryable?: boolean;
				};
			} | null;
			code = String(payload?.code || "").trim();
			message = String(payload?.error || payload?.message || "").trim();
			payloadRetryAfter = this.parsePositiveInteger(
				payload?.retry_after_seconds,
			);
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
			const payload = (await response.clone().json()) as {
				error?: string;
				message?: string;
				reason?: string;
				retry_after_seconds?: number | string;
				throttle_source?: string;
			} | null;
			payloadMessage = String(payload?.error || payload?.message || "").trim();
			payloadReason = String(payload?.reason || "")
				.trim()
				.toLowerCase();
			payloadSource = String(payload?.throttle_source || "").trim();
			payloadRetryAfter = this.parsePositiveInteger(
				payload?.retry_after_seconds,
			);
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
		return requestPairingVerificationLinkViaBroker(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				pairingConfirmInFlight: this.pairingConfirmInFlight,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
				readPairingBrokerError: (response, fallback) =>
					this.readPairingBrokerError(response, fallback),
				getBrokerPaired: () => this.brokerPaired,
				setBrokerPaired: (paired) => {
					this.brokerPaired = paired;
				},
				emitPairingStateChanged: () => this.emitPairingStateChanged(),
				clearPersistedPairingForActiveUser: () =>
					this.clearPersistedPairingForActiveUser(),
			},
			action,
			pairingCode,
			options,
		);
	}

	async requestPairingCodeByEmail(
		options?: AgentPairingVerificationOptions,
	): Promise<void> {
		return requestPairingCodeByEmailViaBroker(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				pairingConfirmInFlight: this.pairingConfirmInFlight,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
				readPairingBrokerError: (response, fallback) =>
					this.readPairingBrokerError(response, fallback),
				getBrokerPaired: () => this.brokerPaired,
				setBrokerPaired: (paired) => {
					this.brokerPaired = paired;
				},
				emitPairingStateChanged: () => this.emitPairingStateChanged(),
				clearPersistedPairingForActiveUser: () =>
					this.clearPersistedPairingForActiveUser(),
			},
			options,
		);
	}

	async confirmPairingVerification(
		action: AgentPairingAction,
		challengeId: string,
	): Promise<boolean> {
		return confirmPairingVerificationViaBroker(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				pairingConfirmInFlight: this.pairingConfirmInFlight,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
				readPairingBrokerError: (response, fallback) =>
					this.readPairingBrokerError(response, fallback),
				getBrokerPaired: () => this.brokerPaired,
				setBrokerPaired: (paired) => {
					this.brokerPaired = paired;
				},
				emitPairingStateChanged: () => this.emitPairingStateChanged(),
				clearPersistedPairingForActiveUser: () =>
					this.clearPersistedPairingForActiveUser(),
			},
			action,
			challengeId,
		);
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

		if (!PAIRING_RESTORE_NO_EXPIRY) {
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
				const isUnauthorized =
					response.status === 401 || response.status === 403;
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

	private resolveDirectConnectTimeoutMs(taskTimeout?: number): number {
		const configuredConnectTimeout = Number(
			import.meta.env.VITE_AGENT_CONNECT_TIMEOUT_MS,
		);
		const configuredTimeout = Number(import.meta.env.VITE_AGENT_TIMEOUT);
		const candidate =
			taskTimeout ??
			(Number.isFinite(configuredConnectTimeout) && configuredConnectTimeout > 0
				? configuredConnectTimeout
				: Number.isFinite(configuredTimeout) && configuredTimeout > 0
					? configuredTimeout
					: DEFAULT_AGENT_CONNECT_TIMEOUT_MS);
		return Math.min(
			MAX_DIRECT_CONNECT_TIMEOUT_MS,
			Math.max(1_000, Math.trunc(candidate)),
		);
	}

	private resolveDirectStreamMaxMs(): number {
		const configured = Number(import.meta.env.VITE_AGENT_STREAM_MAX_MS);
		if (!Number.isFinite(configured) || configured <= 0) {
			return DEFAULT_AGENT_STREAM_MAX_MS;
		}
		return Math.min(
			MAX_AGENT_STREAM_MAX_MS,
			Math.max(MIN_AGENT_STREAM_MAX_MS, Math.trunc(configured)),
		);
	}

	private resolveHealthCheckTimeoutMs(): number {
		const configuredTimeout = Number(
			String(import.meta.env.VITE_AGENT_HEALTH_TIMEOUT_MS || "").trim(),
		);
		const candidate =
			Number.isFinite(configuredTimeout) && configuredTimeout > 0
				? configuredTimeout
				: DEFAULT_AGENT_HEALTH_TIMEOUT_MS;
		return Math.min(
			MAX_AGENT_HEALTH_TIMEOUT_MS,
			Math.max(MIN_AGENT_HEALTH_TIMEOUT_MS, Math.trunc(candidate)),
		);
	}

	cancelActiveRequest(): boolean {
		if (!this.activeDirectChatAbortController) {
			return false;
		}
		this.activeDirectChatCancelledByUser = true;
		this.activeDirectChatAbortController.abort();
		return true;
	}

	/**
	 * Send a message to the agent for AI processing
	 */
	async sendMessage(
		message: string,
		options?: AgentSendOptions,
	): Promise<AgentResponse> {
		const profileId = options?.profileId ?? DEFAULT_AGENT_PROFILE;
		const prompt = buildPromptForProfile(profileId, message, {
			mode: options?.promptMode ?? "manual",
			templateLabel: options?.templateLabel,
		});
		return this.makeRequest(
			{
				task: "chat",
				params: { message: prompt || message },
				profileId,
			},
			options,
		);
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

	private async makeDirectChatStreamRequest(args: {
		task: AgentTask;
		profileId: AgentProfileId;
		modelCandidates: string[];
		headers: Record<string, string>;
		startTime: number;
		options?: AgentSendOptions;
	}): Promise<AgentResponse> {
		const { task, profileId, modelCandidates, headers, startTime, options } =
			args;
		const connectTimeoutMs = this.resolveDirectConnectTimeoutMs(task.timeout);
		const streamMaxMs = this.resolveDirectStreamMaxMs();
		const model = modelCandidates[0] || "";
		const chatMessage =
			typeof task.params?.message === "string" && task.params.message.trim()
				? task.params.message
				: JSON.stringify(task);
		const payload: Record<string, unknown> = {
			message: chatMessage,
			profile_id: profileId,
			stream: true,
		};
		if (model) {
			payload.model = model;
		}

		const abortController = new AbortController();
		this.activeDirectChatCancelledByUser = false;
		this.activeDirectChatAbortController = abortController;
		let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
		let streamTimedOut = false;
		let streamedResponse = "";
		let streamModel = model;
		let streamError = "";
		let streamDone = false;

		const applyStreamPayload = (payloadValue: string) => {
			const trimmed = payloadValue.trim();
			if (!trimmed) return;
			if (trimmed === "[DONE]") {
				streamDone = true;
				return;
			}

			try {
				const decoded = JSON.parse(trimmed) as {
					delta?: string;
					response?: string;
					model?: string;
					error?: string;
				} | null;
				if (!decoded || typeof decoded !== "object") {
					return;
				}
				if (typeof decoded.model === "string" && decoded.model.trim()) {
					streamModel = decoded.model.trim();
				}
				if (typeof decoded.error === "string" && decoded.error.trim()) {
					streamError = decoded.error.trim();
				}
				const delta =
					typeof decoded.delta === "string"
						? decoded.delta
						: typeof decoded.response === "string"
							? decoded.response
							: "";
				if (delta) {
					streamedResponse += delta;
					options?.onStreamUpdate?.(streamedResponse);
				}
			} catch {
				streamedResponse += trimmed;
				options?.onStreamUpdate?.(streamedResponse);
			}
		};

		try {
			const response = await fetchWithTimeout(`${this.baseUrl}/webhook`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				timeoutMs: connectTimeoutMs,
				signal: abortController.signal,
				requestName: "Agent gateway webhook connect",
			});

			if (!response.ok) {
				const rawDetails = await this.readBrokerError(
					response,
					`Agent request failed (${response.status})`,
				);
				const failureMessage = this.formatAgentGatewayFailureMessage(
					response.status,
					rawDetails,
				);
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
				throw new Error(failureMessage);
			}

			const contentType = String(response.headers.get("content-type") || "")
				.trim()
				.toLowerCase();
			if (!contentType.includes("text/event-stream") || !response.body) {
				let data: Record<string, unknown>;
				try {
					data = (await response.json()) as Record<string, unknown>;
				} catch {
					const text = await response.text().catch(() => "");
					data = {
						model: streamModel || model || "",
						response: text,
					};
				}
				const executionTime = Date.now() - startTime;
				return {
					success: true,
					data,
					executionTime,
				};
			}

			streamTimeoutHandle = setTimeout(() => {
				streamTimedOut = true;
				abortController.abort();
			}, streamMaxMs);

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const read = await reader.read();
				if (read.done) break;

				buffer += decoder
					.decode(read.value, { stream: true })
					.replace(/\r\n/g, "\n")
					.replace(/\r/g, "\n");

				let separatorIndex = buffer.indexOf("\n\n");
				while (separatorIndex !== -1) {
					const block = buffer.slice(0, separatorIndex);
					buffer = buffer.slice(separatorIndex + 2);
					separatorIndex = buffer.indexOf("\n\n");

					if (!block.trim()) continue;
					for (const line of block.split("\n")) {
						if (!line || line.startsWith(":")) continue;
						if (!line.startsWith("data:")) continue;
						const dataValue = line.slice(5).trimStart();
						applyStreamPayload(dataValue);
					}
				}
			}

			const trailing = decoder.decode().trim();
			if (trailing) {
				for (const line of trailing.split("\n")) {
					if (!line || line.startsWith(":")) continue;
					if (!line.startsWith("data:")) continue;
					applyStreamPayload(line.slice(5).trimStart());
				}
			}

			const executionTime = Date.now() - startTime;
			if (streamError && !streamedResponse.trim()) {
				return {
					success: false,
					error: streamError,
					executionTime,
				};
			}

			if (streamError && streamedResponse.trim()) {
				return {
					success: true,
					data: {
						model: streamModel || model || "",
						response: streamedResponse,
						incomplete: true,
						finish_reason: "error",
						warning: streamError,
					},
					executionTime,
				};
			}

			if (!streamDone && !streamedResponse.trim()) {
				return {
					success: false,
					error: "Agent stream ended before returning a response.",
					executionTime,
				};
			}

			return {
				success: true,
				data: {
					model: streamModel || model || "",
					response: streamedResponse,
				},
				executionTime,
			};
		} catch (error) {
			const executionTime = Date.now() - startTime;
			if (isFetchRequestError(error) && error.kind === "aborted") {
				if (streamTimedOut) {
					if (streamedResponse.trim()) {
						return {
							success: true,
							data: {
								model: streamModel || model || "",
								response: streamedResponse,
								incomplete: true,
								finish_reason: "timeout",
								warning: `Stream exceeded ${Math.round(streamMaxMs / 1000)} seconds and was stopped.`,
							},
							executionTime,
						};
					}
					return {
						success: false,
						error: `Agent stream timed out after ${Math.round(streamMaxMs / 1000)} seconds.`,
						executionTime,
					};
				}

				if (this.activeDirectChatCancelledByUser) {
					if (streamedResponse.trim()) {
						return {
							success: true,
							data: {
								model: streamModel || model || "",
								response: streamedResponse,
								incomplete: true,
								finish_reason: "cancelled",
								warning: "Request cancelled by user.",
							},
							executionTime,
						};
					}
					return {
						success: false,
						error: "Request cancelled before the agent produced a response.",
						executionTime,
					};
				}
			}
			return {
				success: false,
				error: mapFetchErrorMessage(error, "Unknown error"),
				executionTime,
			};
		} finally {
			if (streamTimeoutHandle) {
				clearTimeout(streamTimeoutHandle);
			}
			if (this.activeDirectChatAbortController === abortController) {
				this.activeDirectChatAbortController = null;
				this.activeDirectChatCancelledByUser = false;
			}
		}
	}

	/**
	 * Core request method
	 */
	private async makeRequest(
		task: AgentTask,
		options?: AgentSendOptions,
	): Promise<AgentResponse> {
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

			const configuredTimeout = Number(import.meta.env.VITE_AGENT_TIMEOUT);
			const timeout =
				task.timeout ??
				(Number.isFinite(configuredTimeout) && configuredTimeout > 0
					? Math.max(configuredTimeout, 90_000)
					: 90_000);

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
					}),
					timeoutMs: timeout,
					requestName: "Agent broker webhook request",
				});

				if (!response.ok) {
					const rawDetails = await this.readBrokerError(
						response,
						`Agent request failed (${response.status})`,
					);
					const failureMessage = this.formatAgentGatewayFailureMessage(
						response.status,
						rawDetails,
					);
					if (response.status === 401 || response.status === 403) {
						await this.unpair();
						await logSecurityEvent(
							"agent_request_unauthorized",
							"Agent request returned unauthorized; pairing was revoked.",
						);
					}
					logger.error("Agent request failed", "AgentService", {
						status: response.status,
						statusText: response.statusText,
						task: task.task,
						profileId,
						message: failureMessage,
					});
					throw new Error(failureMessage);
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

			if (task.task === "chat") {
				return await this.makeDirectChatStreamRequest({
					task,
					profileId,
					modelCandidates,
					headers,
					startTime,
					options,
				});
			}

			const timeout = this.resolveDirectConnectTimeoutMs(task.timeout);
			const model = modelCandidates[0] || "";
			const payload: Record<string, unknown> = {
				message: JSON.stringify(task),
				profile_id: profileId,
			};
			if (model) {
				payload.model = model;
			}

			const response = await fetchWithTimeout(`${this.baseUrl}/webhook`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				timeoutMs: timeout,
				requestName: "Agent gateway webhook request",
			});

			if (!response.ok) {
				const rawDetails = await this.readBrokerError(
					response,
					`Agent request failed (${response.status})`,
				);
				const failureMessage = this.formatAgentGatewayFailureMessage(
					response.status,
					rawDetails,
				);
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
				logger.error("Agent request failed", "AgentService", {
					status: response.status,
					statusText: response.statusText,
					task: task.task,
					profileId,
					message: failureMessage,
				});
				throw new Error(failureMessage);
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
		return healthCheckAgent(
			{
				useBroker: this.useBroker,
				baseUrl: this.baseUrl,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
				setLastHealthError: (message) => {
					this.lastHealthError = message;
				},
			},
			this.resolveHealthCheckTimeoutMs(),
		);
	}

	async fetchProfileCatalog(): Promise<{
		success: boolean;
		profiles: AgentProfileCatalogItem[];
		error?: string;
	}> {
		return fetchAgentProfileCatalog({
			useBroker: this.useBroker,
			brokerUrl: this.brokerUrl,
			getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
		});
	}

	async createOrchestrationRun(input: AgentRunCreateRequest): Promise<{
		success: boolean;
		runId?: string;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		return createBrokerOrchestrationRun(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			input,
		);
	}

	async getOrchestrationRun(runId: string): Promise<{
		success: boolean;
		run?: AgentRunSnapshot;
		requestId?: string;
		error?: string;
	}> {
		return getBrokerOrchestrationRun(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			runId,
		);
	}

	async cancelOrchestrationRun(runId: string): Promise<{
		success: boolean;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		return cancelBrokerOrchestrationRun(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			runId,
		);
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
		return listBrokerAgentTasks(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			filters,
		);
	}

	async getAgentTask(taskId: string): Promise<{
		success: boolean;
		task?: AgentTaskItem;
		requestId?: string;
		error?: string;
	}> {
		return getBrokerAgentTask(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			taskId,
		);
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
		return reviewBrokerAgentTask(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			taskId,
			action,
			note,
		);
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
		return getBrokerAgentActivity(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			options,
		);
	}

	subscribeOrchestrationRunEvents(
		runId: string,
		handlers: AgentRunEventStreamHandlers,
	): AgentRunEventStream {
		return subscribeBrokerRunEvents(
			{
				useBroker: this.useBroker,
				brokerUrl: this.brokerUrl,
				getSupabaseAccessToken: () => this.getSupabaseAccessToken(),
			},
			runId,
			handlers,
		);
	}
}

// Export singleton instance
export const agentService = new AgentService();
