import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { logSecurityEvent } from "../securityEventService";
import type { AgentResponse, AgentTask } from "./types";
import type { AgentRequestTransportContext } from "./requestTransportContracts";
import { formatAgentGatewayFailureMessage } from "./requestTransportErrors";

export async function makeBrokerAgentRequest(
	context: AgentRequestTransportContext,
	args: {
		task: AgentTask;
		profileId: string;
		modelCandidates: string[];
		startTime: number;
	},
): Promise<AgentResponse> {
	const { task, profileId, modelCandidates, startTime } = args;
	const accessToken = await context.getSupabaseAccessToken();
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
		const response = await fetchWithTimeout(`${context.brokerUrl}/webhook`, {
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
			const rawDetails = await parseResponseErrorMessage(
				response,
				`Agent request failed (${response.status})`,
			);
			const failureMessage = formatAgentGatewayFailureMessage(
				response.status,
				rawDetails,
			);
			if (response.status === 401 || response.status === 403) {
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
