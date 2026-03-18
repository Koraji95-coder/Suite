import { DEFAULT_AGENT_PROFILE } from "@/components/agent/agentProfiles";
import { buildPromptForProfile } from "../agentPromptPacks";
import {
	cancelActiveDirectChatRequest,
	makeAgentRequest,
	type AgentRequestTransportContext,
} from "./requestTransport";
import type {
	AgentResponse,
	AgentSendOptions,
	AgentTask,
	PythonToolRequest,
} from "./types";

export function cancelAgentRequest(
	context: AgentRequestTransportContext,
): boolean {
	return cancelActiveDirectChatRequest(context);
}

export async function makeAgentTaskRequest(
	context: AgentRequestTransportContext,
	task: AgentTask,
	options?: AgentSendOptions,
): Promise<AgentResponse> {
	return makeAgentRequest(context, task, options);
}

export async function sendAgentMessage(
	context: AgentRequestTransportContext,
	message: string,
	options?: AgentSendOptions,
): Promise<AgentResponse> {
	const profileId = options?.profileId ?? DEFAULT_AGENT_PROFILE;
	const prompt = buildPromptForProfile(profileId, message, {
		mode: options?.promptMode ?? "manual",
		templateLabel: options?.templateLabel,
	});
	return makeAgentTaskRequest(
		context,
		{
			task: "chat",
			params: { message: prompt || message },
			profileId,
		},
		options,
	);
}

export async function executeAgentPythonScript(
	context: AgentRequestTransportContext,
	request: PythonToolRequest,
): Promise<AgentResponse> {
	return makeAgentTaskRequest(context, {
		task: "python_execute",
		params: request,
	});
}

export async function generateFloorPlan(
	context: AgentRequestTransportContext,
	specs: {
		width: number;
		height: number;
		rooms: number;
		output_path?: string;
	},
): Promise<AgentResponse> {
	return executeAgentPythonScript(context, {
		script: "suite_autocad_generator.py",
		args: {
			task: "floor_plan",
			params: specs,
		},
	});
}

export async function calculateElectricalGrid(
	context: AgentRequestTransportContext,
	specs: {
		conductor_size?: string;
		grid_spacing?: number;
		soil_resistivity?: number;
		fault_current?: number;
	},
): Promise<AgentResponse> {
	return executeAgentPythonScript(context, {
		script: "suite_autocad_generator.py",
		args: {
			task: "electrical_grid",
			params: specs,
		},
	});
}

export async function calculateVoltageDrop(
	context: AgentRequestTransportContext,
	specs: {
		length: number;
		current: number;
		voltage?: number;
		conductor?: "Copper" | "Aluminum";
	},
): Promise<AgentResponse> {
	return executeAgentPythonScript(context, {
		script: "suite_autocad_generator.py",
		args: {
			task: "voltage_drop",
			params: specs,
		},
	});
}

export async function analyzeProject(
	context: AgentRequestTransportContext,
	projectData: Record<string, unknown>,
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Analyze this electrical engineering project and provide recommendations: ${JSON.stringify(projectData)}`,
	);
}

export async function forecastTimeline(
	context: AgentRequestTransportContext,
	projectData: {
		type: string;
		complexity: "low" | "medium" | "high";
		team_size?: number;
	},
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Based on similar projects in memory, forecast the timeline for: ${JSON.stringify(projectData)}`,
	);
}

export async function generateTransmittal(
	context: AgentRequestTransportContext,
	data: {
		project_id: string;
		files: string[];
		recipient: string;
		notes?: string;
	},
): Promise<AgentResponse> {
	return makeAgentTaskRequest(context, {
		task: "generate_transmittal",
		params: data,
	});
}

export async function rememberProjectPattern(
	context: AgentRequestTransportContext,
	pattern: string,
): Promise<AgentResponse> {
	return makeAgentTaskRequest(context, {
		task: "memory_store",
		params: {
			content: pattern,
			tags: ["project_pattern", "suite"],
		},
	});
}

export async function recallSimilarProjects(
	context: AgentRequestTransportContext,
	query: string,
): Promise<AgentResponse> {
	return makeAgentTaskRequest(context, {
		task: "memory_recall",
		params: { query },
	});
}

export async function researchStandard(
	context: AgentRequestTransportContext,
	standard: string,
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Research and summarize key requirements from ${standard} standard for electrical engineering`,
	);
}

export async function researchTopic(
	context: AgentRequestTransportContext,
	topic: string,
	contextText?: string,
): Promise<AgentResponse> {
	const prompt = contextText
		? `Research and provide comprehensive information about "${topic}" in the context of ${contextText}. Include current standards, best practices, and any relevant regulations.`
		: `Research and provide comprehensive information about "${topic}". Include current standards, best practices, and relevant documentation.`;
	return sendAgentMessage(context, prompt);
}

export async function searchElectricalStandards(
	context: AgentRequestTransportContext,
	query: string,
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Search for electrical engineering standards, codes, and regulations related to: ${query}. Include NEC 2023, NFPA 70, IEEE standards where applicable.`,
	);
}

export async function analyzeRegulations(
	context: AgentRequestTransportContext,
	specifications: string,
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Analyze the following electrical specifications against current NEC 2023 and NFPA 70 regulations: ${specifications}. Identify any compliance issues and recommend corrections.`,
	);
}

export async function generateDocumentation(
	context: AgentRequestTransportContext,
	specs: {
		type: "design_report" | "calculation_sheet" | "test_report";
		data: Record<string, unknown>;
	},
): Promise<AgentResponse> {
	return sendAgentMessage(
		context,
		`Generate a ${specs.type} document based on: ${JSON.stringify(specs.data)}`,
	);
}
