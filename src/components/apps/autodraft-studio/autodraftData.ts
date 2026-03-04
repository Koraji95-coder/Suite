export type AutoDraftRule = {
	id: string;
	category:
		| "DELETE"
		| "ADD"
		| "NOTE"
		| "SWAP"
		| "TITLE_BLOCK"
		| "BLOCK_REF"
		| "REVISION_CLOUD"
		| "DIMENSION";
	trigger: Record<string, string | number | boolean>;
	action: string;
	icon: string;
	examples: string[];
	confidence: number;
};

export type PipelineStep = {
	step: number;
	name: string;
	description: string;
	detail: string;
	tech: string;
};

export type TrainingPhase = {
	phase: string;
	effort: string;
	items: string[];
};

export const RULE_LIBRARY: AutoDraftRule[] = [
	{
		id: "r1",
		category: "DELETE",
		trigger: { type: "cloud", color: "red", text_contains: "DELETE" },
		action: "Remove all geometry inside the cloud boundary",
		icon: "🔴",
		examples: ["Red cloud around area", "Red X through element"],
		confidence: 0.92,
	},
	{
		id: "r2",
		category: "ADD",
		trigger: { type: "cloud", color: "green", text_contains: "" },
		action: "Add geometry drawn inside green cloud to model",
		icon: "🟢",
		examples: ["Green cloud with new linework", "Green arrow to insertion"],
		confidence: 0.88,
	},
	{
		id: "r3",
		category: "NOTE",
		trigger: { type: "text", color: "blue", text_contains: "" },
		action: "Log as note — do not modify geometry",
		icon: "🔵",
		examples: ["Blue text annotation", "Blue callout box"],
		confidence: 0.95,
	},
	{
		id: "r4",
		category: "SWAP",
		trigger: { type: "arrow", color: "blue", count: 2 },
		action: "Swap the two elements connected by arrows",
		icon: "🔀",
		examples: ["Two blue arrows between components"],
		confidence: 0.75,
	},
	{
		id: "r5",
		category: "TITLE_BLOCK",
		trigger: { type: "rectangle", position: "bottom-right", aspect: "wide" },
		action: "Identify title block — extract metadata, skip geometry",
		icon: "📋",
		examples: ["Standard ANSI title block", "Company header and rev table"],
		confidence: 0.97,
	},
	{
		id: "r6",
		category: "BLOCK_REF",
		trigger: { type: "symbol", repeated: true, size: "small" },
		action: "Identify block reference — map to block library",
		icon: "🔲",
		examples: ["Repeated relay symbols", "Standard electrical components"],
		confidence: 0.82,
	},
	{
		id: "r7",
		category: "REVISION_CLOUD",
		trigger: { type: "cloud", color: "any", has_delta: true },
		action: "Mark revision area — compare against prior sheet",
		icon: "△",
		examples: ["Cloud with triangle revision marker"],
		confidence: 0.9,
	},
	{
		id: "r8",
		category: "DIMENSION",
		trigger: { type: "line", has_arrows: true, has_text: true },
		action: "Extract dimension value for scale verification",
		icon: "📏",
		examples: ["Dimension line with measurement text"],
		confidence: 0.85,
	},
];

export const PIPELINE_STEPS: PipelineStep[] = [
	{
		step: 1,
		name: "Extract Layers",
		description: "Split vector geometry and annotation markups.",
		detail:
			"Parse PDF content streams and /Annots separately so base geometry and markup intent are independently addressable.",
		tech: "PDF parser + annotation dictionary extraction",
	},
	{
		step: 2,
		name: "Classify Marks",
		description: "Map each markup to an action category.",
		detail:
			"Apply deterministic rules first, then use ML classification as fallback when no rule confidently matches.",
		tech: "Rule engine + vision/LLM fallback",
	},
	{
		step: 3,
		name: "Resolve Context",
		description: "Determine what each markup refers to.",
		detail:
			"Use spatial overlap/containment and pointer direction logic to bind markups to specific geometry entities.",
		tech: "Spatial queries + geometric relations",
	},
	{
		step: 4,
		name: "Generate Actions",
		description: "Compile executable CAD operations.",
		detail:
			"Convert intent into atomic actions (delete/add/swap/note) with dependencies and conflict checks.",
		tech: "Action queue + conflict resolution",
	},
	{
		step: 5,
		name: "Review & Execute",
		description: "Approve changes before writing to CAD.",
		detail:
			"Preview diff and confirm destructive operations, then submit approved plan to backend execution.",
		tech: "Diff review + batch execution",
	},
];

export const TRAINING_PHASES: TrainingPhase[] = [
	{
		phase: "Phase 1 — Rule Library",
		effort: "1-2 weeks",
		items: [
			"Codify your current markup conventions first.",
			"Map color + shape + text signals to core actions.",
			"Target top 10-20 rules that cover most markups.",
		],
	},
	{
		phase: "Phase 2 — Template Matching",
		effort: "2-4 weeks",
		items: [
			"Capture frequent markup patterns as visual templates.",
			"Use similarity matching for standardized symbols.",
			"Keep low-data, deterministic behavior where possible.",
		],
	},
	{
		phase: "Phase 3 — Vision Classification",
		effort: "2-3 weeks",
		items: [
			"Classify ambiguous regions with a vision model.",
			"Constrain output to known action categories.",
			"Route low-confidence predictions to manual review.",
		],
	},
	{
		phase: "Phase 4 — Fine-Tuned Model",
		effort: "Ongoing",
		items: [
			"Capture user corrections and replay as labeled data.",
			"Train a lightweight classifier on project-specific styles.",
			"Continuously improve without breaking rule determinism.",
		],
	},
];

export const MIGRATION_BREAKDOWN = [
	{
		title: "Frontend TypeScript",
		description:
			"Review UI, rule management, preview/diff, and workflow orchestration.",
	},
	{
		title: "Backend Orchestration",
		description:
			"Auth, validation, job planning, and API contract with external execution engine.",
	},
	{
		title: ".NET Execution API",
		description:
			"CAD-native operations replacing direct COM coupling for robust automation.",
	},
];
