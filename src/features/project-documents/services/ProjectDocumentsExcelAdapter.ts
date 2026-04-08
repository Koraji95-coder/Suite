import type { CellValue, Row } from "exceljs";
import type { AcadeDocumentReportRow } from "../service";

function normalizeText(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean")
		return String(value).trim();
	if (typeof value === "object" && "text" in value)
		return normalizeText((value as { text: unknown }).text);
	return String(value).trim();
}

function readCellText(row: Row, index: number): string {
	const cell = row.getCell(index);
	const raw = cell.value;
	if (raw == null) return "";
	if (typeof raw === "object" && "text" in raw) {
		return normalizeText(raw.text);
	}
	return normalizeText(raw);
}

function resolveReportColumnIndex(headers: string[], aliases: string[]): number {
	const lookup = headers.map((header) => header.toLowerCase());
	for (const alias of aliases) {
		const idx = lookup.indexOf(alias.toLowerCase());
		if (idx >= 0) return idx + 1;
	}
	return -1;
}

function parseDelimitedAcadeReport(
	text: string,
	delimiter: "," | "\t",
): AcadeDocumentReportRow[] {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length < 2) return [];
	const headers = lines[0].split(delimiter).map((value) => normalizeText(value));
	const fileIndex = resolveReportColumnIndex(headers, [
		"file",
		"file name",
		"filename",
		"path",
	]);
	const drawingIndex = resolveReportColumnIndex(headers, [
		"drawing no",
		"drawing number",
		"dwgno",
		"dwg no",
	]);
	const titleIndex = resolveReportColumnIndex(headers, [
		"title",
		"drawing title",
		"description",
	]);
	const revisionIndex = resolveReportColumnIndex(headers, [
		"revision",
		"rev",
	]);

	for (const requiredIndex of [fileIndex, drawingIndex, titleIndex]) {
		if (requiredIndex <= 0) {
			throw new Error(
				"ACADE report must include file, drawing number, and title columns.",
			);
		}
	}

	return lines.slice(1).map((line) => {
		const cells = line.split(delimiter);
		return {
			fileName: normalizeText(cells[fileIndex - 1]),
			drawingNumber: normalizeText(cells[drawingIndex - 1]),
			title: normalizeText(cells[titleIndex - 1]),
			revision: revisionIndex > 0 ? normalizeText(cells[revisionIndex - 1]) : "",
		};
	});
}

export async function parseAcadeDocumentReportFile(
	file: File,
): Promise<AcadeDocumentReportRow[]> {
	const lowerName = file.name.toLowerCase();
	if (lowerName.endsWith(".csv")) {
		return parseDelimitedAcadeReport(await file.text(), ",");
	}
	if (lowerName.endsWith(".tsv")) {
		return parseDelimitedAcadeReport(await file.text(), "\t");
	}
	if (!lowerName.endsWith(".xlsx")) {
		throw new Error("ACADE report import currently supports .xlsx, .csv, and .tsv files.");
	}

	const { Workbook } = await import("exceljs");
	const workbook = new Workbook();
	await workbook.xlsx.load(await file.arrayBuffer());
	const worksheet = workbook.worksheets[0];
	if (!worksheet) {
		return [];
	}

	const headerRow = worksheet.getRow(1);
	const headerValues = Array.isArray(headerRow.values)
		? headerRow.values.slice(1)
		: [];
	const headers = headerValues.map((value: CellValue) =>
		normalizeText(value),
	);
	const fileIndex = resolveReportColumnIndex(headers, [
		"file",
		"file name",
		"filename",
		"path",
	]);
	const drawingIndex = resolveReportColumnIndex(headers, [
		"drawing no",
		"drawing number",
		"dwgno",
		"dwg no",
	]);
	const titleIndex = resolveReportColumnIndex(headers, [
		"title",
		"drawing title",
		"description",
	]);
	const revisionIndex = resolveReportColumnIndex(headers, ["revision", "rev"]);

	for (const requiredIndex of [fileIndex, drawingIndex, titleIndex]) {
		if (requiredIndex <= 0) {
			throw new Error(
				"ACADE report must include file, drawing number, and title columns.",
			);
		}
	}

	const rows: AcadeDocumentReportRow[] = [];
	for (let index = 2; index <= worksheet.rowCount; index += 1) {
		const row = worksheet.getRow(index);
		const fileName = readCellText(row, fileIndex);
		const drawingNumber = readCellText(row, drawingIndex);
		const title = readCellText(row, titleIndex);
		const revision = revisionIndex > 0 ? readCellText(row, revisionIndex) : "";
		if (!fileName && !drawingNumber && !title && !revision) {
			continue;
		}
		rows.push({
			fileName,
			drawingNumber,
			title,
			revision,
		});
	}
	return rows;
}
