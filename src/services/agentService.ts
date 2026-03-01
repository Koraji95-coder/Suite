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
 * 3. Handle timeouts (default 90s, max 5min for long tasks)
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

import { isDevAdminEmail } from "../lib/devAccess";
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
}

export interface PairingCodeRequestResult {
	ok: boolean;
	message: string;
	code?: string;
	delivery?: string;
	expiresAt?: string | null;
	dashboardUrl?: string | null;
	forceNew?: boolean;
	emailSent?: boolean;
	emailTarget?: string | null;
	endpoint?: string;
	magicLinkUrl?: string | null;
	magicLinkExpiresAt?: string | null;
}

export type PairingCodeDelivery = "dashboard" | "email";

export interface PairingCodeRequestOptions {
	delivery?: PairingCodeDelivery;
	forceNew?: boolean;
	email?: string;
}

export interface PairingMagicLinkVerifyResult {
	ok: boolean;
	message: string;
	expiresAt?: string | null;
	pairingSource?: string | null;
}

export interface AgentModelOption {
	id: string;
	size?: number | null;
	modifiedAt?: string | null;
}

export interface AgentModelsResult {
	ok: boolean;
	provider: string;
	currentModel: string | null;
	models: AgentModelOption[];
	message?: string;
}

export interface ChatExecutionContext {
	profileId?: string;
	memoryNamespace?: string;
	docsUrl?: string;
}

export type PythonToolRequest = Record<string, unknown> & {
	script: string;
	args: Record<string, unknown>;
	cwd?: string;
};

const AGENT_PAIRING_SETTING_KEY = "agent_pairing_state_v1";
const MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1000;
const PAIRING_CODE_REGEX = /^\d{6}$/;

interface AgentPairingState {
	version: 1;
	endpoint: string;
	device: string;
	token: string;
	pairedAt: string;
	updatedAt: string;
}

class AgentService {
	private baseUrl: string;
	private gatewayUrl: string;
	private brokerUrl: string;
	private useBroker: boolean;
	private brokerPaired = false;
	private lastPairingReason: string | null = null;
	private lastPairingMessage: string | null = null;
	private lastHealthError: string | null = null;
	private activeUserId: string | null = null;
	private activeUserEmail: string | null = null;
	private activeUserIsAdmin = false;

	private logDiag(message: string, data?: Record<string, unknown>): void {
		logger.debug(message, "AgentDiag", data);
	}

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
			"/gateway";
		// Strip trailing slash for consistency
		this.baseUrl = this.gatewayUrl.replace(/\/+$/, "");
	}

	private async readErrorDetails(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const text = await response.text();
			if (!text) {
				return fallback;
			}
			try {
				const parsed = JSON.parse(text) as Record<string, unknown>;
				const parts: string[] = [];
				const error = parsed.error;
				const details = parsed.details;
				const missing = parsed.missing;
				const warnings = parsed.warnings;

				if (typeof error === "string" && error.trim().length > 0) {
					parts.push(error.trim());
				}
				if (typeof details === "string" && details.trim().length > 0) {
					parts.push(details.trim());
				}
				if (Array.isArray(missing) && missing.length > 0) {
					parts.push(`Missing: ${missing.join(", ")}`);
				}
				if (Array.isArray(warnings) && warnings.length > 0) {
					parts.push(`Warnings: ${warnings.join(", ")}`);
				}
				if (parts.length > 0) {
					return parts.join(" | ");
				}
			} catch {
				// Non-JSON response.
			}
			return text.trim() || fallback;
		} catch {
			return fallback;
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
		this.logDiag("Fetching broker config", {
			endpoint: `${this.brokerUrl}/config`,
		});

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			this.logDiag(
				"Broker config fetch skipped; missing Supabase access token",
			);
			return {
				ok: false,
				missing: ["Supabase session required"],
				warnings: [],
			};
		}

		try {
			const response = await fetch(`${this.brokerUrl}/config`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
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

			const config = (await response.json()) as {
				ok: boolean;
				missing: string[];
				warnings?: string[];
				require_webhook_secret?: boolean;
			};
			this.logDiag("Broker config fetched", {
				ok: config.ok,
				missing: config.missing?.length ?? 0,
				warnings: config.warnings?.length ?? 0,
				require_webhook_secret: config.require_webhook_secret ?? null,
			});
			return config;
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

	getLastPairingReason(): string | null {
		return this.lastPairingReason;
	}

	getLastPairingMessage(): string | null {
		return this.lastPairingMessage;
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
			if (!session) {
				return null;
			}

			const expiresAt = session.expires_at ?? null;
			const nowSeconds = Math.floor(Date.now() / 1000);
			if (expiresAt && expiresAt - nowSeconds <= 30) {
				const { data, error: refreshError } =
					await supabase.auth.refreshSession();
				if (refreshError) {
					logger.warn(
						"Failed to refresh expiring Supabase session",
						"AgentService",
						{
							error: refreshError,
						},
					);
					return session.access_token ?? null;
				}
				return data.session?.access_token ?? session.access_token ?? null;
			}

			return session.access_token ?? null;
		} catch (error) {
			logger.warn("Supabase session lookup failed", "AgentService", { error });
			return null;
		}
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
			const paired = await this.refreshPairingStatus();
			if (paired && !wasPaired) {
				await logSecurityEvent(
					"agent_restore_success",
					"Agent pairing restored via broker session.",
				);
				return { restored: true, reason: "restored" };
			}
			if (paired) {
				return { restored: true, reason: "already-paired" };
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
			const normalizedCode = pairingCode.trim();
			if (!PAIRING_CODE_REGEX.test(normalizedCode)) {
				throw new Error("Pairing code must be exactly 6 digits.");
			}
			logger.info("Attempting to pair with agent", "AgentService");
			this.logDiag("Pair attempt started", {
				mode: this.useBroker ? "broker" : "direct",
				endpoint: this.useBroker
					? `${this.brokerUrl}/pair`
					: `${this.baseUrl}/pair`,
				code_length: normalizedCode.length,
			});

			if (this.useBroker) {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					throw new Error(
						"Supabase session required for brokered pairing. Please sign in.",
					);
				}

				const response = await fetch(`${this.brokerUrl}/pair`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({ pairing_code: normalizedCode }),
				});

				if (!response.ok) {
					const body = await this.readErrorDetails(
						response,
						`Pairing failed (${response.status})`,
					);
					logger.error(
						`Brokered pairing failed: ${response.status} ${body}`,
						"AgentService",
						new Error(response.statusText),
					);
					throw new Error(body);
				}

				this.brokerPaired = true;
				this.lastPairingReason = null;
				this.lastPairingMessage = null;
				this.logDiag("Pair attempt succeeded", { mode: "broker" });
				await logSecurityEvent(
					"agent_pair_success",
					"Agent paired via backend broker.",
				);
				return true;
			}

			// ZeroClaw gateway expects the 6-digit pairing code in the
			// X-Pairing-Code header (NOT in a JSON body).
			// See: suite-agent/crates/gateway/src/handlers.rs → handle_pair
			const response = await fetch(`${this.baseUrl}/pair`, {
				method: "POST",
				headers: {
					"X-Pairing-Code": normalizedCode,
				},
			});

			if (!response.ok) {
				const body = await this.readErrorDetails(
					response,
					`Pairing failed (${response.status})`,
				);
				logger.error(
					`Pairing failed: ${response.status} ${body}`,
					"AgentService",
					new Error(response.statusText),
				);
				throw new Error(body);
			}

			const data = await response.json();

			// Store token securely using obfuscated sessionStorage
			secureTokenStorage.setToken(data.token);
			this.logDiag("Pair attempt succeeded", { mode: "direct" });
			await this.persistPairingForActiveUser();
			await logSecurityEvent(
				"agent_pair_success",
				"Agent paired successfully with provided pairing code.",
			);

			logger.info("Successfully paired with agent", "AgentService");
			return true;
		} catch (error) {
			this.logDiag("Pair attempt failed", {
				mode: this.useBroker ? "broker" : "direct",
				error: error instanceof Error ? error.message : String(error),
			});
			logger.error("Agent pairing error", "AgentService", error);
			await logSecurityEvent(
				"agent_pair_failed",
				"Agent pairing failed for provided pairing code.",
			);
			return false;
		}
	}

	async requestPairingCode(
		options: PairingCodeRequestOptions = {},
	): Promise<PairingCodeRequestResult> {
		if (!this.useBroker) {
			return {
				ok: false,
				message:
					"Request code is only available in broker mode. Use gateway dashboard directly.",
				dashboardUrl: "http://127.0.0.1:3000/",
			};
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				ok: false,
				message: "Sign in is required before requesting a pairing code.",
			};
		}

		const delivery: PairingCodeDelivery =
			options.delivery === "email" ? "email" : "dashboard";
		const requestBody: Record<string, unknown> = {
			delivery,
			force_new: Boolean(options.forceNew),
		};
		if (typeof options.email === "string" && options.email.trim()) {
			requestBody.email = options.email.trim();
		}

		const endpoints = [
			`${this.brokerUrl}/pin/generate`,
			`${this.brokerUrl}/pairing-code`,
		];

		try {
			let response: Response | null = null;
			let parsed: Record<string, unknown> = {};
			let endpointUsed = endpoints[0];

			for (let i = 0; i < endpoints.length; i++) {
				endpointUsed = endpoints[i];
				response = await fetch(endpointUsed, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify(requestBody),
				});

				const bodyText = await response.text();
				try {
					parsed = bodyText
						? (JSON.parse(bodyText) as Record<string, unknown>)
						: {};
				} catch {
					parsed = {};
				}

				// Backward compatibility with older or partially updated backend builds.
				// Try legacy route when custom endpoint is missing or method-not-allowed.
				if (
					!([404, 405, 501] as const).includes(
						response.status as 404 | 405 | 501,
					) ||
					i === endpoints.length - 1
				) {
					break;
				}
			}

			if (!response) {
				return {
					ok: false,
					message: "Failed to request pairing code.",
					dashboardUrl: "http://127.0.0.1:3000/",
				};
			}

			if (!response.ok) {
				return {
					ok: false,
					message:
						(typeof parsed.message === "string" && parsed.message) ||
						(typeof parsed.error === "string" && parsed.error) ||
						`Pairing code request failed (${response.status}).`,
					dashboardUrl:
						typeof parsed.dashboard_url === "string"
							? parsed.dashboard_url
							: "http://127.0.0.1:3000/",
					forceNew:
						typeof parsed.force_new === "boolean"
							? parsed.force_new
							: Boolean(options.forceNew),
					emailSent:
						typeof parsed.email_sent === "boolean"
							? parsed.email_sent
							: undefined,
					emailTarget:
						typeof parsed.email_target === "string"
							? parsed.email_target
							: null,
					endpoint: endpointUsed,
					magicLinkUrl:
						typeof parsed.magic_link_url === "string"
							? parsed.magic_link_url
							: null,
					magicLinkExpiresAt:
						typeof parsed.magic_link_expires_at === "string"
							? parsed.magic_link_expires_at
							: null,
				};
			}

			return {
				ok: true,
				message:
					(typeof parsed.message === "string" && parsed.message) ||
					"Pairing code requested.",
				code: typeof parsed.code === "string" ? parsed.code : undefined,
				delivery:
					typeof parsed.delivery === "string" ? parsed.delivery : undefined,
				expiresAt:
					typeof parsed.expires_at === "string" ? parsed.expires_at : null,
				dashboardUrl:
					typeof parsed.dashboard_url === "string"
						? parsed.dashboard_url
						: "http://127.0.0.1:3000/",
				forceNew:
					typeof parsed.force_new === "boolean"
						? parsed.force_new
						: Boolean(options.forceNew),
				emailSent:
					typeof parsed.email_sent === "boolean"
						? parsed.email_sent
						: undefined,
				emailTarget:
					typeof parsed.email_target === "string" ? parsed.email_target : null,
				endpoint: endpointUsed,
				magicLinkUrl:
					typeof parsed.magic_link_url === "string"
						? parsed.magic_link_url
						: null,
				magicLinkExpiresAt:
					typeof parsed.magic_link_expires_at === "string"
						? parsed.magic_link_expires_at
						: null,
			};
		} catch (error) {
			return {
				ok: false,
				message:
					error instanceof Error
						? error.message
						: "Failed to request pairing code.",
				dashboardUrl: "http://127.0.0.1:3000/",
			};
		}
	}

	async verifyPairingMagicLink(
		token: string,
		pairingCode: string,
	): Promise<PairingMagicLinkVerifyResult> {
		if (!this.useBroker) {
			return {
				ok: false,
				message:
					"Secure pairing links are only available when using the broker.",
			};
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				ok: false,
				message: "Sign in is required before verifying a pairing link.",
			};
		}

		const normalizedToken = token.trim();
		if (!normalizedToken) {
			return {
				ok: false,
				message: "Pairing link token is required.",
			};
		}
		const normalizedCode = pairingCode.trim();
		if (!PAIRING_CODE_REGEX.test(normalizedCode)) {
			return {
				ok: false,
				message: "A valid 6-digit pairing code is required.",
			};
		}

		try {
			const response = await fetch(`${this.brokerUrl}/pairing/verify`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify({
					token: normalizedToken,
					pairing_code: normalizedCode,
				}),
			});
			const payload = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			if (!response.ok) {
				return {
					ok: false,
					message:
						(typeof payload.message === "string" && payload.message) ||
						(typeof payload.error === "string" && payload.error) ||
						`Pairing link verification failed (${response.status}).`,
					expiresAt:
						typeof payload.expires_at === "string" ? payload.expires_at : null,
					pairingSource:
						typeof payload.pairing_source === "string"
							? payload.pairing_source
							: null,
				};
			}
			this.brokerPaired = true;
			this.lastPairingReason = null;
			this.lastPairingMessage = null;
			return {
				ok: true,
				message:
					(typeof payload.message === "string" && payload.message) ||
					"Pairing complete. You can now close this page.",
				expiresAt:
					typeof payload.expires_at === "string" ? payload.expires_at : null,
				pairingSource:
					typeof payload.pairing_source === "string"
						? payload.pairing_source
						: null,
			};
		} catch (error) {
			return {
				ok: false,
				message:
					error instanceof Error
						? error.message
						: "Pairing link verification failed.",
			};
		}
	}

	async getAvailableModels(): Promise<AgentModelsResult> {
		if (!this.useBroker) {
			return {
				ok: false,
				provider: "direct",
				currentModel: null,
				models: [],
				message: "Model catalog is available only in broker mode.",
			};
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				ok: false,
				provider: "broker",
				currentModel: null,
				models: [],
				message: "Sign in is required before loading models.",
			};
		}

		try {
			const response = await fetch(`${this.brokerUrl}/models`, {
				method: "GET",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
			});

			const payload = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;

			if (!response.ok) {
				return {
					ok: false,
					provider:
						typeof payload.provider === "string" ? payload.provider : "broker",
					currentModel:
						typeof payload.current_model === "string"
							? payload.current_model
							: null,
					models: [],
					message:
						(typeof payload.error === "string" && payload.error) ||
						`Failed to load model catalog (${response.status}).`,
				};
			}

			const rawModels = Array.isArray(payload.models) ? payload.models : [];
			const models: AgentModelOption[] = [];
			for (const entry of rawModels) {
				if (!entry || typeof entry !== "object") continue;
				const record = entry as Record<string, unknown>;
				const id = typeof record.id === "string" ? record.id.trim() : "";
				if (!id) continue;
				models.push({
					id,
					size: typeof record.size === "number" ? record.size : null,
					modifiedAt:
						typeof record.modified_at === "string" ? record.modified_at : null,
				});
			}

			return {
				ok: Boolean(payload.ok),
				provider:
					typeof payload.provider === "string" ? payload.provider : "broker",
				currentModel:
					typeof payload.current_model === "string"
						? payload.current_model
						: null,
				models,
				message:
					typeof payload.message === "string" ? payload.message : undefined,
			};
		} catch (error) {
			return {
				ok: false,
				provider: "broker",
				currentModel: null,
				models: [],
				message:
					error instanceof Error
						? error.message
						: "Failed to load model catalog.",
			};
		}
	}

	async setDefaultModel(
		model: string,
	): Promise<{ ok: boolean; message: string }> {
		if (!this.useBroker) {
			return {
				ok: false,
				message: "Model switching is available only in broker mode.",
			};
		}

		const normalizedModel = model.trim();
		if (!normalizedModel) {
			return { ok: false, message: "Model is required." };
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			return {
				ok: false,
				message: "Sign in is required before switching model.",
			};
		}

		try {
			const response = await fetch(`${this.brokerUrl}/model`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify({ model: normalizedModel }),
			});

			const payload = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;

			if (!response.ok) {
				return {
					ok: false,
					message:
						(typeof payload.error === "string" && payload.error) ||
						`Failed to switch model (${response.status}).`,
				};
			}

			return {
				ok: true,
				message:
					(typeof payload.message === "string" && payload.message) ||
					"Default model updated.",
			};
		} catch (error) {
			return {
				ok: false,
				message:
					error instanceof Error ? error.message : "Failed to switch model.",
			};
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
		if (!this.useBroker) {
			this.logDiag("refreshPairingStatus (direct)", {
				paired: this.checkPairing(),
			});
			return this.checkPairing();
		}

		this.logDiag("refreshPairingStatus (broker) started", {
			endpoint: `${this.brokerUrl}/session`,
		});
		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			this.brokerPaired = false;
			this.lastPairingReason = "missing_access_token";
			this.lastPairingMessage =
				"Sign in is required to restore broker pairing.";
			this.logDiag(
				"refreshPairingStatus (broker) missing Supabase access token",
			);
			return false;
		}

		try {
			const response = await fetch(`${this.brokerUrl}/session`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
			});

			if (!response.ok) {
				this.brokerPaired = false;
				this.lastPairingReason = `http_${response.status}`;
				this.lastPairingMessage = await this.readErrorDetails(
					response,
					`Session check failed (${response.status})`,
				);
				this.logDiag("refreshPairingStatus (broker) failed", {
					status: response.status,
				});
				return false;
			}

			const data = await response.json();
			this.brokerPaired = Boolean(data?.paired);
			this.lastPairingReason = this.brokerPaired
				? null
				: typeof data?.reason === "string"
					? data.reason
					: "not_paired";
			this.lastPairingMessage = this.brokerPaired
				? null
				: typeof data?.message === "string"
					? data.message
					: "Agent is not paired for this browser session.";
			this.logDiag("refreshPairingStatus (broker) completed", {
				paired: this.brokerPaired,
				expires_at: data?.expires_at ?? null,
				reason: this.lastPairingReason,
			});
			return this.brokerPaired;
		} catch (error) {
			logger.warn("Failed to refresh broker pairing status", "AgentService", {
				error,
			});
			this.brokerPaired = false;
			this.lastPairingReason = "request_exception";
			this.lastPairingMessage = "Failed to contact broker session endpoint.";
			this.logDiag("refreshPairingStatus (broker) exception", {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/**
	 * Unpair from the agent (clear token)
	 */
	async unpair(): Promise<void> {
		if (this.useBroker) {
			const accessToken = await this.getSupabaseAccessToken();
			if (accessToken) {
				await fetch(`${this.brokerUrl}/unpair`, {
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}` },
					credentials: "include",
				}).catch(() => null);
			}
			this.brokerPaired = false;
			this.lastPairingReason = "unpaired";
			this.lastPairingMessage = "Agent pairing was removed for this session.";
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

	private deriveWebhookSessionId(task: AgentTask): string | null {
		const params =
			task.params && typeof task.params === "object"
				? (task.params as Record<string, unknown>)
				: null;
		const raw =
			(typeof params?.memory_namespace === "string"
				? params.memory_namespace
				: typeof params?.agent_profile_id === "string"
					? `agent/${params.agent_profile_id}`
					: null) ?? null;
		if (!raw) return null;
		const normalized = raw.trim().slice(0, 120);
		return normalized.length > 0 ? normalized : null;
	}

	/**
	 * Send a message to the agent for AI processing
	 */
	async sendMessage(
		message: string,
		context?: ChatExecutionContext,
	): Promise<AgentResponse> {
		const params: Record<string, unknown> = { message };
		if (typeof context?.profileId === "string" && context.profileId.trim()) {
			params.agent_profile_id = context.profileId.trim();
		}
		if (
			typeof context?.memoryNamespace === "string" &&
			context.memoryNamespace.trim()
		) {
			params.memory_namespace = context.memoryNamespace.trim();
		}
		if (typeof context?.docsUrl === "string" && context.docsUrl.trim()) {
			params.docs_url = context.docsUrl.trim();
		}

		return this.makeRequest({
			task: "chat",
			params,
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
		const requestedTimeout =
			typeof task.timeout === "number" &&
			Number.isFinite(task.timeout) &&
			task.timeout > 0
				? Math.round(task.timeout)
				: Number(import.meta.env.VITE_AGENT_TIMEOUT) || 90_000;
		const timeout = Math.min(Math.max(requestedTimeout, 5_000), 300_000);
		const requestTask: AgentTask = {
			...task,
			timeout,
		};

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

			try {
				const sessionId = this.deriveWebhookSessionId(requestTask);
				const response = await fetch(`${this.brokerUrl}/webhook`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({
						message: JSON.stringify(requestTask),
						session_id: sessionId,
					}),
					signal: AbortSignal.timeout(timeout),
				});

				if (!response.ok) {
					const errorDetails = await this.readErrorDetails(
						response,
						`Agent request failed (${response.status})`,
					);
					if (response.status === 401 || response.status === 403) {
						await this.unpair();
						await logSecurityEvent(
							"agent_request_unauthorized",
							"Agent request returned unauthorized; pairing was revoked.",
						);
					}
					logger.error(`Agent request failed: ${errorDetails}`, "AgentService");
					throw new Error(errorDetails);
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
					error: error instanceof Error ? error.message : "Unknown error",
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

			const response = await fetch(`${this.baseUrl}/webhook`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					message: JSON.stringify(requestTask),
					session_id: this.deriveWebhookSessionId(requestTask),
				}),
				signal: AbortSignal.timeout(timeout),
			});

			if (!response.ok) {
				const responseBody = await this.readErrorDetails(
					response,
					`Agent request failed (${response.status})`,
				);
				if (response.status === 401 || response.status === 403) {
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
					`Agent request failed: ${response.status}`,
					"AgentService",
				);
				throw new Error(responseBody);
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
				error: error instanceof Error ? error.message : "Unknown error",
				executionTime,
			};
		}
	}

	/**
	 * Check if agent is running and healthy
	 */
	async healthCheck(): Promise<boolean> {
		try {
			this.logDiag("healthCheck started", {
				mode: this.useBroker ? "broker" : "direct",
				endpoint: this.useBroker
					? `${this.brokerUrl}/health`
					: `${this.baseUrl}/health`,
			});
			if (this.useBroker) {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					this.lastHealthError =
						"Supabase session required for brokered agent access.";
					this.logDiag("healthCheck failed; missing Supabase access token");
					return false;
				}

				const response = await fetch(`${this.brokerUrl}/health`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					signal: AbortSignal.timeout(3000),
				});

				const isHealthy = response.ok;
				this.lastHealthError = isHealthy
					? null
					: `Gateway responded with status ${response.status}`;
				logger.debug(
					`Agent health check: ${isHealthy ? "healthy" : "unhealthy"}`,
					"AgentService",
				);
				this.logDiag("healthCheck completed", {
					healthy: isHealthy,
					status: response.status,
					error: this.lastHealthError,
				});
				return isHealthy;
			}

			const response = await fetch(`${this.baseUrl}/health`, {
				method: "GET",
				signal: AbortSignal.timeout(3000),
			});
			const isHealthy = response.ok;
			this.lastHealthError = isHealthy
				? null
				: `Gateway responded with status ${response.status}`;
			logger.debug(
				`Agent health check: ${isHealthy ? "healthy" : "unhealthy"}`,
				"AgentService",
			);
			this.logDiag("healthCheck completed", {
				healthy: isHealthy,
				status: response.status,
				error: this.lastHealthError,
			});
			return isHealthy;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown connection error";
			this.lastHealthError = message;
			logger.warn(
				`Agent health check unavailable at ${this.useBroker ? this.brokerUrl : this.baseUrl}: ${message}`,
				"AgentService",
			);
			this.logDiag("healthCheck exception", { error: message });
			return false;
		}
	}
}

// Export singleton instance
export const agentService = new AgentService();
