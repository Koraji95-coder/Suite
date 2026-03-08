import type { MarkExpression } from "./agentMarkPatterns";

export type AgentMarkState =
	| "idle"
	| "thinking"
	| "speaking"
	| "running"
	| "waiting"
	| "success"
	| "warning"
	| "error"
	| "focus";

export interface AgentMarkStateInput {
	error?: boolean;
	waiting?: boolean;
	running?: boolean;
	speaking?: boolean;
	thinking?: boolean;
	warning?: boolean;
	success?: boolean;
	focus?: boolean;
}

export function resolveAgentMarkState(input: AgentMarkStateInput): AgentMarkState {
	if (input.error) return "error";
	if (input.waiting) return "waiting";
	if (input.running) return "running";
	if (input.speaking) return "speaking";
	if (input.thinking) return "thinking";
	if (input.warning) return "warning";
	if (input.success) return "success";
	if (input.focus) return "focus";
	return "idle";
}

export function mapLegacyMarkState(input: {
	expression?: MarkExpression;
	pulse?: boolean;
	breathe?: boolean;
}): AgentMarkState {
	const expression = input.expression ?? "neutral";
	const pulse = Boolean(input.pulse);
	const breathe = Boolean(input.breathe);
	return resolveAgentMarkState({
		speaking: pulse,
		thinking: expression === "active",
		focus: expression === "focus" || breathe,
	});
}
