// src/components/agent/agentTaskTemplates.ts
import type { AgentProfileId } from "./agentProfiles";

export interface TaskTemplate {
	label: string;
	prompt: string;
	/** Optional category for grouping */
	category?: "analysis" | "generation" | "review" | "automation";
	/** Optional icon hint */
	icon?: "zap" | "search" | "file" | "code" | "check" | "settings";
}

// ═══════════════════════════════════════════════════════════════════════════
// KORO - Task Orchestration & Automation
// ═══════════════════════════════════════════════════════════════════════════
const KORO_TEMPLATES: TaskTemplate[] = [
	// Analysis
	{
		label: "Analyze drawing list",
		prompt:
			"Analyze the drawing list and provide validation tools, scripts, and recommendations for improvement. Identify any missing drawings, naming inconsistencies, or revision gaps.",
		category: "analysis",
		icon: "search",
	},
	{
		label: "Research standards",
		prompt:
			"Research IEEE electrical standards, best practices, and compliance requirements relevant to this project. Summarize key requirements and flag any areas needing attention.",
		category: "analysis",
		icon: "search",
	},
	// Review
	{
		label: "Quality check",
		prompt:
			"Perform a comprehensive quality check: identify missing information, validate naming conventions, check revision consistency, and suggest corrections.",
		category: "review",
		icon: "check",
	},
	{
		label: "Project status report",
		prompt:
			"Generate a project status report including: completion percentage, outstanding items, upcoming deadlines, and risk areas that need attention.",
		category: "analysis",
		icon: "file",
	},
	// Automation
	{
		label: "Forecast timeline",
		prompt:
			"Based on similar projects and current progress, forecast the timeline and resource needs. Identify critical path items and potential bottlenecks.",
		category: "analysis",
		icon: "zap",
	},
	{
		label: "Coordinate deliverables",
		prompt:
			"Create a coordination matrix for all deliverables. Map dependencies between drawings, specs, and calculations. Highlight items blocking other work.",
		category: "automation",
		icon: "settings",
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// DEVSTRAL - Code Generation & Analysis
// ═══════════════════════════════════════════════════════════════════════════
const DEVSTRAL_TEMPLATES: TaskTemplate[] = [
	// Generation
	{
		label: "Generate Python script",
		prompt:
			"Generate a Python automation script for processing engineering documents. Include error handling, logging, and clear documentation.",
		category: "generation",
		icon: "code",
	},
	{
		label: "Create AutoCAD routine",
		prompt:
			"Create an AutoLISP or Python routine for AutoCAD that automates repetitive drafting tasks. Include user prompts and error handling.",
		category: "generation",
		icon: "code",
	},
	// Review
	{
		label: "Review code",
		prompt:
			"Review the current codebase for potential improvements, best practices, performance optimizations, and security considerations.",
		category: "review",
		icon: "check",
	},
	{
		label: "Debug issue",
		prompt:
			"Help debug and resolve the current technical issue. Analyze error messages, trace the root cause, and provide a tested solution.",
		category: "review",
		icon: "search",
	},
	// Automation
	{
		label: "Build data pipeline",
		prompt:
			"Design and implement a data pipeline for processing project data. Include validation, transformation, and output formatting.",
		category: "automation",
		icon: "settings",
	},
	{
		label: "Create API integration",
		prompt:
			"Create an API integration for connecting with external systems. Include authentication, error handling, and rate limiting.",
		category: "generation",
		icon: "code",
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// SENTINEL - Standards Compliance & Review
// ═══════════════════════════════════════════════════════════════════════════
const SENTINEL_TEMPLATES: TaskTemplate[] = [
	// Compliance
	{
		label: "NEC 2023 compliance",
		prompt:
			"Check the project against NEC 2023 requirements and flag any non-compliance. Provide specific code references and recommended corrections.",
		category: "review",
		icon: "check",
	},
	{
		label: "IEEE standards check",
		prompt:
			"Verify compliance with relevant IEEE standards (IEEE 80, 141, 242, 399, etc.). Document findings and required corrections.",
		category: "review",
		icon: "check",
	},
	{
		label: "NFPA 70E review",
		prompt:
			"Review project for NFPA 70E compliance including arc flash requirements, PPE specifications, and safety labeling requirements.",
		category: "review",
		icon: "check",
	},
	// Analysis
	{
		label: "Drawing QC review",
		prompt:
			"Perform a detailed QC review of drawings for: standards compliance, consistency, completeness, and drafting quality issues.",
		category: "review",
		icon: "search",
	},
	{
		label: "Spec compliance audit",
		prompt:
			"Audit specifications against project requirements and industry standards. Flag discrepancies and missing requirements.",
		category: "review",
		icon: "check",
	},
	{
		label: "Interdisciplinary check",
		prompt:
			"Perform an interdisciplinary coordination check. Verify electrical requirements align with civil, structural, and mechanical systems.",
		category: "analysis",
		icon: "search",
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// FORGE - Document & Drawing Generation
// ═══════════════════════════════════════════════════════════════════════════
const FORGE_TEMPLATES: TaskTemplate[] = [
	// Generation
	{
		label: "Generate transmittal",
		prompt:
			"Generate a formal transmittal document for the selected drawings and files. Include revision information, distribution list, and response requirements.",
		category: "generation",
		icon: "file",
	},
	{
		label: "Create design report",
		prompt:
			"Create a comprehensive design report including: design criteria, calculations summary, equipment selections, and compliance statements.",
		category: "generation",
		icon: "file",
	},
	{
		label: "Build drawing list",
		prompt:
			"Build a structured Excel drawing list template with: validation rules, revision tracking, status columns, and automated formatting.",
		category: "generation",
		icon: "file",
	},
	// Export
	{
		label: "Export IFC package",
		prompt:
			"Compile and export the Issued for Construction (IFC) documentation package including all drawings, specs, and supporting documents.",
		category: "automation",
		icon: "zap",
	},
	{
		label: "Generate cable schedule",
		prompt:
			"Generate a cable schedule from the project data including: cable tags, sizes, routing, termination points, and length calculations.",
		category: "generation",
		icon: "file",
	},
	{
		label: "Create equipment list",
		prompt:
			"Create a comprehensive equipment list with: tag numbers, descriptions, specifications, vendors, and procurement status tracking.",
		category: "generation",
		icon: "file",
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// DRAFTSMITH - CAD & Electrical Drafting Specialist
// ═══════════════════════════════════════════════════════════════════════════
const DRAFTSMITH_TEMPLATES: TaskTemplate[] = [
	{
		label: "CAD route strategy",
		prompt:
			"Propose a CAD-ready conduit route strategy for this run set. Include preferred pathing constraints, obstacle handling, and draw-order guidance.",
		category: "analysis",
		icon: "search",
	},
	{
		label: "Terminal label plan",
		prompt:
			"Generate a terminal-strip label sync plan with naming rules, collision handling, and expected update sequence for AutoCAD writeback.",
		category: "generation",
		icon: "file",
	},
	{
		label: "Ground grid review",
		prompt:
			"Review this grounding layout against IEEE 80 assumptions and flag spacing, fault-path, or continuity risks before drafting changes.",
		category: "review",
		icon: "check",
	},
	{
		label: "AutoCAD automation script",
		prompt:
			"Generate a robust AutoCAD automation script outline for this drafting workflow, including validation checkpoints and rollback-safe error handling.",
		category: "automation",
		icon: "code",
	},
];

const GRIDSAGE_TEMPLATES: TaskTemplate[] = [
	{
		label: "Feeder sizing review",
		prompt:
			"Review feeder sizing assumptions for this scope and flag ampacity, voltage-drop, and derating risks with concrete correction steps.",
		category: "review",
		icon: "check",
	},
	{
		label: "Protection coordination outline",
		prompt:
			"Outline protection coordination checkpoints for this system, including relay/breaker hierarchy assumptions and validation sequence.",
		category: "analysis",
		icon: "search",
	},
	{
		label: "Load study assumptions",
		prompt:
			"Draft load-study assumptions and diversity factors for this project and identify where field validation is required before release.",
		category: "analysis",
		icon: "file",
	},
	{
		label: "Electrical implementation plan",
		prompt:
			"Generate an implementation-ready electrical design action plan with dependencies, test gates, and rollback-safe milestones.",
		category: "automation",
		icon: "settings",
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE MAP
// ═══════════════════════════════════════════════════════════════════════════
const TEMPLATE_MAP: Record<AgentProfileId, TaskTemplate[]> = {
	koro: KORO_TEMPLATES,
	devstral: DEVSTRAL_TEMPLATES,
	sentinel: SENTINEL_TEMPLATES,
	forge: FORGE_TEMPLATES,
	draftsmith: DRAFTSMITH_TEMPLATES,
	gridsage: GRIDSAGE_TEMPLATES,
};

/**
 * Get task templates for a specific agent profile
 */
export function getAgentTaskTemplates(
	profileId: AgentProfileId,
): TaskTemplate[] {
	return TEMPLATE_MAP[profileId] ?? KORO_TEMPLATES;
}

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(
	profileId: AgentProfileId,
	category: TaskTemplate["category"],
): TaskTemplate[] {
	const templates = getAgentTaskTemplates(profileId);
	return templates.filter((t) => t.category === category);
}

/**
 * Get a random subset of templates (for quick suggestions)
 */
export function getRandomTemplates(
	profileId: AgentProfileId,
	count = 4,
): TaskTemplate[] {
	const templates = getAgentTaskTemplates(profileId);
	const shuffled = [...templates].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, count);
}
