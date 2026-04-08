import type { CellValue, Worksheet } from "exceljs";
import type {
	ProjectDeliverableReadinessState,
	ProjectDeliverableRevisionSnapshot,
} from "../deliverableRegisterService";

export interface ParsedDeliverableRegisterRow {
	id: string;
	sheetName: string;
	setName: string | null;
	drawingNumber: string;
	drawingKey: string;
	drawingDescription: string;
	currentRevision: string;
	revisionHistory: ProjectDeliverableRevisionSnapshot[];
	notes: string | null;
	status: string | null;
	readinessState: ProjectDeliverableReadinessState;
}

const DRAWING_NUMBER_PATTERN = /\b[A-Z0-9]+(?:[-_][A-Z0-9]+){2,}\b/i;

function normalizeText(value: unknown): string {
	return String(value ?? "").trim();
}

function normalizeDrawingKey(value: unknown): string {
	return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeHeader(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function findHeaderIndex(headers: string[], label: string): number {
	return headers.findIndex((header) => normalizeHeader(header) === label);
}

function inferReadinessState(
	status: string | null,
	notes: string | null,
): ProjectDeliverableReadinessState {
	const normalizedStatus = normalizeHeader(status ?? "");
	const normalizedNotes = normalizeHeader(notes ?? "");
	if (
		normalizedStatus === "NOT CREATED YET" ||
		normalizedNotes.includes("NOT CREATED YET")
	) {
		return "blocked";
	}
	if (normalizedStatus === "READY FOR SUBMITTAL") {
		return "package-ready";
	}
	return "planning";
}

function isDrawingNumberCandidate(value: string): boolean {
	const normalized = normalizeText(value);
	return Boolean(normalized && DRAWING_NUMBER_PATTERN.test(normalized));
}

function createRowId(
	sheetName: string,
	setName: string | null,
	drawingNumber: string,
): string {
	return [sheetName, setName || "default", drawingNumber]
		.map((entry) => normalizeDrawingKey(entry))
		.filter(Boolean)
		.join("::");
}

function normalizeCellText(value: CellValue | undefined): string {
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
			return normalizeCellText(value.result as CellValue);
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

function normalizeCellDate(value: CellValue | undefined): string | null {
	if (value == null) {
		return null;
	}
	const resolved =
		typeof value === "object" && "result" in value
			? (value.result as CellValue)
			: value;
	if (resolved instanceof Date) {
		return resolved.toISOString().slice(0, 10);
	}
	const text = normalizeCellText(resolved);
	if (!text || text === "-") {
		return null;
	}
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseRevisionPairs(
	worksheet: Worksheet,
	headers: string[],
	rowNumber: number,
	descriptionIndex: number,
): { history: ProjectDeliverableRevisionSnapshot[]; currentRevision: string } {
	const history: ProjectDeliverableRevisionSnapshot[] = [];
	for (
		let columnIndex = descriptionIndex + 1;
		columnIndex < headers.length - 1;
		columnIndex += 1
	) {
		const header = normalizeHeader(headers[columnIndex] || "");
		const nextHeader = normalizeHeader(headers[columnIndex + 1] || "");
		if (header !== "REV" || nextHeader !== "DATE") {
			continue;
		}
		const revision = normalizeText(
			worksheet.getRow(rowNumber).getCell(columnIndex + 1).value,
		);
		const date = normalizeCellDate(
			worksheet.getRow(rowNumber).getCell(columnIndex + 2).value,
		);
		const meaningfulRevision = revision && revision !== "-";
		if (!meaningfulRevision && !date) {
			continue;
		}
		history.push({
			revision: meaningfulRevision ? revision : "",
			date,
			order: history.length,
		});
	}
	const currentRevision =
		[...history]
			.reverse()
			.find((entry) => normalizeText(entry.revision))?.revision ?? "";
	return { history, currentRevision };
}

function findHeaderRow(
	worksheet: Worksheet,
): { rowNumber: number; headers: string[] } | null {
	for (
		let rowNumber = 1;
		rowNumber <= Math.min(12, worksheet.rowCount);
		rowNumber += 1
	) {
		const values = worksheet.getRow(rowNumber).values as Array<
			CellValue | undefined
		>;
		const headers = values.slice(1).map((value) => normalizeCellText(value));
		if (findHeaderIndex(headers, "DRAWING NUMBER") >= 0) {
			return { rowNumber, headers };
		}
	}
	return null;
}

export async function parseDeliverableRegisterWorkbook(args: {
	fileName: string;
	arrayBuffer: ArrayBuffer;
}): Promise<ParsedDeliverableRegisterRow[]> {
	const { Workbook } = await import("exceljs");
	const workbook = new Workbook();
	await workbook.xlsx.load(args.arrayBuffer);

	const parsedRows: ParsedDeliverableRegisterRow[] = [];
	for (const worksheet of workbook.worksheets) {
		const headerRow = findHeaderRow(worksheet);
		if (!headerRow) {
			continue;
		}
		const headers = headerRow.headers;
		const drawingNumberIndex = findHeaderIndex(headers, "DRAWING NUMBER");
		const descriptionIndex = findHeaderIndex(headers, "DRAWING DESCRIPTION");
		const setIndex = findHeaderIndex(headers, "SET");
		const statusIndex = findHeaderIndex(headers, "STATUS");
		const notesIndex = findHeaderIndex(headers, "NOTES");
		if (drawingNumberIndex < 0 || descriptionIndex < 0) {
			continue;
		}

		for (
			let rowNumber = headerRow.rowNumber + 1;
			rowNumber <= worksheet.rowCount;
			rowNumber += 1
		) {
			const row = worksheet.getRow(rowNumber);
			const drawingNumber = normalizeCellText(
				row.getCell(drawingNumberIndex + 1).value,
			);
			if (!isDrawingNumberCandidate(drawingNumber)) {
				continue;
			}
			const drawingDescription = normalizeCellText(
				row.getCell(descriptionIndex + 1).value,
			);
			const { history, currentRevision } = parseRevisionPairs(
				worksheet,
				headers,
				rowNumber,
				descriptionIndex,
			);
			const setName =
				setIndex >= 0
					? normalizeCellText(row.getCell(setIndex + 1).value) || null
					: null;
			const status =
				statusIndex >= 0
					? normalizeCellText(row.getCell(statusIndex + 1).value) || null
					: null;
			const notes =
				notesIndex >= 0
					? normalizeCellText(row.getCell(notesIndex + 1).value) || null
					: null;
			const readinessState = inferReadinessState(status, notes);

			parsedRows.push({
				id: createRowId(worksheet.name, setName, drawingNumber),
				sheetName: worksheet.name,
				setName,
				drawingNumber,
				drawingKey: normalizeDrawingKey(drawingNumber),
				drawingDescription,
				currentRevision,
				revisionHistory: history,
				notes,
				status,
				readinessState,
			});
		}
	}

	return parsedRows;
}
