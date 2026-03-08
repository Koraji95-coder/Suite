import type { AgentProfileId } from "./agentProfiles";

export type AgentChannelScope = "team" | AgentProfileId;

export function isAgentProfileScope(
	scope: AgentChannelScope,
): scope is AgentProfileId {
	return scope !== "team";
}
