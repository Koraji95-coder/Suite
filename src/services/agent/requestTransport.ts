import { logger } from "@/lib/logger";
import { logSecurityEvent } from "../securityEventService";
import {
	getRequestProfileContext,
	type AgentRequestTransportContext,
} from "./requestTransportContracts";
import { makeBrokerAgentRequest } from "./requestTransportBroker";
import { cancelActiveDirectChatRequest, makeDirectAgentRequest } from "./requestTransportDirect";
import {
	parseDirectStreamPayloadEvent,
	type ParsedDirectStreamPayloadEvent,
} from "./requestTransportDirectStream";
import { formatAgentGatewayFailureMessage } from "./requestTransportErrors";
import type { AgentResponse, AgentSendOptions, AgentTask } from "./types";

export type { AgentRequestTransportContext };
export { formatAgentGatewayFailureMessage };
export {
	parseDirectStreamPayloadEvent,
	type ParsedDirectStreamPayloadEvent,
};
export { cancelActiveDirectChatRequest };

export async function makeAgentRequest(
	context: AgentRequestTransportContext,
	task: AgentTask,
	options?: AgentSendOptions,
): Promise<AgentResponse> {
	if (!context.isTaskAllowedForCurrentUser(task.task)) {
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
	const { profileId, modelCandidates } = getRequestProfileContext(task);

	if (!context.checkPairing()) {
		if (context.useBroker) {
			const refreshed = await context.refreshPairingStatus();
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

	if (context.useBroker) {
		return makeBrokerAgentRequest(context, {
			task,
			profileId,
			modelCandidates,
			startTime,
		});
	}

	return makeDirectAgentRequest(context, {
		task,
		profileId,
		modelCandidates,
		startTime,
		options,
	});
}
