import {
	DEFAULT_AGENT_PROFILE,
	getAgentModelCandidates,
	type AgentProfileId,
} from "@/components/agent/agentProfiles";
import type { AgentTask } from "./types";

export interface AgentRequestTransportContext {
	useBroker: boolean;
	baseUrl: string;
	brokerUrl: string;
	getSupabaseAccessToken: () => Promise<string | null>;
	refreshPairingStatus: () => Promise<boolean>;
	checkPairing: () => boolean;
	getToken: () => string | null;
	unpair: () => Promise<void>;
	shouldRequireWebhookSecret: () => boolean;
	resolveDirectConnectTimeoutMs: (taskTimeout?: number) => number;
	resolveDirectStreamMaxMs: () => number;
	getActiveDirectChatAbortController: () => AbortController | null;
	setActiveDirectChatAbortController: (
		controller: AbortController | null,
	) => void;
	getActiveDirectChatCancelledByUser: () => boolean;
	setActiveDirectChatCancelledByUser: (cancelled: boolean) => void;
	isTaskAllowedForCurrentUser: (taskName: string) => boolean;
}

export interface AgentRequestProfileContext {
	profileId: AgentProfileId;
	modelCandidates: string[];
}

export function getRequestProfileContext(
	task: AgentTask,
): AgentRequestProfileContext {
	const profileId = task.profileId || DEFAULT_AGENT_PROFILE;
	return {
		profileId,
		modelCandidates: getAgentModelCandidates(profileId),
	};
}
