export type PeProfile = {
	name: string;
	title: string;
	email: string;
	phone: string;
};

export const PE_PROFILES: PeProfile[] = [
	{
		name: "Don Washington, PE",
		title: "VP of Electrical Engineering",
		email: "don.washington@root3power.com",
		phone: "(832) 865-0461",
	},
	{
		name: "Andrew Simmons, PE",
		title: "Managing Partner",
		email: "andrew.simmons@root3power.com",
		phone: "(713) 294-2003",
	},
];

export const FIRM_NUMBERS = [
	"TX - Firm #20290",
	"LA - Firm #6673",
	"OK - Firm #8360",
];

export const DEFAULT_PE = "Andrew Simmons, PE";
export const DEFAULT_FIRM = "TX - Firm #20290";
