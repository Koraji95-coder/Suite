export type CustomerKnowledgeSection = {
	title: string;
	description: string;
	items: string[];
};

export const CUSTOMER_KNOWLEDGE_SECTIONS: CustomerKnowledgeSection[] = [
	{
		title: "Standards and Compliance",
		description: "Core engineering and safety references used in workflows.",
		items: [
			"NEC grounding and bonding references",
			"IEEE substation grounding guidance",
			"Quality and review checklist templates",
		],
	},
	{
		title: "Delivery and Issue Sets",
		description:
			"Reference patterns for issue packages, review readiness, and transmittal checklists.",
		items: [
			"Drawing issue package checklists",
			"Title block and revision review reminders",
			"Transmittal assembly and handoff notes",
		],
	},
	{
		title: "Math & Reference highlights",
		description:
			"Existing calculators, plots, and formula banks that stay synced with the engineering workstream.",
		items: [
			"Vector Calculator",
			"Three-Phase Calculator",
			"Engineering Calculator Panel",
			"Formula Bank and Math Reference",
			"Plot Generator & Circuit Builder",
		],
	},
];
