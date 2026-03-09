export type AgentProfileId =
	| "koro"
	| "devstral"
	| "sentinel"
	| "forge"
	| "draftsmith"
	| "gridsage";

export interface AgentProfile {
	id: AgentProfileId;
	name: string;
	shortName: string;
	tagline: string;
	focus: string;
	modelId: string;
	modelPrimary: string;
	modelFallbacks: string[];
	memoryNamespace: string;
}

const ENV = import.meta.env as Record<string, string | undefined>;

function envString(key: string): string {
	const value = ENV[key];
	return typeof value === "string" ? value.trim() : "";
}

function resolvePrimary(profileKey: string, fallback: string): string {
	return envString(`VITE_AGENT_MODEL_${profileKey}_PRIMARY`) || fallback;
}

export const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
	koro: {
		id: "koro",
		name: "Koro",
		shortName: "KR",
		tagline: "Workflow orchestration and execution",
		focus: "Planning, orchestration, and multi-step coordination.",
		modelId: "suite-koro",
		modelPrimary: resolvePrimary("KORO", "qwen3:14b"),
		modelFallbacks: [],
		memoryNamespace: "koro",
	},
	devstral: {
		id: "devstral",
		name: "Devstral",
		shortName: "DV",
		tagline: "Code and automation specialist",
		focus: "Refactors, diagnostics, scripts, and technical implementation.",
		modelId: "suite-devstral",
		modelPrimary: resolvePrimary("DEVSTRAL", "devstral-small-2:latest"),
		modelFallbacks: [],
		memoryNamespace: "devstral",
	},
	sentinel: {
		id: "sentinel",
		name: "Sentinel",
		shortName: "SN",
		tagline: "QA and standards verification",
		focus: "Checks, risk reviews, and standards-compliance validation.",
		modelId: "suite-sentinel",
		modelPrimary: resolvePrimary("SENTINEL", "gemma3:12b"),
		modelFallbacks: [],
		memoryNamespace: "sentinel",
	},
	forge: {
		id: "forge",
		name: "Forge",
		shortName: "FG",
		tagline: "Content, docs, and output generation",
		focus: "Structured output generation for docs, summaries, and artifacts.",
		modelId: "suite-forge",
		modelPrimary: resolvePrimary("FORGE", "qwen2.5-coder:14b"),
		modelFallbacks: [],
		memoryNamespace: "forge",
	},
	draftsmith: {
		id: "draftsmith",
		name: "Draftsmith",
		shortName: "DS",
		tagline: "CAD intent and electrical drafting",
		focus:
			"CAD-aware drafting intent, electrical reasoning, and route guidance.",
		modelId: "suite-draftsmith",
		modelPrimary: resolvePrimary("DRAFTSMITH", "joshuaokolo/C3Dv0:latest"),
		modelFallbacks: [],
		memoryNamespace: "draftsmith",
	},
	gridsage: {
		id: "gridsage",
		name: "GridSage",
		shortName: "GS",
		tagline: "Electrical systems specialist",
		focus:
			"Power-system reasoning, electrical design constraints, and implementation guidance.",
		modelId: "suite-gridsage",
		modelPrimary: resolvePrimary(
			"GRIDSAGE",
			"ALIENTELLIGENCE/electricalengineerv2:latest",
		),
		modelFallbacks: [],
		memoryNamespace: "gridsage",
	},
};

export const AGENT_PROFILE_IDS = Object.keys(
	AGENT_PROFILES,
) as AgentProfileId[];

export function getAgentModelCandidates(profileId: AgentProfileId): string[] {
	const profile = AGENT_PROFILES[profileId];
	if (!profile) return [];
	return profile.modelPrimary ? [profile.modelPrimary] : [];
}

export const DEFAULT_AGENT_PROFILE: AgentProfileId = "koro";
