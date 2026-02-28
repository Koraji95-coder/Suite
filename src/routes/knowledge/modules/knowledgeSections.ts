export type KnowledgeSection = {
	title: string;
	description: string;
	items: string[];
};

export const KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
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
		title: "Security and Environment",
		description: "Operational guidance for secrets and deployment readiness.",
		items: [
			"Environment variable and secret handling",
			"Supabase RLS hardening and verification",
			"Public rollout readiness checklist",
		],
	},
	{
		title: "Backend Runtime Notes",
		description: "Coordinates backend integration and platform constraints.",
		items: [
			"AutoCAD COM backend runs on Windows host",
			"Frontend uses VITE_COORDINATES_BACKEND_URL",
			"API requests authenticated with X-API-Key",
		],
	},
	{
		title: "Math Tools (Coming Soon)",
		description: "Planned calculation modules are documented here ahead of release.",
		items: [
			"Vector Calculator",
			"Three-Phase Calculator",
			"General Engineering Calculator Panel",
			"Electrical Plot Generator",
		],
	},
];
