import { localId } from "@/lib/localId";
export { buildWorkbook } from "../services/DrawingListManagerExcelAdapter";

export interface SwapRule {
	id: string;
	from: string;
	to: string;
}

export interface DrawingEntry {
	id: string;
	fileName: string;
	title: string;
	discipline: string;
	sheetType: string;
	sequence: number | null;
	revision: string;
	drawingNumber: string;
	source: "folder" | "generated";
}

export interface ValidatedDrawingEntry extends DrawingEntry {
	issues: string[];
}

export interface ProjectConfig {
	projectNumber: string;
	revisionDefault: string;
	enforceProjectCode: boolean;
	allowedDisciplines: string[];
	allowedSheetTypes: string[];
}

export const DEFAULT_DISCIPLINES = ["E", "C", "M", "A", "S", "P", "HVAC"];
export const DEFAULT_SHEET_TYPES = [
	"GEN",
	"DET",
	"SCH",
	"CAL",
	"DIA",
	"PLC",
	"ELV",
	"SEC",
	"DIM",
	"LOG",
];

export const createId = () => localId();

export const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildProjectCode = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "R3P-XXX";
	return trimmed.toUpperCase().startsWith("R3P-")
		? trimmed.toUpperCase()
		: `R3P-${trimmed.toUpperCase()}`;
};

export const formatNumber = (
	projectValue: string,
	discipline: string,
	sheetType: string,
	sequence: number,
	revision: string,
) => {
	const projectCode = buildProjectCode(projectValue);
	return `${projectCode}-${discipline}-${sheetType}-${String(sequence).padStart(3, "0")} ${revision}`;
};

export const parseFileName = (fileName: string, config: ProjectConfig) => {
	const base = fileName.replace(/\.[^/.]+$/, "");
	const expectedProject = buildProjectCode(config.projectNumber);
	const projectPattern =
		config.enforceProjectCode && config.projectNumber
			? escapeRegExp(expectedProject)
			: "R3P-[A-Z0-9]{3,6}";
	const numberRegex = new RegExp(
		`^(${projectPattern})-([A-Z0-9]{1,4})-([A-Z0-9]{3})-(\\d{3})(?:\\s*([A-Z0-9]+))?`,
		"i",
	);

	const match = base.match(numberRegex);
	if (!match) {
		return {
			drawingNumber: "Unparsed",
			discipline: "",
			sheetType: "",
			sequence: null,
			revision: config.revisionDefault,
			title: base.replace(/[_-]+/g, " ").trim(),
			issues: ["Naming convention mismatch"],
		};
	}

	const [, project, disciplineRaw, sheetTypeRaw, seqRaw, revRaw] = match;
	const discipline = disciplineRaw.toUpperCase();
	const sheetType = sheetTypeRaw.toUpperCase();
	const sequence = Number(seqRaw);
	const revision = (revRaw || config.revisionDefault).toUpperCase();
	const remainder = base.slice(match[0].length).replace(/^[-_ ]+/, "");
	const title = remainder
		? remainder.replace(/[_-]+/g, " ").trim()
		: `${sheetType} Sheet`;

	const issues: string[] = [];
	if (
		config.enforceProjectCode &&
		config.projectNumber &&
		project.toUpperCase() !== expectedProject
	) {
		issues.push("Project code mismatch");
	}
	if (!config.allowedDisciplines.includes(discipline)) {
		issues.push("Unknown discipline");
	}
	if (!config.allowedSheetTypes.includes(sheetType)) {
		issues.push("Unknown sheet type");
	}
	if (!revRaw) {
		issues.push("Missing revision");
	}

	return {
		drawingNumber: formatNumber(
			project.toUpperCase(),
			discipline,
			sheetType,
			sequence,
			revision,
		),
		discipline,
		sheetType,
		sequence,
		revision,
		title,
		issues,
	};
};
