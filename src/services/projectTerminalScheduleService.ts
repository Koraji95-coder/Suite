import ExcelJS from "exceljs";
import { getLocalStorageApi } from "@/lib/browserStorage";
import { localId } from "@/lib/localId";
import { logger } from "@/lib/logger";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";

export interface ProjectTerminalStripRow {
	id: string;
	snapshotId: string;
	sheetName: string;
	rowNumber: number;
	drawingPath: string | null;
	drawingNumber: string | null;
	panelId: string;
	side: string;
	stripId: string;
	terminalCount: number;
	labelsCsv: string;
	labels: string[];
	stripKey: string;
	warnings: string[];
}

export interface ProjectTerminalConnectionRow {
	id: string;
	snapshotId: string;
	sheetName: string;
	rowNumber: number;
	drawingPath: string | null;
	drawingNumber: string | null;
	routeRef: string;
	routeType: "conductor" | "jumper";
	cableType: string;
	wireFunction: string;
	fromStripId: string;
	fromTerminal: number;
	toStripId: string;
	toTerminal: number;
	annotateRef: boolean;
	routeKey: string;
	warnings: string[];
}

export interface ProjectTerminalScheduleSnapshot {
	id: string;
	projectId: string;
	workbookFileName: string;
	importedAt: string;
	rowCount: number;
	stripRowCount: number;
	connectionRowCount: number;
	warnings: string[];
	stripRows: ProjectTerminalStripRow[];
	connectionRows: ProjectTerminalConnectionRow[];
}

export interface ProjectTerminalScheduleImportInput {
	projectId: string;
	fileName: string;
	arrayBuffer: ArrayBuffer;
	previousSnapshot?: ProjectTerminalScheduleSnapshot | null;
}

const TERMINAL_SCHEDULE_SETTING_KEY = "project_terminal_schedule_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-terminal-schedule";

function createId() {
	return localId();
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

function normalizeHeader(value: string) {
	return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeDrawingKey(value: string | null | undefined) {
	return String(value ?? "")
		.trim()
		.replace(/^.*[\\/]/, "")
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function normalizeSide(value: string) {
	const normalized = normalizeText(value).toUpperCase();
	if (normalized === "LEFT") return "L";
	if (normalized === "RIGHT") return "R";
	if (normalized === "CENTER" || normalized === "CENTRE") return "C";
	return normalized || "L";
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
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

function parsePositiveInteger(value: string, fallback = 0) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAnnotateRef(value: string) {
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
) {
	return `${normalizeDrawingKey(drawingPath || drawingNumber)}::${normalizeDrawingKey(stripId)}`;
}

function buildRouteKey(
	drawingPath: string | null,
	drawingNumber: string | null,
	routeType: "conductor" | "jumper",
	routeRef: string,
) {
	return `${normalizeDrawingKey(drawingPath || drawingNumber)}::${normalizeDrawingKey(routeType)}::${normalizeDrawingKey(routeRef)}`;
}

function buildStripRowId(
	sheetName: string,
	rowNumber: number,
	drawingRef: string,
	stripId: string,
) {
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
) {
	return [
		normalizeDrawingKey(sheetName),
		rowNumber,
		normalizeDrawingKey(drawingRef),
		normalizeDrawingKey(routeType),
		normalizeDrawingKey(routeRef),
	].join("::");
}

function normalizeStripRow(
	value: unknown,
	snapshotId: string,
): ProjectTerminalStripRow | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectTerminalStripRow>;
	const id = normalizeText(candidate.id);
	const stripId = normalizeText(candidate.stripId);
	if (!id || !stripId) {
		return null;
	}
	return {
		id,
		snapshotId,
		sheetName: normalizeText(candidate.sheetName) || "TerminalStrips",
		rowNumber: Math.max(1, Number(candidate.rowNumber || 1)),
		drawingPath: normalizeNullableText(candidate.drawingPath),
		drawingNumber: normalizeNullableText(candidate.drawingNumber),
		panelId: normalizeText(candidate.panelId),
		side: normalizeSide(String(candidate.side ?? "")),
		stripId,
		terminalCount: Math.max(1, Number(candidate.terminalCount || 1)),
		labelsCsv: normalizeText(candidate.labelsCsv),
		labels: Array.isArray(candidate.labels)
			? candidate.labels.map((entry) => String(entry ?? ""))
			: [],
		stripKey:
			normalizeText(candidate.stripKey) ||
			buildStripKey(
				normalizeNullableText(candidate.drawingPath),
				normalizeNullableText(candidate.drawingNumber),
				stripId,
			),
		warnings: Array.isArray(candidate.warnings)
			? candidate.warnings.map((entry) => normalizeText(entry)).filter(Boolean)
			: [],
	};
}

function normalizeConnectionRow(
	value: unknown,
	snapshotId: string,
): ProjectTerminalConnectionRow | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectTerminalConnectionRow>;
	const id = normalizeText(candidate.id);
	const routeRef = normalizeText(candidate.routeRef);
	if (!id || !routeRef) {
		return null;
	}
	const routeType =
		normalizeText(candidate.routeType).toLowerCase() === "jumper"
			? "jumper"
			: "conductor";
	return {
		id,
		snapshotId,
		sheetName: normalizeText(candidate.sheetName) || "TerminalConnections",
		rowNumber: Math.max(1, Number(candidate.rowNumber || 1)),
		drawingPath: normalizeNullableText(candidate.drawingPath),
		drawingNumber: normalizeNullableText(candidate.drawingNumber),
		routeRef,
		routeType,
		cableType: normalizeText(candidate.cableType) || "DC",
		wireFunction: normalizeText(candidate.wireFunction) || "Control",
		fromStripId: normalizeText(candidate.fromStripId),
		fromTerminal: Math.max(1, Number(candidate.fromTerminal || 1)),
		toStripId: normalizeText(candidate.toStripId),
		toTerminal: Math.max(1, Number(candidate.toTerminal || 1)),
		annotateRef:
			typeof candidate.annotateRef === "boolean" ? candidate.annotateRef : true,
		routeKey:
			normalizeText(candidate.routeKey) ||
			buildRouteKey(
				normalizeNullableText(candidate.drawingPath),
				normalizeNullableText(candidate.drawingNumber),
				routeType,
				routeRef,
			),
		warnings: Array.isArray(candidate.warnings)
			? candidate.warnings.map((entry) => normalizeText(entry)).filter(Boolean)
			: [],
	};
}

function normalizeSnapshot(
	value: unknown,
): ProjectTerminalScheduleSnapshot | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectTerminalScheduleSnapshot>;
	const projectId = normalizeText(candidate.projectId);
	if (!projectId) {
		return null;
	}
	const id = normalizeText(candidate.id) || createId();
	const stripRows = Array.isArray(candidate.stripRows)
		? candidate.stripRows
				.map((entry) => normalizeStripRow(entry, id))
				.filter((entry): entry is ProjectTerminalStripRow => entry !== null)
		: [];
	const connectionRows = Array.isArray(candidate.connectionRows)
		? candidate.connectionRows
				.map((entry) => normalizeConnectionRow(entry, id))
				.filter(
					(entry): entry is ProjectTerminalConnectionRow => entry !== null,
				)
		: [];
	return {
		id,
		projectId,
		workbookFileName:
			normalizeText(candidate.workbookFileName) || "Terminal Schedule.xlsx",
		importedAt: normalizeText(candidate.importedAt) || new Date().toISOString(),
		rowCount:
			Math.max(0, Number(candidate.rowCount || 0)) ||
			stripRows.length + connectionRows.length,
		stripRowCount:
			Math.max(0, Number(candidate.stripRowCount || 0)) || stripRows.length,
		connectionRowCount:
			Math.max(0, Number(candidate.connectionRowCount || 0)) ||
			connectionRows.length,
		warnings: Array.isArray(candidate.warnings)
			? candidate.warnings.map((entry) => normalizeText(entry)).filter(Boolean)
			: [],
		stripRows,
		connectionRows,
	};
}

async function parseWorkbook(
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

function readLocalSnapshot(
	projectId: string,
): ProjectTerminalScheduleSnapshot | null {
	const storage = getLocalStorageApi();
	if (!storage) return null;
	try {
		const raw = storage.getItem(buildLocalStorageKey(projectId));
		return raw ? normalizeSnapshot(JSON.parse(raw)) : null;
	} catch (error) {
		logger.warn(
			"Unable to read local terminal schedule snapshot.",
			"ProjectTerminalScheduleService",
			error,
		);
		return null;
	}
}

function writeLocalSnapshot(snapshot: ProjectTerminalScheduleSnapshot) {
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		storage.setItem(
			buildLocalStorageKey(snapshot.projectId),
			JSON.stringify(snapshot),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local terminal schedule snapshot.",
			"ProjectTerminalScheduleService",
			error,
		);
	}
}

async function persistSnapshot(snapshot: ProjectTerminalScheduleSnapshot) {
	writeLocalSnapshot(snapshot);
	const result = await saveSetting(
		TERMINAL_SCHEDULE_SETTING_KEY,
		snapshot,
		snapshot.projectId,
	);
	if (!result.success) {
		return new Error(
			result.error ||
				"Unable to persist terminal schedule snapshot to project settings.",
		);
	}
	return null;
}

export const projectTerminalScheduleService = {
	async fetchSnapshot(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: null,
				error: new Error("Project id is required."),
			};
		}
		const localFallback = readLocalSnapshot(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				TERMINAL_SCHEDULE_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			const normalized = normalizeSnapshot(stored);
			if (!normalized) {
				return {
					data: localFallback,
					error: new Error("Stored terminal schedule snapshot is invalid."),
				};
			}
			writeLocalSnapshot(normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load terminal schedule snapshot."),
			};
		}
	},

	async importWorkbook(input: ProjectTerminalScheduleImportInput) {
		const normalizedProjectId = normalizeText(input.projectId);
		if (!normalizedProjectId) {
			return {
				data: null,
				error: new Error("Project id is required."),
			};
		}
		try {
			const snapshot = await parseWorkbook({
				...input,
				projectId: normalizedProjectId,
			});
			const persistError = await persistSnapshot(snapshot);
			return { data: snapshot, error: persistError };
		} catch (error) {
			return {
				data: null,
				error:
					error instanceof Error
						? error
						: new Error("Unable to import terminal schedule workbook."),
			};
		}
	},

	async clearSnapshot(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				success: false,
				error: new Error("Project id is required."),
			};
		}
		const storage = getLocalStorageApi();
		if (storage) {
			try {
				storage.removeItem(buildLocalStorageKey(normalizedProjectId));
			} catch {
				// Ignore local cleanup failures.
			}
		}
		const result = await deleteSetting(
			TERMINAL_SCHEDULE_SETTING_KEY,
			normalizedProjectId,
		);
		return {
			success: result.success,
			error: result.success
				? null
				: new Error(
						result.error || "Unable to clear terminal schedule snapshot.",
					),
		};
	},
};
