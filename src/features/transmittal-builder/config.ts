export type PeProfile = {
	id: string;
	name: string;
	title: string;
	email: string;
	phone: string;
};

export const PE_PROFILES: PeProfile[] = [
	{
		id: "sample-engineer",
		name: "Sample Engineer, PE",
		title: "Engineering Lead",
		email: "engineer@example.com",
		phone: "(000) 000-0000",
	},
];

export const FIRM_NUMBERS = ["TX - Firm #00000"];

export const DEFAULT_PE = "sample-engineer";
export const DEFAULT_FIRM = "TX - Firm #00000";
