import ExcelJS from "exceljs";
import { localId } from "@/lib/localId";
import type {
	ProjectTerminalConnectionRow,
	ProjectTerminalScheduleImportInput,
	ProjectTerminalScheduleSnapshot,
	ProjectTerminalStripRow,
} from "./projectTerminalScheduleService";

function createId() {
	return localId();
}

function normalizeText(value: unknown): string {
	return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown): string | null {
	const normalized = normalizeText(value);
	return normalized || null;
}

function normalizeHeader(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeDrawingKey(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.replace(/^.*[\\/]/, "")
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function normalizeSide(value: string): string {
	const normalized = normalizeText(value).toUpperCase();
	if (normalized === "LEFT") return "L";
	if (normalized === "RIGHT") return "R";
	if (normalized === "CENTER" || normalized === "CENTRE") return "C";
	return normalized || "L";
}

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

function readHeaders(worksheet: ExcelJS.Worksheet): string[] {
	const values = worksheet.getRow(1).values as Array<
		ExcelJS.CellValue | undefined
	>;
	return values.slice(1).map((value) => normalizeCellText(value));
}

function readCell(
	worksheet: ExcelJS.Worksheet,
	rowNumber: number,
	columnIndex: number,
): string {
	return normalizeCellText(
		worksheet.getRow(rowNumber).getCell(columnIndex + 1).value,
	);
}

function findHeaderIndex(headers: string[], ...labels: string[]): number {
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

function parsePositiveInteger(value: string, fallback = 0): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAnnotateRef(value: string): boolean {
	const normalized = normalizeText(value).toLowerCase();
	if (!normalized) {
		return true;
	}
	return !["0", "false", "no", "n", "off"].includes(normalized);
}

function buildStripKey(
	drawingPath: string | null,
	drawingNumber: string | null,
	stripId: string,
): string {
	return `${normalizeDrawingKey(drawingPath || drawingNumber)}::${normalizeDrawingKey(stripId)}`;
}

function buildRouteKey(
	drawingPath: string | null,
	drawingNumber: string | null,
	routeType: "conductor" | "jumper",
	routeRef: string,
): string {
	return `${normalizeDrawingKey(drawingPath || drawingNumber)}::${normalizeDrawingKey(routeType)}::${normalizeDrawingKey(routeRef)}`;
}

function buildStripRowId(
	sheetName: string,
	rowNumber: number,
	drawingRef: string,
	stripId: string,
): string {
	return [
		normalizeDrawingKey(sheetName),
		rowNumber,
		normalizeDrawingKey(drawingRef),
		normalizeDrawingKey(stripId),
	].join("::");
}

function buildConnectionRowId(
	sheetName: string,
	rowNumber: number,
	drawingRef: string,
	routeType: "conductor" | "jumper",
	routeRef: string,
): string {
	return [
		normalizeDrawingKey(sheetName),
		rowNumber,
		normalizeDrawingKey(drawingRef),
		normalizeDrawingKey(routeType),
		normalizeDrawingKey(routeRef),
	].join("::");
}

export async function parseTerminalScheduleWorkbook(
	input: ProjectTerminalScheduleImportInput,
): Promise<ProjectTerminalScheduleSnapshot> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(input.arrayBuffer);
	const stripSheet = workbook.worksheets.find(
		(sheet) => normalizeHeader(sheet.name) === "TERMINALSTRIPS",
	);
	if (!stripSheet) {
		throw new Error("Workbook must include a 'TerminalStrips' sheet.");
	}
	const connectionSheet =
		workbook.worksheets.find(
			(sheet) => normalizeHeader(sheet.name) === "TERMINALCONNECTIONS",
		) ?? null;

	const snapshotId = input.previousSnapshot?.id ?? createId();
	const warnings: string[] = [];
	const stripRows: ProjectTerminalStripRow[] = [];
	const connectionRows: ProjectTerminalConnectionRow[] = [];

	const stripHeaders = readHeaders(stripSheet);
	const stripDrawingPathIndex = findHeaderIndex(stripHeaders, "DrawingPath");
	const stripDrawingNumberIndex = findHeaderIndex(
		stripHeaders,
		"DrawingNumber",
	);
	const panelIdIndex = findHeaderIndex(stripHeaders, "PanelId");
	const sideIndex = findHeaderIndex(stripHeaders, "Side");
	const stripIdIndex = findHeaderIndex(stripHeaders, "StripId");
	const terminalCountIndex = findHeaderIndex(stripHeaders, "TerminalCount");
	const labelsCsvIndex = findHeaderIndex(stripHeaders, "LabelsCsv");
	if (
		panelIdIndex < 0 ||
		sideIndex < 0 ||
		stripIdIndex < 0 ||
		terminalCountIndex < 0 ||
		labelsCsvIndex < 0 ||
		(stripDrawingPathIndex < 0 && stripDrawingNumberIndex < 0)
	) {
		throw new Error(
			"TerminalStrips must include DrawingPath or DrawingNumber, PanelId, Side, StripId, TerminalCount, and LabelsCsv columns.",
		);
	}

	for (let rowNumber = 2; rowNumber <= stripSheet.rowCount; rowNumber += 1) {
		const drawingPath =
			stripDrawingPathIndex >= 0
				? readCell(stripSheet, rowNumber, stripDrawingPathIndex)
				: "";
		const drawingNumber =
			stripDrawingNumberIndex >= 0
				? readCell(stripSheet, rowNumber, stripDrawingNumberIndex)
				: "";
		const panelId = readCell(stripSheet, rowNumber, panelIdIndex);
		const side = readCell(stripSheet, rowNumber, sideIndex);
		const stripId = readCell(stripSheet, rowNumber, stripIdIndex);
		const terminalCount = parsePositiveInteger(
			readCell(stripSheet, rowNumber, terminalCountIndex),
		);
		const labelsCsv = readCell(stripSheet, rowNumber, labelsCsvIndex);
		const drawingRef = drawingPath || drawingNumber;
		if (!drawingRef && !panelId && !stripId && !labelsCsv) {
			continue;
		}
		if (!drawingRef) {
			warnings.push(
				`TerminalStrips row ${rowNumber} is missing DrawingPath/DrawingNumber.`,
			);
			continue;
		}
		if (!panelId || !stripId || terminalCount <= 0) {
			warnings.push(
				`TerminalStrips row ${rowNumber} is missing PanelId, StripId, or a valid TerminalCount.`,
			);
			continue;
		}
		let labels = labelsCsv.split(";").map((entry) => entry.trim());
		if (labels.length !== terminalCount) {
			warnings.push(
				`TerminalStrips row ${rowNumber} declared ${terminalCount} terminals but supplied ${labels.length} label value(s); Suite padded/truncated the labels.`,
			);
			if (labels.length < terminalCount) {
				labels = [
					...labels,
					...Array.from({ length: terminalCount - labels.length }, () => ""),
				];
			} else {
				labels = labels.slice(0, terminalCount);
			}
		}
		stripRows.push({
			id: buildStripRowId(stripSheet.name, rowNumber, drawingRef, stripId),
			snapshotId,
			sheetName: stripSheet.name,
			rowNumber,
			drawingPath: normalizeNullableText(drawingPath),
			drawingNumber: normalizeNullableText(drawingNumber),
			panelId,
			side: normalizeSide(side),
			stripId,
			terminalCount,
			labelsCsv,
			labels,
			stripKey: buildStripKey(
				normalizeNullableText(drawingPath),
				normalizeNullableText(drawingNumber),
				stripId,
			),
			warnings: [],
		});
	}

	if (connectionSheet) {
		const headers = readHeaders(connectionSheet);
		const drawingPathIndex = findHeaderIndex(headers, "DrawingPath");
		const drawingNumberIndex = findHeaderIndex(headers, "DrawingNumber");
		const routeRefIndex = findHeaderIndex(headers, "RouteRef");
		const routeTypeIndex = findHeaderIndex(headers, "RouteType");
		const cableTypeIndex = findHeaderIndex(headers, "CableType");
		const wireFunctionIndex = findHeaderIndex(headers, "WireFunction");
		const fromStripIdIndex = findHeaderIndex(headers, "FromStripId");
		const fromTerminalIndex = findHeaderIndex(headers, "FromTerminal");
		const toStripIdIndex = findHeaderIndex(headers, "ToStripId");
		const toTerminalIndex = findHeaderIndex(headers, "ToTerminal");
		const annotateRefIndex = findHeaderIndex(headers, "AnnotateRef");
		if (
			routeRefIndex < 0 ||
			routeTypeIndex < 0 ||
			cableTypeIndex < 0 ||
			wireFunctionIndex < 0 ||
			fromStripIdIndex < 0 ||
			fromTerminalIndex < 0 ||
			toStripIdIndex < 0 ||
			toTerminalIndex < 0 ||
			(drawingPathIndex < 0 && drawingNumberIndex < 0)
		) {
			throw new Error(
				"TerminalConnections must include DrawingPath or DrawingNumber, RouteRef, RouteType, CableType, WireFunction, FromStripId, FromTerminal, ToStripId, and ToTerminal columns.",
			);
		}
		for (
			let rowNumber = 2;
			rowNumber <= connectionSheet.rowCount;
			rowNumber += 1
		) {
			const drawingPath =
				drawingPathIndex >= 0
					? readCell(connectionSheet, rowNumber, drawingPathIndex)
					: "";
			const drawingNumber =
				drawingNumberIndex >= 0
					? readCell(connectionSheet, rowNumber, drawingNumberIndex)
					: "";
			const routeRef = readCell(connectionSheet, rowNumber, routeRefIndex);
			const routeType =
				normalizeText(
					readCell(connectionSheet, rowNumber, routeTypeIndex),
				).toLowerCase() === "jumper"
					? "jumper"
					: "conductor";
			const cableType = readCell(connectionSheet, rowNumber, cableTypeIndex);
			const wireFunction = readCell(
				connectionSheet,
				rowNumber,
				wireFunctionIndex,
			);
			const fromStripId = readCell(
				connectionSheet,
				rowNumber,
				fromStripIdIndex,
			);
			const fromTerminal = parsePositiveInteger(
				readCell(connectionSheet, rowNumber, fromTerminalIndex),
			);
			const toStripId = readCell(connectionSheet, rowNumber, toStripIdIndex);
			const toTerminal = parsePositiveInteger(
				readCell(connectionSheet, rowNumber, toTerminalIndex),
			);
			const annotateRef =
				annotateRefIndex >= 0
					? normalizeAnnotateRef(
							readCell(connectionSheet, rowNumber, annotateRefIndex),
						)
					: true;
			const drawingRef = drawingPath || drawingNumber;
			if (!drawingRef && !routeRef && !fromStripId && !toStripId) {
				continue;
			}
			if (!drawingRef) {
				warnings.push(
					`TerminalConnections row ${rowNumber} is missing DrawingPath/DrawingNumber.`,
				);
				continue;
			}
			if (
				!routeRef ||
				!fromStripId ||
				!toStripId ||
				fromTerminal <= 0 ||
				toTerminal <= 0
			) {
				warnings.push(
					`TerminalConnections row ${rowNumber} is missing RouteRef, strip ids, or valid terminal numbers.`,
				);
				continue;
			}
			connectionRows.push({
				id: buildConnectionRowId(
					connectionSheet.name,
					rowNumber,
					drawingRef,
					routeType,
					routeRef,
				),
				snapshotId,
				sheetName: connectionSheet.name,
				rowNumber,
				drawingPath: normalizeNullableText(drawingPath),
				drawingNumber: normalizeNullableText(drawingNumber),
				routeRef,
				routeType,
				cableType: cableType || "DC",
				wireFunction: wireFunction || "Control",
				fromStripId,
				fromTerminal,
				toStripId,
				toTerminal,
				annotateRef,
				routeKey: buildRouteKey(
					normalizeNullableText(drawingPath),
					normalizeNullableText(drawingNumber),
					routeType,
					routeRef,
				),
				warnings: [],
			});
		}
	}

	if (stripRows.length <= 0) {
		throw new Error(
			"Terminal schedule workbook did not produce any valid strip rows.",
		);
	}

	return {
		id: snapshotId,
		projectId: normalizeText(input.projectId),
		workbookFileName: normalizeText(input.fileName) || "Terminal Schedule.xlsx",
		importedAt: new Date().toISOString(),
		rowCount: stripRows.length + connectionRows.length,
		stripRowCount: stripRows.length,
		connectionRowCount: connectionRows.length,
		warnings,
		stripRows,
		connectionRows,
	};
}
