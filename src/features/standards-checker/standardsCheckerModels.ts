export type StandardsCheckerMode = "standards" | "standards-drawing";
export type StandardsCategory = "NEC" | "IEEE" | "IEC";

export interface Standard {
	id: string;
	name: string;
	code: string;
	category: StandardsCategory;
	description: string;
}

export interface CheckResult {
	standardId: string;
	status: "pass" | "fail" | "warning";
	message: string;
	detail?: string;
	meta?: Record<string, unknown>;
}

export interface ProjectStandardsProfile {
	id: string;
	projectId: string;
	userId: string;
	cadFamilyId: string | null;
	standardsCategory: StandardsCategory;
	selectedStandardIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ProjectStandardsProfileInput {
	cadFamilyId?: string | null;
	standardsCategory: StandardsCategory;
	selectedStandardIds: string[];
}

export interface ProjectStandardsLatestReview {
	id: string;
	projectId: string;
	userId: string;
	requestId: string;
	recordedAt: string;
	cadFamilyId: string | null;
	standardsCategory: StandardsCategory;
	selectedStandardIds: string[];
	results: CheckResult[];
	warnings: string[];
	summary: StandardsNativeReviewSummary;
	meta: Record<string, unknown>;
	overallStatus: "pass" | "fail" | "warning";
}

export interface StandardsNativeReviewSummary {
	drawingCount?: number;
	inspectedDrawingCount?: number;
	dwsFileCount?: number;
	suspiciousLayerCount?: number;
	openFailureCount?: number;
	activeDocumentName?: string | null;
	providerPath?: string | null;
}

export const categories: StandardsCategory[] = ["NEC", "IEEE", "IEC"];

export const sampleStandards: Standard[] = [
	{
		id: "nec-210",
		name: "NEC 210 - Branch Circuits",
		code: "NEC 210",
		category: "NEC",
		description:
			"Branch circuit ratings, outlet provisions, and GFCI requirements.",
	},
	{
		id: "nec-220",
		name: "NEC 220 - Branch-Circuit, Feeder, and Service Load Calculations",
		code: "NEC 220",
		category: "NEC",
		description:
			"Load calculation methods for branch circuits, feeders, and services.",
	},
	{
		id: "nec-250",
		name: "NEC 250 - Grounding and Bonding",
		code: "NEC 250",
		category: "NEC",
		description:
			"Grounding electrode systems, bonding, and equipment grounding conductors.",
	},
	{
		id: "ieee-80",
		name: "IEEE 80 - Guide for Safety in AC Substation Grounding",
		code: "IEEE 80",
		category: "IEEE",
		description:
			"Step and touch voltage limits, ground grid design parameters.",
	},
	{
		id: "ieee-141",
		name: "IEEE 141 - Recommended Practice for Electric Power Distribution",
		code: "IEEE 141",
		category: "IEEE",
		description:
			"Industrial plant power distribution design and analysis (Red Book).",
	},
	{
		id: "ieee-1584",
		name: "IEEE 1584 - Guide for Arc-Flash Hazard Calculations",
		code: "IEEE 1584",
		category: "IEEE",
		description:
			"Arc-flash incident energy calculations and PPE category selection.",
	},
	{
		id: "iec-60909",
		name: "IEC 60909 - Short-Circuit Currents in Three-Phase AC Systems",
		code: "IEC 60909",
		category: "IEC",
		description:
			"Calculation of short-circuit currents using symmetrical components.",
	},
	{
		id: "iec-61439",
		name: "IEC 61439 - Low-Voltage Switchgear Assemblies",
		code: "IEC 61439",
		category: "IEC",
		description:
			"Design verification and routine verification of LV switchgear assemblies.",
	},
	{
		id: "iec-60364",
		name: "IEC 60364 - Low-Voltage Electrical Installations",
		code: "IEC 60364",
		category: "IEC",
		description:
			"Fundamental principles, protection for safety, and selection of equipment.",
	},
];
