import { getLocalStorageApi } from "@/lib/browserStorage";
import { localId } from "@/lib/localId";
import { logger } from "@/lib/logger";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
import { parseTerminalScheduleWorkbook } from "./TerminalScheduleExcelAdapter";

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
			const snapshot = await parseTerminalScheduleWorkbook({
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
