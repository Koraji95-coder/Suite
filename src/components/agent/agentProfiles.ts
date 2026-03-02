export type AgentProfileId = "koro" | "devstral" | "sentinel" | "forge";

export interface AgentProfile {
	id: AgentProfileId;
	name: string;
	shortName: string;
	tagline: string;
	modelId: string;
	memoryNamespace: string;
}

export const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
	koro: {
		id: "koro",
		name: "Koro",
		shortName: "KR",
		tagline: "Task orchestration and automation",
		modelId: "zeroclaw-koro",
		memoryNamespace: "koro",
	},
	devstral: {
		id: "devstral",
		name: "Devstral",
		shortName: "DV",
		tagline: "Code generation and analysis",
		modelId: "mistral-devstral",
		memoryNamespace: "devstral",
	},
	sentinel: {
		id: "sentinel",
		name: "Sentinel",
		shortName: "SN",
		tagline: "Standards compliance and review",
		modelId: "sentinel-review",
		memoryNamespace: "sentinel",
	},
	forge: {
		id: "forge",
		name: "Forge",
		shortName: "FG",
		tagline: "Document and drawing generation",
		modelId: "forge-gen",
		memoryNamespace: "forge",
	},
};

export const AGENT_PROFILE_IDS = Object.keys(AGENT_PROFILES) as AgentProfileId[];

export const DEFAULT_AGENT_PROFILE: AgentProfileId = "koro";
