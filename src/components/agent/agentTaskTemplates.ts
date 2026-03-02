import type { AgentProfileId } from "./agentProfiles";

export interface TaskTemplate {
	label: string;
	prompt: string;
}

const KORO_TEMPLATES: TaskTemplate[] = [
	{ label: "Analyze drawing list", prompt: "Analyze the drawing list and provide validation tools, scripts, and recommendations for improvement." },
	{ label: "Research standards", prompt: "Research IEEE electrical standards, best practices, and compliance requirements." },
	{ label: "Quality check", prompt: "Perform a quality check: identify missing information, validate naming conventions, and suggest corrections." },
	{ label: "Forecast timeline", prompt: "Based on similar projects, forecast the timeline and resource needs for this project." },
];

const DEVSTRAL_TEMPLATES: TaskTemplate[] = [
	{ label: "Generate script", prompt: "Generate a Python automation script for processing engineering documents." },
	{ label: "Review code", prompt: "Review the current codebase for potential improvements and best practices." },
	{ label: "Create API endpoint", prompt: "Design and create an API endpoint for the specified functionality." },
	{ label: "Debug issue", prompt: "Help debug and resolve the current technical issue." },
];

const SENTINEL_TEMPLATES: TaskTemplate[] = [
	{ label: "NEC compliance", prompt: "Check the project against NEC 2023 requirements and flag any non-compliance." },
	{ label: "Review drawings", prompt: "Review drawings for standards compliance and consistency issues." },
	{ label: "Audit project", prompt: "Perform a comprehensive audit of project documentation and deliverables." },
	{ label: "Check regulations", prompt: "Verify compliance with current NFPA 70 and IEEE regulations." },
];

const FORGE_TEMPLATES: TaskTemplate[] = [
	{ label: "Generate transmittal", prompt: "Generate a transmittal document for the selected drawings and files." },
	{ label: "Create report", prompt: "Create a design report based on the current project data." },
	{ label: "Build template", prompt: "Build an Excel template for the drawing list with validation rules." },
	{ label: "Export package", prompt: "Compile and export the project documentation package." },
];

const TEMPLATE_MAP: Record<AgentProfileId, TaskTemplate[]> = {
	koro: KORO_TEMPLATES,
	devstral: DEVSTRAL_TEMPLATES,
	sentinel: SENTINEL_TEMPLATES,
	forge: FORGE_TEMPLATES,
};

export function getAgentTaskTemplates(profileId: AgentProfileId): TaskTemplate[] {
	return TEMPLATE_MAP[profileId] ?? KORO_TEMPLATES;
}
