import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { logSecurityEvent } from "../securityEventService";
import type { AgentResponse, AgentSendOptions, AgentTask } from "./types";
import type { AgentRequestTransportContext } from "./requestTransportContracts";
import { formatAgentGatewayFailureMessage } from "./requestTransportErrors";
import { makeDirectChatStreamRequest } from "./requestTransportDirectStream";

export function cancelActiveDirectChatRequest(
	context: Pick<
		AgentRequestTransportContext,
		| "getActiveDirectChatAbortController"
		| "setActiveDirectChatCancelledByUser"
	>,
): boolean {
	const activeAbortController = context.getActiveDirectChatAbortController();
	if (!activeAbortController) {
		return false;
	}
	context.setActiveDirectChatCancelledByUser(true);
	activeAbortController.abort();
	return true;
}

export async function makeDirectAgentRequest(
	context: AgentRequestTransportContext,
	args: {
		task: AgentTask;
		profileId: string;
		modelCandidates: string[];
		startTime: number;
		options?: AgentSendOptions;
	},
): Promise<AgentResponse> {
	const { task, profileId, modelCandidates, startTime, options } = args;
	const token = context.getToken();
	if (!token) {
		logger.error("Token validation failed", "AgentService");
		return {
			success: false,
			error: "Invalid token. Please pair again.",
		};
	}

	try {
		logger.debug(`Making agent request: ${task.task}`, "AgentService");

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		};

		const webhookSecret = import.meta.env.VITE_AGENT_WEBHOOK_SECRET;
		const requireWebhookSecret = context.shouldRequireWebhookSecret();

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
			return await makeDirectChatStreamRequest(context, {
				task,
				profileId,
				modelCandidates,
				headers,
				startTime,
				options,
			});
		}

		const timeout = context.resolveDirectConnectTimeoutMs(task.timeout);
		const model = modelCandidates[0] || "";
		const payload: Record<string, unknown> = {
			message: JSON.stringify(task),
			profile_id: profileId,
		};
		if (model) {
			payload.model = model;
		}

		const response = await fetchWithTimeout(`${context.baseUrl}/webhook`, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			timeoutMs: timeout,
			requestName: "Agent gateway webhook request",
		});

		if (!response.ok) {
			const rawDetails = await parseResponseErrorMessage(
				response,
				`Agent request failed (${response.status})`,
			);
			const failureMessage = formatAgentGatewayFailureMessage(
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

				await context.unpair();
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

		return {
			success: true,
			data: (await response.json()) as Record<string, unknown>,
			executionTime: Date.now() - startTime,
		};
	} catch (error) {
		logger.error("Agent request error", "AgentService", error);
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unknown error"),
			executionTime: Date.now() - startTime,
		};
	}
}
