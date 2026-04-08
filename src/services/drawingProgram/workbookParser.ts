import ExcelJS from "exceljs";
import type {
	ProjectDrawingStandardCatalogEntry,
	ProjectDrawingStandardImportInput,
	ProjectDrawingStandardSnapshot,
	ProjectDrawingTemplateMapping,
	ProjectDrawingWorkbookImportedRow,
	ProjectDrawingWorkbookMirrorRow,
	ProjectDrawingProgramRecord,
} from "./types";
import {
	createId,
	normalizeCatalogKey,
	normalizeHeader,
	normalizeNullableText,
	normalizeProvisionState,
	normalizeStatus,
	normalizeText,
	parsePositiveInt,
	sortCatalogEntries,
	sortRows,
	formatSequenceBand,
	DEFAULT_SEQUENCE_DIGITS,
	nowIso,
} from "./validation";

const STARTER_SHEET_NAMES = ["Starter Matrix", "Drawing Standard"];
const TEMPLATE_SHEET_NAMES = ["Template Map", "Templates"];

function normalizeCellText(value: ExcelJS.CellValue | undefined): string {
	if (value == null) {
		return "";
	}
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return String(value).trim();
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "object") {
		if ("result" in value) {
			return normalizeCellText(value.result as ExcelJS.CellValue);
		}
		if ("text" in value && typeof value.text === "string") {
			return value.text.trim();
		}
		if ("richText" in value && Array.isArray(value.richText)) {
			return value.richText
				.map((entry) => normalizeText(entry.text))
				.join("")
				.trim();
		}
	}
	return "";
}

function readHeaders(worksheet: ExcelJS.Worksheet) {
	const values = worksheet.getRow(1).values as Array<
		ExcelJS.CellValue | undefined
	>;
	return values.slice(1).map((value) => normalizeCellText(value));
}

function readCell(
	worksheet: ExcelJS.Worksheet,
	rowNumber: number,
	columnIndex: number,
) {
	return normalizeCellText(
		worksheet.getRow(rowNumber).getCell(columnIndex + 1).value,
	);
}

function findSheet(workbook: ExcelJS.Workbook, candidates: string[]) {
	for (const candidate of candidates) {
		const sheet = workbook.getWorksheet(candidate);
		if (sheet) {
			return sheet;
		}
	}
	return null;
}

function findHeaderIndex(headers: string[], ...labels: string[]) {
	const normalizedHeaders = headers.map((entry) => normalizeHeader(entry));
	for (const label of labels) {
		const index = normalizedHeaders.findIndex(
			(entry) => entry === normalizeHeader(label),
		);
		if (index >= 0) {
			return index;
		}
	}
	return -1;
}

export async function parseStandardWorkbook(
	input: ProjectDrawingStandardImportInput,
): Promise<ProjectDrawingStandardSnapshot> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(input.arrayBuffer);
	const starterSheet = findSheet(workbook, STARTER_SHEET_NAMES);
	if (!starterSheet) {
		throw new Error(
			`Drawing standard workbook must include one of these sheets: ${STARTER_SHEET_NAMES.join(", ")}.`,
		);
	}

	const starterHeaders = readHeaders(starterSheet);
	const familyKeyIndex = findHeaderIndex(starterHeaders, "Family Key");
	const typeCodeIndex = findHeaderIndex(starterHeaders, "Type Code");
	const sheetFamilyIndex = findHeaderIndex(starterHeaders, "Sheet Family");
	const titleIndex = findHeaderIndex(starterHeaders, "Default Title", "Title");
	const countIndex = findHeaderIndex(starterHeaders, "Default Count", "Count");
	const prefixIndex = findHeaderIndex(starterHeaders, "Number Prefix");
	const digitsIndex = findHeaderIndex(starterHeaders, "Sequence Digits");
	const startIndex = findHeaderIndex(starterHeaders, "Sequence Start");
	const bandStartIndex = findHeaderIndex(
		starterHeaders,
		"Sequence Band Start",
		"Band Start",
	);
	const bandEndIndex = findHeaderIndex(
		starterHeaders,
		"Sequence Band End",
		"Band End",
	);
	const bootstrapCountIndex = findHeaderIndex(
		starterHeaders,
		"Bootstrap Default Count",
	);
	const templateKeyIndex = findHeaderIndex(starterHeaders, "Template Key");
	const disciplineIndex = findHeaderIndex(starterHeaders, "Discipline");
	const acadeSectionIndex = findHeaderIndex(
		starterHeaders,
		"ACADE Section",
		"ACADE Subtype",
	);
	const acadeGroupIndex = findHeaderIndex(starterHeaders, "ACADE Group");
	const directTemplatePathIndex = findHeaderIndex(
		starterHeaders,
		"Template Path",
	);

	const missingRequiredColumns = [
		{ label: "Sheet Family", index: sheetFamilyIndex },
		{ label: "Default Title", index: titleIndex },
		{ label: "Default Count", index: countIndex },
		{ label: "Template Key", index: templateKeyIndex },
	].filter((entry) => entry.index < 0);
	if (missingRequiredColumns.length > 0) {
		throw new Error(
			`Drawing standard workbook is missing required columns: ${missingRequiredColumns
				.map((entry) => entry.label)
				.join(", ")}.`,
		);
	}
	if (typeCodeIndex < 0 && prefixIndex < 0) {
		throw new Error(
			"Drawing standard workbook must include either 'Type Code' or 'Number Prefix'.",
		);
	}
	if (bandStartIndex < 0 && startIndex < 0) {
		throw new Error(
			"Drawing standard workbook must include either 'Sequence Band Start' or 'Sequence Start'.",
		);
	}

	const templateSheet = findSheet(workbook, TEMPLATE_SHEET_NAMES);
	const templateMap = new Map<string, ProjectDrawingTemplateMapping>();
	if (templateSheet) {
		const templateHeaders = readHeaders(templateSheet);
		const keyIndex = findHeaderIndex(templateHeaders, "Template Key");
		const pathIndex = findHeaderIndex(
			templateHeaders,
			"Template Path",
			"Template File",
		);
		const sectionIndex = findHeaderIndex(templateHeaders, "ACADE Section");
		const groupIndex = findHeaderIndex(templateHeaders, "ACADE Group");
		const templateDisciplineIndex = findHeaderIndex(
			templateHeaders,
			"Discipline",
		);
		for (
			let rowNumber = 2;
			rowNumber <= templateSheet.rowCount;
			rowNumber += 1
		) {
			const templateKey =
				keyIndex >= 0 ? readCell(templateSheet, rowNumber, keyIndex) : "";
			if (!templateKey) {
				continue;
			}
			templateMap.set(templateKey.toLowerCase(), {
				id: createId("drawing-template"),
				templateKey,
				templatePath:
					pathIndex >= 0
						? normalizeNullableText(
								readCell(templateSheet, rowNumber, pathIndex),
							)
						: null,
				discipline:
					templateDisciplineIndex >= 0
						? readCell(templateSheet, rowNumber, templateDisciplineIndex)
						: "",
				acadeSection:
					sectionIndex >= 0
						? normalizeNullableText(
								readCell(templateSheet, rowNumber, sectionIndex),
							)
						: null,
				acadeGroup:
					groupIndex >= 0
						? normalizeNullableText(
								readCell(templateSheet, rowNumber, groupIndex),
							)
						: null,
				warnings: [],
			});
		}
	}

	const snapshotId = createId("drawing-standard");
	const warnings: string[] = [];
	const catalogEntries: ProjectDrawingStandardCatalogEntry[] = [];
	for (let rowNumber = 2; rowNumber <= starterSheet.rowCount; rowNumber += 1) {
		const sheetFamily = readCell(starterSheet, rowNumber, sheetFamilyIndex);
		const numberPrefix =
			prefixIndex >= 0 ? readCell(starterSheet, rowNumber, prefixIndex) : "";
		const templateKey = readCell(starterSheet, rowNumber, templateKeyIndex);
		if (!sheetFamily && !numberPrefix && !templateKey) {
			continue;
		}
		const rowWarnings: string[] = [];
		const mapping = templateMap.get(templateKey.toLowerCase()) ?? null;
		const parsedPrefixMatch = normalizeText(numberPrefix).match(/(E\d)\s*-?$/i);
		const typeCode =
			(typeCodeIndex >= 0
				? normalizeText(
						readCell(starterSheet, rowNumber, typeCodeIndex),
					).toUpperCase()
				: "") ||
			(parsedPrefixMatch?.[1]?.toUpperCase() ?? "");
		const sequenceBandStart = Math.max(
			0,
			parsePositiveInt(
				bandStartIndex >= 0
					? readCell(starterSheet, rowNumber, bandStartIndex)
					: readCell(starterSheet, rowNumber, startIndex),
				1,
			),
		);
		const sequenceBandEnd = Math.max(
			sequenceBandStart,
			parsePositiveInt(
				bandEndIndex >= 0
					? readCell(starterSheet, rowNumber, bandEndIndex)
					: sequenceBandStart +
							Math.max(
								0,
								parsePositiveInt(
									readCell(starterSheet, rowNumber, countIndex),
									1,
								) - 1,
							),
				sequenceBandStart,
			),
		);
		const catalogEntry: ProjectDrawingStandardCatalogEntry = {
			id: createId("drawing-standard-row"),
			snapshotId,
			rowNumber,
			familyKey:
				(familyKeyIndex >= 0
					? normalizeCatalogKey(
							readCell(starterSheet, rowNumber, familyKeyIndex),
						)
					: "") || normalizeCatalogKey(sheetFamily || templateKey),
			typeCode,
			sheetFamily: sheetFamily || `Sheet ${rowNumber - 1}`,
			defaultTitle:
				readCell(starterSheet, rowNumber, titleIndex) ||
				sheetFamily ||
				`Sheet ${rowNumber - 1}`,
			defaultCount: parsePositiveInt(
				readCell(starterSheet, rowNumber, countIndex),
				1,
			),
			sequenceBandStart,
			sequenceBandEnd,
			sequenceDigits: Math.max(
				1,
				parsePositiveInt(
					digitsIndex >= 0
						? readCell(starterSheet, rowNumber, digitsIndex)
						: DEFAULT_SEQUENCE_DIGITS,
					DEFAULT_SEQUENCE_DIGITS,
				),
			),
			bootstrapDefaultCount: Math.max(
				0,
				parsePositiveInt(
					bootstrapCountIndex >= 0
						? readCell(starterSheet, rowNumber, bootstrapCountIndex)
						: 0,
					0,
				),
			),
			templateKey,
			templatePath:
				(directTemplatePathIndex >= 0
					? normalizeNullableText(
							readCell(starterSheet, rowNumber, directTemplatePathIndex),
						)
					: null) ??
				mapping?.templatePath ??
				null,
			discipline:
				(disciplineIndex >= 0
					? readCell(starterSheet, rowNumber, disciplineIndex)
					: "") ||
				mapping?.discipline ||
				"",
			acadeSection:
				(acadeSectionIndex >= 0
					? normalizeNullableText(
							readCell(starterSheet, rowNumber, acadeSectionIndex),
						)
					: null) ??
				mapping?.acadeSection ??
				null,
			acadeGroup:
				(acadeGroupIndex >= 0
					? normalizeNullableText(
							readCell(starterSheet, rowNumber, acadeGroupIndex),
						)
					: null) ??
				mapping?.acadeGroup ??
				null,
			warnings: rowWarnings,
		};
		if (!catalogEntry.typeCode) {
			rowWarnings.push(`Row ${rowNumber}: Type Code is required.`);
		}
		if (!catalogEntry.familyKey) {
			rowWarnings.push(`Row ${rowNumber}: Family Key is required.`);
		}
		if (!catalogEntry.templateKey) {
			rowWarnings.push(`Row ${rowNumber}: Template Key is required.`);
		}
		if (!catalogEntry.templatePath) {
			rowWarnings.push(
				`Row ${rowNumber}: Template path is not mapped yet for '${catalogEntry.templateKey}'.`,
			);
		}
		if (catalogEntry.sequenceBandEnd < catalogEntry.sequenceBandStart) {
			rowWarnings.push(
				`Row ${rowNumber}: Sequence band end must be greater than or equal to the start.`,
			);
		}
		if (rowWarnings.length > 0) {
			warnings.push(...rowWarnings);
		}
		catalogEntries.push(catalogEntry);
	}

	if (catalogEntries.length === 0) {
		throw new Error(
			"Drawing standard workbook did not produce any catalog entries.",
		);
	}

	return {
		id: snapshotId,
		projectId: input.projectId,
		source: "project-import",
		standardKey: `project-import:${normalizeCatalogKey(input.fileName || "override") || "override"}`,
		catalogVersion: "1",
		disciplineScope: "E",
		workbookFileName: input.fileName,
		importedAt: nowIso(),
		catalogEntries: sortCatalogEntries(catalogEntries),
		starterRows: sortCatalogEntries(catalogEntries),
		templateMappings: Array.from(templateMap.values()),
		warnings,
	};
}

export function buildWorkbookMirrorRows(
	program: ProjectDrawingProgramRecord,
): ProjectDrawingWorkbookMirrorRow[] {
	return sortRows(program.rows)
		.filter((row) => row.status !== "inactive")
		.map((row) => ({
			suiteRowId: row.id,
			sortOrder: row.sortOrder,
			drawingNumber: row.drawingNumber,
			title: row.title,
			status: row.status,
			discipline: row.discipline,
			sheetFamily: row.sheetFamily,
			familyKey: row.familyKey,
			typeCode: row.typeCode,
			sequenceBand: formatSequenceBand(
				row.sequenceBandStart,
				row.sequenceBandEnd,
				row.sequenceDigits,
			),
			templateKey: row.templateKey,
			provisionState: row.provisionState,
			dwgRelativePath: row.dwgRelativePath || "",
			acadeSection: row.acadeSection || "",
			acadeGroup: row.acadeGroup || "",
		}));
}

export async function parseWorkbookMirror(
	arrayBuffer: ArrayBuffer,
): Promise<ProjectDrawingWorkbookImportedRow[]> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(arrayBuffer);
	const sheet = workbook.getWorksheet("Drawing Index");
	if (!sheet) {
		throw new Error("Workbook must include a 'Drawing Index' sheet.");
	}
	const headers = readHeaders(sheet);
	const suiteRowIdIndex = findHeaderIndex(headers, "Suite Row ID");
	const sortOrderIndex = findHeaderIndex(headers, "Sort Order");
	const drawingNumberIndex = findHeaderIndex(headers, "Drawing Number");
	const titleIndex = findHeaderIndex(headers, "Title");
	const statusIndex = findHeaderIndex(headers, "Status");
	const disciplineIndex = findHeaderIndex(headers, "Discipline");
	const sheetFamilyIndex = findHeaderIndex(headers, "Sheet Family");
	const familyKeyIndex = findHeaderIndex(headers, "Family Key");
	const typeCodeIndex = findHeaderIndex(headers, "Type Code");
	const sequenceBandIndex = findHeaderIndex(headers, "Sequence Band");
	const templateKeyIndex = findHeaderIndex(headers, "Template Key");
	const provisionStateIndex = findHeaderIndex(headers, "Provision State");
	const dwgPathIndex = findHeaderIndex(
		headers,
		"DWG Path",
		"DWG Relative Path",
	);
	const acadeSectionIndex = findHeaderIndex(headers, "ACADE Section");
	const acadeGroupIndex = findHeaderIndex(headers, "ACADE Group");

	const required = [
		{ label: "Sort Order", index: sortOrderIndex },
		{ label: "Drawing Number", index: drawingNumberIndex },
		{ label: "Title", index: titleIndex },
		{ label: "Status", index: statusIndex },
		{ label: "Template Key", index: templateKeyIndex },
	].filter((entry) => entry.index < 0);
	if (required.length > 0) {
		throw new Error(
			`Workbook mirror is missing required columns: ${required
				.map((entry) => entry.label)
				.join(", ")}.`,
		);
	}

	const rows: ProjectDrawingWorkbookImportedRow[] = [];
	for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
		const drawingNumber = readCell(sheet, rowNumber, drawingNumberIndex);
		const title = readCell(sheet, rowNumber, titleIndex);
		if (!drawingNumber && !title) {
			continue;
		}
		rows.push({
			suiteRowId:
				suiteRowIdIndex >= 0
					? normalizeNullableText(readCell(sheet, rowNumber, suiteRowIdIndex))
					: null,
			sortOrder: Math.max(
				1,
				parsePositiveInt(
					readCell(sheet, rowNumber, sortOrderIndex),
					rowNumber * 10,
				),
			),
			drawingNumber,
			title,
			status: normalizeStatus(readCell(sheet, rowNumber, statusIndex)),
			discipline:
				disciplineIndex >= 0 ? readCell(sheet, rowNumber, disciplineIndex) : "",
			sheetFamily:
				sheetFamilyIndex >= 0
					? readCell(sheet, rowNumber, sheetFamilyIndex)
					: "",
			familyKey:
				familyKeyIndex >= 0 ? readCell(sheet, rowNumber, familyKeyIndex) : "",
			typeCode:
				typeCodeIndex >= 0 ? readCell(sheet, rowNumber, typeCodeIndex) : "",
			sequenceBand:
				sequenceBandIndex >= 0
					? readCell(sheet, rowNumber, sequenceBandIndex)
					: "",
			templateKey:
				templateKeyIndex >= 0
					? readCell(sheet, rowNumber, templateKeyIndex)
					: "",
			provisionState:
				provisionStateIndex >= 0
					? normalizeProvisionState(
							readCell(sheet, rowNumber, provisionStateIndex),
						)
					: "planned",
			dwgRelativePath:
				dwgPathIndex >= 0 ? readCell(sheet, rowNumber, dwgPathIndex) : "",
			acadeSection:
				acadeSectionIndex >= 0
					? readCell(sheet, rowNumber, acadeSectionIndex)
					: "",
			acadeGroup:
				acadeGroupIndex >= 0 ? readCell(sheet, rowNumber, acadeGroupIndex) : "",
		});
	}
	return rows;
}
