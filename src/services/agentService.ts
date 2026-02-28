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

import { logger } from "../lib/logger";
import { secureTokenStorage } from "../lib/secureTokenStorage";
import { deleteSetting, loadSetting, saveSetting } from "../settings/userSettings";
import { isDevAdminEmail } from "../lib/devAccess";
import { logSecurityEvent } from "./securityEventService";
import { supabase } from "../supabase/client";
import { isSupabaseConfigured } from "../supabase/utils";

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

export type PythonToolRequest = Record<string, unknown> & {
	script: string;
	args: Record<string, unknown>;
	cwd?: string;
};

const AGENT_PAIRING_SETTING_KEY = "agent_pairing_state_v1";
const MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1000;

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
	private lastHealthError: string | null = null;
	private activeUserId: string | null = null;
	private activeUserEmail: string | null = null;
	private activeUserIsAdmin = false;

	constructor() {
		const transport = String(
			import.meta.env.VITE_AGENT_TRANSPORT || "",
		).trim()
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
			const paired = await this.refreshPairingStatus();
			if (paired) {
				await logSecurityEvent(
					"agent_restore_success",
					"Agent pairing restored via broker session.",
				);
				return { restored: true, reason: "restored" };
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
		if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > MAX_RESTORE_AGE_MS) {
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
					body: JSON.stringify({ pairing_code: pairingCode.trim() }),
				});

				if (!response.ok) {
					const body = await response.text().catch(() => "");
					logger.error(
						`Brokered pairing failed: ${response.status} ${body}`,
						"AgentService",
						new Error(response.statusText),
					);
					throw new Error(`Pairing failed: ${response.statusText}`);
				}

				this.brokerPaired = true;
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
					"X-Pairing-Code": pairingCode.trim(),
				},
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
		if (!this.useBroker) {
			return this.checkPairing();
		}

		const accessToken = await this.getSupabaseAccessToken();
		if (!accessToken) {
			this.brokerPaired = false;
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
				return false;
			}

			const data = await response.json();
			this.brokerPaired = Boolean(data?.paired);
			return this.brokerPaired;
		} catch (error) {
			logger.warn("Failed to refresh broker pairing status", "AgentService", {
				error,
			});
			this.brokerPaired = false;
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
	async sendMessage(message: string): Promise<AgentResponse> {
		return this.makeRequest({
			task: "chat",
			params: { message },
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
				const response = await fetch(`${this.brokerUrl}/webhook`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({
						message: JSON.stringify(task),
					}),
					signal: AbortSignal.timeout(timeout),
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

			const timeout =
				task.timeout ?? (Number(import.meta.env.VITE_AGENT_TIMEOUT) || 30_000);

			const response = await fetch(`${this.baseUrl}/webhook`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					message: JSON.stringify(task),
				}),
				signal: AbortSignal.timeout(timeout),
			});

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
			if (this.useBroker) {
				const accessToken = await this.getSupabaseAccessToken();
				if (!accessToken) {
					this.lastHealthError =
						"Supabase session required for brokered agent access.";
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
			return isHealthy;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown connection error";
			this.lastHealthError = message;
			logger.warn(
				`Agent health check unavailable at ${this.baseUrl}: ${message}`,
				"AgentService",
			);
			return false;
		}
	}
}

// Export singleton instance
export const agentService = new AgentService();
