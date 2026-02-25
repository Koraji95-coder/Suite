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
 * See: /workspaces/Suite/src/types/agent.ts for TypeScript interfaces
 */

import { logger } from "../lib/logger";
import { secureTokenStorage } from "../lib/secureTokenStorage";
import type { AgentResponse } from "../types/agent";

// Re-export types for convenience
export type { AgentResponse };

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

class AgentService {
	private baseUrl: string;
	private gatewayUrl: string;

	constructor() {
		// VITE_AGENT_URL → legacy alias, kept for backward compat
		// VITE_AGENT_GATEWAY_URL → canonical ZeroClaw gateway endpoint
		this.gatewayUrl =
			import.meta.env.VITE_AGENT_GATEWAY_URL ||
			import.meta.env.VITE_AGENT_URL ||
			"http://127.0.0.1:3000";
		// Strip trailing slash for consistency
		this.baseUrl = this.gatewayUrl.replace(/\/+$/, "");
	}

	/**
	 * Pair with the agent using the 6-digit code
	 * This must be done once when the agent starts
	 */
	async pair(pairingCode: string): Promise<boolean> {
		try {
			logger.info("Attempting to pair with agent", "AgentService");

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

			logger.info("Successfully paired with agent", "AgentService");
			return true;
		} catch (error) {
			logger.error("Agent pairing error", "AgentService", error);
			return false;
		}
	}

	/**
	 * Check if we're already paired (token exists and is valid)
	 */
	checkPairing(): boolean {
		return secureTokenStorage.hasToken();
	}

	/**
	 * Unpair from the agent (clear token)
	 */
	unpair(): void {
		secureTokenStorage.clearToken();
		logger.info("Unpaired from agent", "AgentService");
	}

	/**
	 * Get token (for internal use only - never expose to UI)
	 */
	private getToken(): string | null {
		return secureTokenStorage.getToken();
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
		if (!this.checkPairing()) {
			logger.warn("Attempted request without pairing", "AgentService");
			return {
				success: false,
				error: "Not paired with agent. Please pair first.",
			};
		}

		const token = this.getToken();
		if (!token) {
			logger.error("Token validation failed", "AgentService");
			return {
				success: false,
				error: "Invalid token. Please pair again.",
			};
		}

		const startTime = Date.now();

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
			const response = await fetch(`${this.baseUrl}/health`, {
				method: "GET",
			});
			const isHealthy = response.ok;
			logger.debug(
				`Agent health check: ${isHealthy ? "healthy" : "unhealthy"}`,
				"AgentService",
			);
			return isHealthy;
		} catch (error) {
			logger.error("Agent health check failed", "AgentService", error);
			return false;
		}
	}
}

// Export singleton instance
export const agentService = new AgentService();
