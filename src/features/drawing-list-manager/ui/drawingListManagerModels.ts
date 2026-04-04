import ExcelJS from "exceljs";
import { localId } from "@/lib/localId";

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

export const buildWorkbook = async (drawings: DrawingEntry[]) => {
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet("Drawing Index");

	const header = [
		"Drawing Number",
		"Title",
		"File",
		"Discipline",
		"Sheet Type",
		"Revision",
		"Source",
	];
	const headerRow = worksheet.addRow(header);
	headerRow.font = { bold: true, size: 11 };
	headerRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FFE0E0E0" },
	};
	headerRow.alignment = { vertical: "middle", horizontal: "center" };

	drawings.forEach((drawing) => {
		const sanitizedTitle = drawing.title.trim().match(/^[=+\-@]/)
			? `'${drawing.title}`
			: drawing.title;

		worksheet.addRow([
			drawing.drawingNumber,
			sanitizedTitle,
			drawing.fileName,
			drawing.discipline,
			drawing.sheetType,
			drawing.revision,
			drawing.source,
		]);
	});

	worksheet.columns.forEach((column, index) => {
		let maxLength = header[index].length;
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber > 1) {
				const cell = row.getCell(index + 1);
				const length = cell.value ? String(cell.value).length : 0;
				if (length > maxLength) maxLength = length;
			}
		});
		column.width = Math.min(Math.max(maxLength + 2, 10), 50);
	});

	worksheet.eachRow((row) => {
		row.eachCell((cell) => {
			cell.border = {
				top: { style: "thin" },
				left: { style: "thin" },
				bottom: { style: "thin" },
				right: { style: "thin" },
			};
		});
	});

	return workbook;
};
