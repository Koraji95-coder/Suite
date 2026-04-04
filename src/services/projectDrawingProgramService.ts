import ExcelJS from "exceljs";
import { getLocalStorageApi } from "@/lib/browserStorage";
import { localId } from "@/lib/localId";
import { logger } from "@/lib/logger";
import type { WatchdogCollectorEvent } from "@/services/watchdogService";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";

export type ProjectDrawingProgramRowStatus =
	| "planned"
	| "active"
	| "on-hold"
	| "inactive";

export type ProjectDrawingProvisionState =
	| "planned"
	| "provisioned"
	| "blocked"
	| "inactive";

export type ProjectDrawingProgramPlanMode =
	| "bootstrap"
	| "insert"
	| "deactivate"
	| "workbook-reconcile"
	| "acade-sync";

export type ProjectDrawingProgramChangeType =
	| "create"
	| "renumber"
	| "rename-file"
	| "title-update"
	| "status-update"
	| "reorder"
	| "deactivate"
	| "warning";

export type ProjectDrawingProgramFileActionKind =
	| "copy-template"
	| "rename-dwg"
	| "skip-missing-template";

export type ProjectDrawingStandardSource = "builtin" | "project-import";

export interface ProjectDrawingTemplateMapping {
	id: string;
	templateKey: string;
	templatePath: string | null;
	discipline: string;
	acadeSection: string | null;
	acadeGroup: string | null;
	warnings: string[];
}

export interface ProjectDrawingStandardCatalogEntry {
	id: string;
	snapshotId: string;
	rowNumber: number;
	familyKey: string;
	typeCode: string;
	sheetFamily: string;
	defaultTitle: string;
	defaultCount: number;
	sequenceBandStart: number;
	sequenceBandEnd: number;
	sequenceDigits: number;
	bootstrapDefaultCount: number;
	templateKey: string;
	templatePath: string | null;
	discipline: string;
	acadeSection: string | null;
	acadeGroup: string | null;
	warnings: string[];
}

export type ProjectDrawingStandardStarterRow =
	ProjectDrawingStandardCatalogEntry;

export interface ProjectDrawingStandardSnapshot {
	id: string;
	projectId: string;
	source: ProjectDrawingStandardSource;
	standardKey: string;
	catalogVersion: string;
	disciplineScope: string;
	workbookFileName: string;
	importedAt: string;
	catalogEntries: ProjectDrawingStandardCatalogEntry[];
	starterRows: ProjectDrawingStandardStarterRow[];
	templateMappings: ProjectDrawingTemplateMapping[];
	warnings: string[];
}

export interface ProjectDrawingProgramRow {
	id: string;
	projectId: string;
	standardRowId: string | null;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBandStart: number;
	sequenceBandEnd: number;
	catalogSource: ProjectDrawingStandardSource;
	templateKey: string;
	templatePath: string | null;
	status: ProjectDrawingProgramRowStatus;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string | null;
	acadeSection: string | null;
	acadeGroup: string | null;
	workbookSyncedAt: string | null;
	workbookDriftDetectedAt: string | null;
	numberPrefix: string;
	sequenceDigits: number;
	sequenceNumber: number;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectDrawingWorkbookMirror {
	workbookRelativePath: string;
	lastExportedAt: string | null;
	lastImportedAt: string | null;
	lastDriftEventAt: string | null;
}

export interface ProjectDrawingProgramRecord {
	id: string;
	projectId: string;
	activeStandardKey: string;
	standardSnapshotId: string | null;
	workbookMirror: ProjectDrawingWorkbookMirror;
	rows: ProjectDrawingProgramRow[];
	pendingTitleBlockSyncPaths: string[];
	pendingTitleBlockSyncAt: string | null;
	lastAcadeSyncAt: string | null;
	acadeSyncPending: boolean;
	lastProvisionReceiptId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectDrawingWorkbookMirrorRow {
	suiteRowId: string;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	status: ProjectDrawingProgramRowStatus;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBand: string;
	templateKey: string;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string;
	acadeSection: string;
	acadeGroup: string;
}

export interface ProjectDrawingProvisionReceipt {
	id: string;
	projectId: string;
	programId: string;
	planId: string;
	mode: ProjectDrawingProgramPlanMode;
	appliedAt: string;
	createdFiles: string[];
	renamedFiles: Array<{
		fromRelativePath: string;
		toRelativePath: string;
	}>;
	workbookPath: string | null;
	wdpPath: string | null;
	warnings: string[];
}

export interface ProjectDrawingRenumberChange {
	rowId: string;
	oldDrawingNumber: string;
	newDrawingNumber: string;
	oldRelativePath: string | null;
	newRelativePath: string | null;
}

export interface ProjectDrawingRenumberPlan {
	id: string;
	projectId: string;
	createdAt: string;
	changes: ProjectDrawingRenumberChange[];
	warnings: string[];
}

export interface ProjectDrawingProgramChange {
	id: string;
	rowId: string | null;
	type: ProjectDrawingProgramChangeType;
	description: string;
	before: string;
	after: string;
	blocked: boolean;
}

export interface ProjectDrawingProgramFileAction {
	id: string;
	rowId: string;
	kind: ProjectDrawingProgramFileActionKind;
	fromRelativePath: string | null;
	toRelativePath: string | null;
	templatePath: string | null;
	blocked: boolean;
	reason: string | null;
}

export interface ProjectDrawingProgramPlan {
	id: string;
	projectId: string;
	mode: ProjectDrawingProgramPlanMode;
	updatedProgram: ProjectDrawingProgramRecord;
	renumberPlan: ProjectDrawingRenumberPlan | null;
	changes: ProjectDrawingProgramChange[];
	fileActions: ProjectDrawingProgramFileAction[];
	workbookRows: ProjectDrawingWorkbookMirrorRow[];
	warnings: string[];
	createdAt: string;
}

export interface ProjectDrawingWorkbookImportedRow {
	suiteRowId: string | null;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	status: ProjectDrawingProgramRowStatus;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBand: string;
	templateKey: string;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string;
	acadeSection: string;
	acadeGroup: string;
}

export interface ProjectDrawingWorkbookReconcilePreview {
	plan: ProjectDrawingProgramPlan;
	importedRows: ProjectDrawingWorkbookImportedRow[];
}

export interface ProjectDrawingStandardImportInput {
	projectId: string;
	fileName: string;
	arrayBuffer: ArrayBuffer;
}

export interface ProjectDrawingProgramInsertInput {
	projectId: string;
	program: ProjectDrawingProgramRecord;
	standardSnapshot: ProjectDrawingStandardSnapshot;
	standardRowId: string;
	projectNumber?: string | null;
	insertBeforeRowId?: string | null;
	count?: number;
}

export interface ProjectDrawingProgramDeactivateInput {
	projectId: string;
	program: ProjectDrawingProgramRecord;
	rowId: string;
}

const STANDARD_SETTING_KEY = "project_drawing_standard_snapshot_v1";
const PROGRAM_SETTING_KEY = "project_drawing_program_v1";
const RECEIPT_SETTING_KEY = "project_drawing_program_receipts_v1";
const LOCAL_STANDARD_PREFIX = "suite:project-drawing-standard";
const LOCAL_PROGRAM_PREFIX = "suite:project-drawing-program";
const LOCAL_RECEIPT_PREFIX = "suite:project-drawing-program-receipts";
const DEFAULT_WORKBOOK_RELATIVE_PATH = "Drawing Index.xlsx";
const STARTER_SHEET_NAMES = ["Starter Matrix", "Drawing Standard"];
const TEMPLATE_SHEET_NAMES = ["Template Map", "Templates"];
const BUILTIN_STANDARD_KEY = "r3p-electrical-v1";
const BUILTIN_STANDARD_ID = "builtin:r3p-electrical-v1";
const DEFAULT_SEQUENCE_DIGITS = 4;

interface BuiltinDrawingCatalogSeed {
	familyKey: string;
	typeCode: string;
	sheetFamily: string;
	defaultTitle: string;
	sequenceBandStart: number;
	sequenceBandEnd: number;
	templateKey: string;
	acadeSection: string | null;
	acadeGroup: string | null;
	bootstrapDefaultCount?: number;
}

const BUILTIN_R3P_ELECTRICAL_CATALOG: BuiltinDrawingCatalogSeed[] = [
	{
		familyKey: "cover-page",
		typeCode: "E0",
		sheetFamily: "Cover Page",
		defaultTitle: "Cover Page",
		sequenceBandStart: 0,
		sequenceBandEnd: 0,
		templateKey: "COVER_PAGE",
		acadeSection: null,
		acadeGroup: "ADMIN",
		bootstrapDefaultCount: 1,
	},
	{
		familyKey: "drawing-index",
		typeCode: "E0",
		sheetFamily: "Drawing Index",
		defaultTitle: "Drawing Index",
		sequenceBandStart: 1,
		sequenceBandEnd: 1,
		templateKey: "DRAWING_INDEX",
		acadeSection: null,
		acadeGroup: "ADMIN",
		bootstrapDefaultCount: 1,
	},
	{
		familyKey: "area-plans",
		typeCode: "E1",
		sheetFamily: "Area Plans",
		defaultTitle: "Area Plan",
		sequenceBandStart: 1,
		sequenceBandEnd: 100,
		templateKey: "AREA_PLAN",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "area-class",
		typeCode: "E1",
		sheetFamily: "Area Class",
		defaultTitle: "Area Classification Plan",
		sequenceBandStart: 101,
		sequenceBandEnd: 200,
		templateKey: "AREA_CLASS",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "cable-tray-routing",
		typeCode: "E1",
		sheetFamily: "Cable Tray Routing",
		defaultTitle: "Cable Tray Routing Plan",
		sequenceBandStart: 301,
		sequenceBandEnd: 400,
		templateKey: "CABLE_TRAY_ROUTING",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "power-control-routing",
		typeCode: "E1",
		sheetFamily: "Power and Control Routing",
		defaultTitle: "Power and Control Routing Plan",
		sequenceBandStart: 401,
		sequenceBandEnd: 500,
		templateKey: "POWER_CONTROL_ROUTING",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "instrumentation-plans",
		typeCode: "E1",
		sheetFamily: "Instrumentation Plans",
		defaultTitle: "Instrumentation Plan",
		sequenceBandStart: 501,
		sequenceBandEnd: 600,
		templateKey: "INSTRUMENTATION_PLAN",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "grounding-plans",
		typeCode: "E1",
		sheetFamily: "Grounding Plans",
		defaultTitle: "Grounding Plan",
		sequenceBandStart: 601,
		sequenceBandEnd: 700,
		templateKey: "GROUNDING_PLAN",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "foundation-plans",
		typeCode: "E1",
		sheetFamily: "Foundation Plans",
		defaultTitle: "Foundation Plan",
		sequenceBandStart: 701,
		sequenceBandEnd: 800,
		templateKey: "FOUNDATION_PLAN",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "support-plans",
		typeCode: "E1",
		sheetFamily: "Support Plans",
		defaultTitle: "Support Plan",
		sequenceBandStart: 801,
		sequenceBandEnd: 900,
		templateKey: "SUPPORT_PLAN",
		acadeSection: "SCHEMATIC",
		acadeGroup: "PLANS",
	},
	{
		familyKey: "electrical-installation",
		typeCode: "E2",
		sheetFamily: "Electrical Installation",
		defaultTitle: "Electrical Installation",
		sequenceBandStart: 101,
		sequenceBandEnd: 200,
		templateKey: "ELECTRICAL_INSTALLATION",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "cable-tray-installation",
		typeCode: "E2",
		sheetFamily: "Cable Tray Installation",
		defaultTitle: "Cable Tray Installation",
		sequenceBandStart: 201,
		sequenceBandEnd: 300,
		templateKey: "CABLE_TRAY_INSTALLATION",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "instrumentation-installation",
		typeCode: "E2",
		sheetFamily: "Instrumentation Installation",
		defaultTitle: "Instrumentation Installation",
		sequenceBandStart: 301,
		sequenceBandEnd: 400,
		templateKey: "INSTRUMENTATION_INSTALLATION",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "foundations",
		typeCode: "E2",
		sheetFamily: "Foundations",
		defaultTitle: "Foundations",
		sequenceBandStart: 401,
		sequenceBandEnd: 500,
		templateKey: "FOUNDATIONS",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "supports",
		typeCode: "E2",
		sheetFamily: "Supports",
		defaultTitle: "Supports",
		sequenceBandStart: 501,
		sequenceBandEnd: 600,
		templateKey: "SUPPORTS",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "grounding-installation",
		typeCode: "E2",
		sheetFamily: "Grounding",
		defaultTitle: "Grounding",
		sequenceBandStart: 801,
		sequenceBandEnd: 900,
		templateKey: "GROUNDING_INSTALLATION",
		acadeSection: "PANEL",
		acadeGroup: "INSTALLATION",
	},
	{
		familyKey: "single-line",
		typeCode: "E6",
		sheetFamily: "Single Line Diagram",
		defaultTitle: "Single Line Diagram",
		sequenceBandStart: 1,
		sequenceBandEnd: 100,
		templateKey: "SINGLE_LINE",
		acadeSection: "SCHEMATIC",
		acadeGroup: "DIAGRAMS",
		bootstrapDefaultCount: 1,
	},
	{
		familyKey: "three-line",
		typeCode: "E6",
		sheetFamily: "Three Line Diagram",
		defaultTitle: "Three Line Diagram",
		sequenceBandStart: 101,
		sequenceBandEnd: 200,
		templateKey: "THREE_LINE",
		acadeSection: "SCHEMATIC",
		acadeGroup: "DIAGRAMS",
	},
	{
		familyKey: "ac-schematics",
		typeCode: "E6",
		sheetFamily: "AC Schematics",
		defaultTitle: "AC Schematic",
		sequenceBandStart: 201,
		sequenceBandEnd: 300,
		templateKey: "AC_SCHEMATIC",
		acadeSection: "SCHEMATIC",
		acadeGroup: "DIAGRAMS",
	},
	{
		familyKey: "dc-schematics",
		typeCode: "E6",
		sheetFamily: "DC Schematics",
		defaultTitle: "DC Schematic",
		sequenceBandStart: 301,
		sequenceBandEnd: 400,
		templateKey: "DC_SCHEMATIC",
		acadeSection: "SCHEMATIC",
		acadeGroup: "DIAGRAMS",
	},
	{
		familyKey: "wiring-diagrams",
		typeCode: "E6",
		sheetFamily: "Wiring Diagrams",
		defaultTitle: "Wiring Diagram",
		sequenceBandStart: 401,
		sequenceBandEnd: 500,
		templateKey: "WIRING_DIAGRAM",
		acadeSection: "SCHEMATIC",
		acadeGroup: "DIAGRAMS",
	},
	{
		familyKey: "panel-schedules",
		typeCode: "E6",
		sheetFamily: "Panel Schedules",
		defaultTitle: "Panel Schedule",
		sequenceBandStart: 601,
		sequenceBandEnd: 700,
		templateKey: "PANEL_SCHEDULE",
		acadeSection: "PANEL",
		acadeGroup: "SCHEDULES",
	},
];

function createId(prefix?: string) {
	return localId(prefix);
}

function nowIso() {
	return new Date().toISOString();
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

function normalizeStatus(value: unknown): ProjectDrawingProgramRowStatus {
	switch (normalizeText(value).toLowerCase()) {
		case "active":
			return "active";
		case "on-hold":
		case "hold":
		case "paused":
			return "on-hold";
		case "inactive":
		case "removed":
		case "deactivated":
			return "inactive";
		default:
			return "planned";
	}
}

function normalizeProvisionState(value: unknown): ProjectDrawingProvisionState {
	switch (normalizeText(value).toLowerCase()) {
		case "provisioned":
			return "provisioned";
		case "blocked":
			return "blocked";
		case "inactive":
			return "inactive";
		default:
			return "planned";
	}
}

function normalizeWorkbookPath(value: unknown) {
	return normalizeText(value).replace(/\\/g, "/");
}

function normalizeNumberPrefix(value: unknown) {
	return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeCatalogKey(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function sanitizePathSegment(value: string) {
	const withoutControlCharacters = Array.from(value, (char) =>
		char.charCodeAt(0) < 32 ? " " : char,
	).join("");

	return withoutControlCharacters
		.replace(/[<>:"/\\|?*]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parsePositiveInt(value: unknown, fallback: number) {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDrawingNumber(
	numberPrefix: string,
	sequenceDigits: number,
	sequenceNumber: number,
) {
	return `${numberPrefix}${String(sequenceNumber).padStart(
		Math.max(1, sequenceDigits),
		"0",
	)}`;
}

function formatSequenceBand(
	start: number,
	end: number,
	digits = DEFAULT_SEQUENCE_DIGITS,
) {
	return `${String(Math.max(0, start)).padStart(Math.max(1, digits), "0")}-${String(
		Math.max(0, end),
	).padStart(Math.max(1, digits), "0")}`;
}

function buildDrawingNumberPrefix(projectNumber: string, typeCode: string) {
	return `R3P-${projectNumber}-${typeCode}-`;
}

function buildStructuredDrawingNumber(args: {
	projectNumber: string;
	typeCode: string;
	sequenceDigits: number;
	sequenceNumber: number;
}) {
	return formatDrawingNumber(
		buildDrawingNumberPrefix(args.projectNumber, args.typeCode),
		args.sequenceDigits,
		args.sequenceNumber,
	);
}

function parseDrawingNumberParts(drawingNumber: string) {
	const normalized = normalizeText(drawingNumber);
	const match = normalized.match(/^(.*?)(\d+)$/);
	if (!match) {
		return {
			numberPrefix: normalized,
			sequenceDigits: 3,
			sequenceNumber: 1,
		};
	}
	return {
		numberPrefix: match[1],
		sequenceDigits: Math.max(1, match[2].length),
		sequenceNumber: Math.max(1, Number.parseInt(match[2], 10) || 1),
	};
}

function parseStructuredDrawingNumber(drawingNumber: string) {
	const normalized = normalizeText(drawingNumber);
	const match = normalized.match(/^R3P-(.+)-(E\d)-(\d{1,})$/i);
	if (!match) {
		return null;
	}
	return {
		projectNumber: normalizeText(match[1]),
		typeCode: normalizeText(match[2]).toUpperCase(),
		sequenceDigits: Math.max(1, match[3].length),
		sequenceNumber: Math.max(0, Number.parseInt(match[3], 10) || 0),
	};
}

function normalizeProjectNumberToken(value: unknown) {
	const normalized = normalizeText(value).replace(/^R3P-/i, "");
	return normalized.replace(/\s+/g, "").replace(/[^A-Za-z0-9-]+/g, "");
}

function resolveProgramProjectNumberToken(args: {
	projectNumber?: string | null;
	rows?: ProjectDrawingProgramRow[];
}) {
	const explicit = normalizeProjectNumberToken(args.projectNumber);
	if (explicit) {
		return explicit;
	}
	for (const row of args.rows ?? []) {
		const parsed = parseStructuredDrawingNumber(row.drawingNumber);
		if (parsed?.projectNumber) {
			return parsed.projectNumber;
		}
	}
	return "";
}

function buildDefaultRelativePath(drawingNumber: string, title: string) {
	const sanitizedTitle = sanitizePathSegment(title);
	return sanitizedTitle
		? `${drawingNumber} - ${sanitizedTitle}.dwg`
		: `${drawingNumber}.dwg`;
}

function replaceDrawingNumberInRelativePath(
	relativePath: string | null,
	oldDrawingNumber: string,
	newDrawingNumber: string,
	title: string,
) {
	const normalized = normalizeWorkbookPath(relativePath);
	if (!normalized) {
		return buildDefaultRelativePath(newDrawingNumber, title);
	}
	const lastSlashIndex = normalized.lastIndexOf("/");
	const directory =
		lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex + 1) : "";
	const fileName =
		lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized;
	const replacedFileName = fileName.includes(oldDrawingNumber)
		? fileName.replace(oldDrawingNumber, newDrawingNumber)
		: buildDefaultRelativePath(newDrawingNumber, title);
	return `${directory}${replacedFileName}`;
}

function sortRows(rows: ProjectDrawingProgramRow[]) {
	return [...rows].sort((left, right) => {
		if (left.sortOrder !== right.sortOrder) {
			return left.sortOrder - right.sortOrder;
		}
		return left.drawingNumber.localeCompare(right.drawingNumber);
	});
}

function sortCatalogEntries(entries: ProjectDrawingStandardCatalogEntry[]) {
	return [...entries].sort((left, right) => {
		if (left.typeCode !== right.typeCode) {
			return left.typeCode.localeCompare(right.typeCode);
		}
		if (left.sequenceBandStart !== right.sequenceBandStart) {
			return left.sequenceBandStart - right.sequenceBandStart;
		}
		return left.sheetFamily.localeCompare(right.sheetFamily);
	});
}

function buildBuiltinStandardSnapshot(
	projectId: string,
): ProjectDrawingStandardSnapshot {
	const catalogEntries = sortCatalogEntries(
		BUILTIN_R3P_ELECTRICAL_CATALOG.map((entry, index) => ({
			id: `${BUILTIN_STANDARD_ID}:${entry.familyKey}`,
			snapshotId: BUILTIN_STANDARD_ID,
			rowNumber: index + 1,
			familyKey: entry.familyKey,
			typeCode: entry.typeCode,
			sheetFamily: entry.sheetFamily,
			defaultTitle: entry.defaultTitle,
			defaultCount: Math.max(1, entry.bootstrapDefaultCount || 1),
			sequenceBandStart: entry.sequenceBandStart,
			sequenceBandEnd: entry.sequenceBandEnd,
			sequenceDigits: DEFAULT_SEQUENCE_DIGITS,
			bootstrapDefaultCount: Math.max(0, entry.bootstrapDefaultCount || 0),
			templateKey: entry.templateKey,
			templatePath: null,
			discipline: "E",
			acadeSection: entry.acadeSection,
			acadeGroup: entry.acadeGroup,
			warnings: [],
		})),
	);
	return {
		id: BUILTIN_STANDARD_ID,
		projectId,
		source: "builtin",
		standardKey: BUILTIN_STANDARD_KEY,
		catalogVersion: "1",
		disciplineScope: "E",
		workbookFileName: "R3P Electrical v1",
		importedAt: nowIso(),
		catalogEntries,
		starterRows: catalogEntries,
		templateMappings: [],
		warnings: [],
	};
}

function getBootstrapCatalogEntries(snapshot: ProjectDrawingStandardSnapshot) {
	return sortCatalogEntries(snapshot.catalogEntries).filter(
		(entry) => entry.bootstrapDefaultCount > 0,
	);
}

function resolveCatalogEntryById(
	snapshot: ProjectDrawingStandardSnapshot,
	entryId: string,
) {
	return snapshot.catalogEntries.find((entry) => entry.id === entryId) ?? null;
}

function findCatalogEntriesByTypeAndSequence(
	typeCode: string,
	sequenceNumber: number,
	snapshot: ProjectDrawingStandardSnapshot,
) {
	return snapshot.catalogEntries.filter(
		(entry) =>
			entry.typeCode.toUpperCase() === typeCode.toUpperCase() &&
			sequenceNumber >= entry.sequenceBandStart &&
			sequenceNumber <= entry.sequenceBandEnd,
	);
}

function inferLegacyCatalogMetadata(args: {
	drawingNumber: string;
	sheetFamily: string;
	typeCode?: string;
	sequenceNumber?: number;
}) {
	const parsed = parseStructuredDrawingNumber(args.drawingNumber);
	const typeCode = normalizeText(args.typeCode) || parsed?.typeCode || "";
	const sequenceNumber =
		typeof args.sequenceNumber === "number" &&
		Number.isFinite(args.sequenceNumber)
			? args.sequenceNumber
			: (parsed?.sequenceNumber ?? 1);
	const builtInSnapshot = buildBuiltinStandardSnapshot("legacy");
	const matchingEntries = typeCode
		? findCatalogEntriesByTypeAndSequence(
				typeCode,
				sequenceNumber,
				builtInSnapshot,
			)
		: [];
	if (matchingEntries.length === 1) {
		return matchingEntries[0];
	}
	return {
		id: "",
		snapshotId: "",
		rowNumber: 0,
		familyKey: normalizeCatalogKey(args.sheetFamily || typeCode || "legacy"),
		typeCode,
		sheetFamily: normalizeText(args.sheetFamily) || typeCode || "Legacy",
		defaultTitle: normalizeText(args.sheetFamily) || typeCode || "Legacy",
		defaultCount: 1,
		sequenceBandStart: Math.max(0, sequenceNumber),
		sequenceBandEnd: Math.max(0, sequenceNumber),
		sequenceDigits: parsed?.sequenceDigits ?? DEFAULT_SEQUENCE_DIGITS,
		bootstrapDefaultCount: 0,
		templateKey: "",
		templatePath: null,
		discipline: "E",
		acadeSection: null,
		acadeGroup: null,
		warnings: [],
	} satisfies ProjectDrawingStandardCatalogEntry;
}

function sortReceipts(entries: ProjectDrawingProvisionReceipt[]) {
	return [...entries].sort((left, right) =>
		right.appliedAt.localeCompare(left.appliedAt),
	);
}

function buildLocalStorageKey(prefix: string, projectId: string) {
	return `${prefix}:${projectId}`;
}

function normalizeStringArray(value: unknown) {
	if (!Array.isArray(value)) {
		return [] as string[];
	}
	return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTemplateMapping(
	value: unknown,
): ProjectDrawingTemplateMapping | null {
	if (!isRecord(value)) {
		return null;
	}
	const templateKey = normalizeText(value.templateKey);
	if (!templateKey) {
		return null;
	}
	return {
		id: normalizeText(value.id) || createId("drawing-template"),
		templateKey,
		templatePath: normalizeNullableText(value.templatePath),
		discipline: normalizeText(value.discipline),
		acadeSection: normalizeNullableText(value.acadeSection),
		acadeGroup: normalizeNullableText(value.acadeGroup),
		warnings: normalizeStringArray(value.warnings),
	};
}

function normalizeStarterRow(
	value: unknown,
	snapshotId: string,
): ProjectDrawingStandardStarterRow | null {
	if (!isRecord(value)) {
		return null;
	}
	const sheetFamily = normalizeText(value.sheetFamily);
	const familyKey = normalizeCatalogKey(value.familyKey || sheetFamily);
	const typeCode = normalizeText(value.typeCode).toUpperCase();
	const templateKey = normalizeText(value.templateKey);
	const fallbackSequenceStart = Math.max(
		0,
		Number(
			value.sequenceBandStart ??
				value.sequenceStart ??
				parseDrawingNumberParts(normalizeText(value.numberPrefix))
					.sequenceNumber,
		),
	);
	const fallbackSequenceEnd = Math.max(
		fallbackSequenceStart,
		Number(
			value.sequenceBandEnd ??
				fallbackSequenceStart +
					Math.max(0, Number(value.defaultCount || 1) - 1),
		),
	);
	if (!sheetFamily || !familyKey || !typeCode || !templateKey) {
		return null;
	}
	return {
		id: normalizeText(value.id) || createId("drawing-standard-row"),
		snapshotId,
		rowNumber: Math.max(1, Number(value.rowNumber || 1)),
		familyKey,
		typeCode,
		sheetFamily,
		defaultTitle: normalizeText(value.defaultTitle) || sheetFamily,
		defaultCount: Math.max(1, Number(value.defaultCount || 1)),
		sequenceBandStart: fallbackSequenceStart,
		sequenceBandEnd: fallbackSequenceEnd,
		sequenceDigits: Math.max(
			1,
			Number(value.sequenceDigits || DEFAULT_SEQUENCE_DIGITS),
		),
		bootstrapDefaultCount: Math.max(
			0,
			Number(value.bootstrapDefaultCount ?? value.defaultCount ?? 0),
		),
		templateKey,
		templatePath: normalizeNullableText(value.templatePath),
		discipline: normalizeText(value.discipline),
		acadeSection: normalizeNullableText(value.acadeSection),
		acadeGroup: normalizeNullableText(value.acadeGroup),
		warnings: normalizeStringArray(value.warnings),
	};
}

function normalizeStandardSnapshot(
	value: unknown,
	projectId: string,
): ProjectDrawingStandardSnapshot | null {
	if (!isRecord(value)) {
		return null;
	}
	const id = normalizeText(value.id) || createId("drawing-standard");
	const normalizedProjectId =
		normalizeText(value.projectId) || normalizeText(projectId);
	if (!normalizedProjectId) {
		return null;
	}
	const importedAt = normalizeText(value.importedAt) || nowIso();
	const source =
		normalizeText(value.source) === "project-import"
			? "project-import"
			: "builtin";
	const catalogEntries = Array.isArray(value.catalogEntries)
		? value.catalogEntries
				.map((entry) => normalizeStarterRow(entry, id))
				.filter(
					(entry): entry is ProjectDrawingStandardCatalogEntry =>
						entry !== null,
				)
		: Array.isArray(value.starterRows)
			? value.starterRows
					.map((entry) => normalizeStarterRow(entry, id))
					.filter(
						(entry): entry is ProjectDrawingStandardCatalogEntry =>
							entry !== null,
					)
			: [];
	return {
		id,
		projectId: normalizedProjectId,
		source,
		standardKey:
			normalizeText(value.standardKey) ||
			(source === "builtin" ? BUILTIN_STANDARD_KEY : "project-import"),
		catalogVersion: normalizeText(value.catalogVersion) || "1",
		disciplineScope: normalizeText(value.disciplineScope) || "E",
		workbookFileName:
			normalizeText(value.workbookFileName) || "drawing-standard.xlsx",
		importedAt,
		catalogEntries: sortCatalogEntries(catalogEntries),
		starterRows: sortCatalogEntries(catalogEntries),
		templateMappings: Array.isArray(value.templateMappings)
			? value.templateMappings
					.map((entry) => normalizeTemplateMapping(entry))
					.filter(
						(entry): entry is ProjectDrawingTemplateMapping => entry !== null,
					)
			: [],
		warnings: normalizeStringArray(value.warnings),
	};
}

function normalizeProgramRow(
	value: unknown,
	projectId: string,
): ProjectDrawingProgramRow | null {
	if (!isRecord(value)) {
		return null;
	}
	const drawingNumber = normalizeText(value.drawingNumber);
	if (!drawingNumber) {
		return null;
	}
	const createdAt = normalizeText(value.createdAt) || nowIso();
	const updatedAt = normalizeText(value.updatedAt) || createdAt;
	const parts = parseDrawingNumberParts(drawingNumber);
	const structured = parseStructuredDrawingNumber(drawingNumber);
	const legacyCatalog = inferLegacyCatalogMetadata({
		drawingNumber,
		sheetFamily: normalizeText(value.sheetFamily),
		typeCode: normalizeText(value.typeCode),
		sequenceNumber: Number(
			value.sequenceNumber ||
				structured?.sequenceNumber ||
				parts.sequenceNumber,
		),
	});
	return {
		id: normalizeText(value.id) || createId("drawing-row"),
		projectId: normalizeText(value.projectId) || normalizeText(projectId),
		standardRowId: normalizeNullableText(value.standardRowId),
		sortOrder: Math.max(1, Number(value.sortOrder || 1)),
		drawingNumber,
		title: normalizeText(value.title) || drawingNumber,
		discipline: normalizeText(value.discipline),
		sheetFamily: normalizeText(value.sheetFamily),
		familyKey:
			normalizeCatalogKey(value.familyKey || legacyCatalog.familyKey) ||
			legacyCatalog.familyKey,
		typeCode:
			normalizeText(value.typeCode).toUpperCase() || legacyCatalog.typeCode,
		sequenceBandStart: Math.max(
			0,
			Number(value.sequenceBandStart || legacyCatalog.sequenceBandStart),
		),
		sequenceBandEnd: Math.max(
			Number(value.sequenceBandStart || legacyCatalog.sequenceBandStart || 0),
			Number(value.sequenceBandEnd || legacyCatalog.sequenceBandEnd),
		),
		catalogSource:
			normalizeText(value.catalogSource) === "project-import"
				? "project-import"
				: "builtin",
		templateKey: normalizeText(value.templateKey),
		templatePath: normalizeNullableText(value.templatePath),
		status: normalizeStatus(value.status),
		provisionState: normalizeProvisionState(value.provisionState),
		dwgRelativePath: normalizeNullableText(value.dwgRelativePath),
		acadeSection: normalizeNullableText(value.acadeSection),
		acadeGroup: normalizeNullableText(value.acadeGroup),
		workbookSyncedAt: normalizeNullableText(value.workbookSyncedAt),
		workbookDriftDetectedAt: normalizeNullableText(
			value.workbookDriftDetectedAt,
		),
		numberPrefix:
			normalizeNumberPrefix(value.numberPrefix) ||
			(structured?.projectNumber &&
			(normalizeText(value.typeCode) || legacyCatalog.typeCode)
				? buildDrawingNumberPrefix(
						structured.projectNumber,
						normalizeText(value.typeCode).toUpperCase() ||
							legacyCatalog.typeCode,
					)
				: parts.numberPrefix),
		sequenceDigits: Math.max(
			1,
			Number(
				value.sequenceDigits ||
					structured?.sequenceDigits ||
					parts.sequenceDigits,
			),
		),
		sequenceNumber: Math.max(
			0,
			Number(
				value.sequenceNumber ||
					structured?.sequenceNumber ||
					parts.sequenceNumber,
			),
		),
		createdAt,
		updatedAt,
	};
}

function normalizeWorkbookMirror(value: unknown): ProjectDrawingWorkbookMirror {
	if (!isRecord(value)) {
		return {
			workbookRelativePath: DEFAULT_WORKBOOK_RELATIVE_PATH,
			lastExportedAt: null,
			lastImportedAt: null,
			lastDriftEventAt: null,
		};
	}
	return {
		workbookRelativePath:
			normalizeWorkbookPath(value.workbookRelativePath) ||
			DEFAULT_WORKBOOK_RELATIVE_PATH,
		lastExportedAt: normalizeNullableText(value.lastExportedAt),
		lastImportedAt: normalizeNullableText(value.lastImportedAt),
		lastDriftEventAt: normalizeNullableText(value.lastDriftEventAt),
	};
}

function normalizeProgramRecord(
	value: unknown,
	projectId: string,
): ProjectDrawingProgramRecord | null {
	if (!isRecord(value)) {
		return null;
	}
	const normalizedProjectId =
		normalizeText(value.projectId) || normalizeText(projectId);
	if (!normalizedProjectId) {
		return null;
	}
	const createdAt = normalizeText(value.createdAt) || nowIso();
	const updatedAt = normalizeText(value.updatedAt) || createdAt;
	return {
		id: normalizeText(value.id) || createId("drawing-program"),
		projectId: normalizedProjectId,
		activeStandardKey:
			normalizeText(value.activeStandardKey) || BUILTIN_STANDARD_KEY,
		standardSnapshotId: normalizeNullableText(value.standardSnapshotId),
		workbookMirror: normalizeWorkbookMirror(value.workbookMirror),
		rows: Array.isArray(value.rows)
			? sortRows(
					value.rows
						.map((entry) => normalizeProgramRow(entry, normalizedProjectId))
						.filter(
							(entry): entry is ProjectDrawingProgramRow => entry !== null,
						),
				)
			: [],
		pendingTitleBlockSyncPaths: Array.isArray(value.pendingTitleBlockSyncPaths)
			? value.pendingTitleBlockSyncPaths
					.map((entry) => normalizeWorkbookPath(entry))
					.filter(Boolean)
			: [],
		pendingTitleBlockSyncAt: normalizeNullableText(
			value.pendingTitleBlockSyncAt,
		),
		lastAcadeSyncAt: normalizeNullableText(value.lastAcadeSyncAt),
		acadeSyncPending: Boolean(value.acadeSyncPending),
		lastProvisionReceiptId: normalizeNullableText(value.lastProvisionReceiptId),
		createdAt,
		updatedAt,
	};
}

function normalizeProvisionReceipt(
	value: unknown,
	projectId: string,
): ProjectDrawingProvisionReceipt | null {
	if (!isRecord(value)) {
		return null;
	}
	const normalizedProjectId =
		normalizeText(value.projectId) || normalizeText(projectId);
	if (!normalizedProjectId) {
		return null;
	}
	return {
		id: normalizeText(value.id) || createId("drawing-program-receipt"),
		projectId: normalizedProjectId,
		programId: normalizeText(value.programId),
		planId: normalizeText(value.planId),
		mode:
			normalizeText(value.mode) === "insert"
				? "insert"
				: normalizeText(value.mode) === "deactivate"
					? "deactivate"
					: normalizeText(value.mode) === "workbook-reconcile"
						? "workbook-reconcile"
						: normalizeText(value.mode) === "acade-sync"
							? "acade-sync"
							: "bootstrap",
		appliedAt: normalizeText(value.appliedAt) || nowIso(),
		createdFiles: normalizeStringArray(value.createdFiles),
		renamedFiles: Array.isArray(value.renamedFiles)
			? value.renamedFiles
					.filter((entry) => isRecord(entry))
					.map((entry) => ({
						fromRelativePath: normalizeText(entry.fromRelativePath),
						toRelativePath: normalizeText(entry.toRelativePath),
					}))
			: [],
		workbookPath: normalizeNullableText(value.workbookPath),
		wdpPath: normalizeNullableText(value.wdpPath),
		warnings: normalizeStringArray(value.warnings),
	};
}

function createEmptyProgram(projectId: string): ProjectDrawingProgramRecord {
	const timestamp = nowIso();
	return {
		id: createId("drawing-program"),
		projectId,
		activeStandardKey: BUILTIN_STANDARD_KEY,
		standardSnapshotId: null,
		workbookMirror: {
			workbookRelativePath: DEFAULT_WORKBOOK_RELATIVE_PATH,
			lastExportedAt: null,
			lastImportedAt: null,
			lastDriftEventAt: null,
		},
		rows: [],
		pendingTitleBlockSyncPaths: [],
		pendingTitleBlockSyncAt: null,
		lastAcadeSyncAt: null,
		acadeSyncPending: false,
		lastProvisionReceiptId: null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function readLocalStandard(projectId: string) {
	const storage = getLocalStorageApi();
	if (!storage) return null;
	try {
		const raw = storage.getItem(
			buildLocalStorageKey(LOCAL_STANDARD_PREFIX, projectId),
		);
		if (!raw) {
			return null;
		}
		return normalizeStandardSnapshot(JSON.parse(raw) as unknown, projectId);
	} catch (error) {
		logger.warn(
			"Unable to read local drawing standard snapshot.",
			"ProjectDrawingProgramService",
			error,
		);
		return null;
	}
}

function writeLocalStandard(
	projectId: string,
	snapshot: ProjectDrawingStandardSnapshot | null,
) {
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		const key = buildLocalStorageKey(LOCAL_STANDARD_PREFIX, projectId);
		if (!snapshot) {
			storage.removeItem(key);
			return;
		}
		storage.setItem(key, JSON.stringify(snapshot));
	} catch (error) {
		logger.warn(
			"Unable to persist local drawing standard snapshot.",
			"ProjectDrawingProgramService",
			error,
		);
	}
}

function readLocalProgram(projectId: string) {
	const storage = getLocalStorageApi();
	if (!storage) return createEmptyProgram(projectId);
	try {
		const raw = storage.getItem(
			buildLocalStorageKey(LOCAL_PROGRAM_PREFIX, projectId),
		);
		if (!raw) {
			return createEmptyProgram(projectId);
		}
		return (
			normalizeProgramRecord(JSON.parse(raw) as unknown, projectId) ??
			createEmptyProgram(projectId)
		);
	} catch (error) {
		logger.warn(
			"Unable to read local drawing program.",
			"ProjectDrawingProgramService",
			error,
		);
		return createEmptyProgram(projectId);
	}
}

function writeLocalProgram(
	projectId: string,
	program: ProjectDrawingProgramRecord,
) {
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		storage.setItem(
			buildLocalStorageKey(LOCAL_PROGRAM_PREFIX, projectId),
			JSON.stringify(program),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local drawing program.",
			"ProjectDrawingProgramService",
			error,
		);
	}
}

function readLocalReceipts(projectId: string) {
	const storage = getLocalStorageApi();
	if (!storage) return [] as ProjectDrawingProvisionReceipt[];
	try {
		const raw = storage.getItem(
			buildLocalStorageKey(LOCAL_RECEIPT_PREFIX, projectId),
		);
		if (!raw) {
			return [] as ProjectDrawingProvisionReceipt[];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [] as ProjectDrawingProvisionReceipt[];
		}
		return sortReceipts(
			parsed
				.map((entry) => normalizeProvisionReceipt(entry, projectId))
				.filter(
					(entry): entry is ProjectDrawingProvisionReceipt => entry !== null,
				),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local drawing program receipts.",
			"ProjectDrawingProgramService",
			error,
		);
		return [] as ProjectDrawingProvisionReceipt[];
	}
}

function writeLocalReceipts(
	projectId: string,
	receipts: ProjectDrawingProvisionReceipt[],
) {
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		storage.setItem(
			buildLocalStorageKey(LOCAL_RECEIPT_PREFIX, projectId),
			JSON.stringify(sortReceipts(receipts)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local drawing program receipts.",
			"ProjectDrawingProgramService",
			error,
		);
	}
}

async function persistStandard(
	projectId: string,
	snapshot: ProjectDrawingStandardSnapshot | null,
) {
	if (!snapshot) {
		const result = await deleteSetting(STANDARD_SETTING_KEY, projectId);
		writeLocalStandard(projectId, null);
		if (!result.success) {
			return new Error(
				result.error || "Unable to remove stored drawing standard snapshot.",
			);
		}
		return null;
	}
	const result = await saveSetting(STANDARD_SETTING_KEY, snapshot, projectId);
	writeLocalStandard(projectId, snapshot);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist drawing standard snapshot.",
		);
	}
	return null;
}

async function persistProgram(
	projectId: string,
	program: ProjectDrawingProgramRecord,
) {
	const result = await saveSetting(PROGRAM_SETTING_KEY, program, projectId);
	writeLocalProgram(projectId, program);
	if (!result.success) {
		return new Error(result.error || "Unable to persist drawing program.");
	}
	return null;
}

async function persistReceipts(
	projectId: string,
	receipts: ProjectDrawingProvisionReceipt[],
) {
	const sorted = sortReceipts(receipts);
	const result = await saveSetting(RECEIPT_SETTING_KEY, sorted, projectId);
	writeLocalReceipts(projectId, sorted);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist drawing program receipts.",
		);
	}
	return null;
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

async function parseStandardWorkbook(
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

function buildWorkbookMirrorRows(
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

async function parseWorkbookMirror(
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

function buildRenumberPlan(
	projectId: string,
	beforeRows: ProjectDrawingProgramRow[],
	afterRows: ProjectDrawingProgramRow[],
) {
	const changes: ProjectDrawingRenumberChange[] = [];
	const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
	for (const row of afterRows) {
		const current = beforeById.get(row.id);
		if (!current) {
			continue;
		}
		if (
			current.drawingNumber !== row.drawingNumber ||
			(current.dwgRelativePath || "") !== (row.dwgRelativePath || "")
		) {
			changes.push({
				rowId: row.id,
				oldDrawingNumber: current.drawingNumber,
				newDrawingNumber: row.drawingNumber,
				oldRelativePath: current.dwgRelativePath,
				newRelativePath: row.dwgRelativePath,
			});
		}
	}
	if (changes.length === 0) {
		return null;
	}
	return {
		id: createId("drawing-renumber"),
		projectId,
		createdAt: nowIso(),
		changes,
		warnings: [],
	} satisfies ProjectDrawingRenumberPlan;
}

function parseSequenceBand(value: string | null | undefined) {
	const normalized = normalizeText(value);
	const match = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
	if (!match) {
		return null;
	}
	return {
		start: Math.max(0, Number.parseInt(match[1], 10) || 0),
		end: Math.max(0, Number.parseInt(match[2], 10) || 0),
	};
}

function buildFamilyAllocationKey(row: ProjectDrawingProgramRow) {
	return [
		row.typeCode.toUpperCase(),
		normalizeCatalogKey(row.familyKey),
		row.sequenceBandStart,
		row.sequenceBandEnd,
		row.sequenceDigits,
	].join("::");
}

function applyFamilyBandAllocation(args: {
	rows: ProjectDrawingProgramRow[];
	projectNumber: string;
}) {
	const inactiveRows: ProjectDrawingProgramRow[] = [];
	const grouped = new Map<string, ProjectDrawingProgramRow[]>();
	for (const row of sortRows(args.rows)) {
		if (row.status === "inactive") {
			inactiveRows.push({ ...row });
			continue;
		}
		const key = buildFamilyAllocationKey(row);
		const current = grouped.get(key) ?? [];
		current.push({ ...row });
		grouped.set(key, current);
	}
	const nextRows: ProjectDrawingProgramRow[] = [];
	for (const entries of grouped.values()) {
		const ordered = sortRows(entries);
		const exemplar = ordered[0];
		const availableSlots =
			exemplar.sequenceBandEnd - exemplar.sequenceBandStart + 1;
		if (ordered.length > availableSlots) {
			throw new Error(
				`${exemplar.sheetFamily} exceeds the ${formatSequenceBand(
					exemplar.sequenceBandStart,
					exemplar.sequenceBandEnd,
					exemplar.sequenceDigits,
				)} band. Remove or move drawings before adding more.`,
			);
		}
		ordered.forEach((entry, index) => {
			const sequenceNumber = exemplar.sequenceBandStart + index;
			const drawingNumber = buildStructuredDrawingNumber({
				projectNumber: args.projectNumber,
				typeCode: entry.typeCode,
				sequenceDigits: entry.sequenceDigits,
				sequenceNumber,
			});
			nextRows.push({
				...entry,
				numberPrefix: buildDrawingNumberPrefix(
					args.projectNumber,
					entry.typeCode,
				),
				sequenceNumber,
				drawingNumber,
				dwgRelativePath: replaceDrawingNumberInRelativePath(
					entry.dwgRelativePath,
					entry.drawingNumber,
					drawingNumber,
					entry.title,
				),
				updatedAt: nowIso(),
			});
		});
	}
	return sortRows([...nextRows, ...inactiveRows]).map((row, index) => ({
		...row,
		sortOrder: (index + 1) * 10,
	}));
}

function buildPlanFromPrograms(args: {
	projectId: string;
	mode: ProjectDrawingProgramPlanMode;
	beforeProgram: ProjectDrawingProgramRecord;
	afterProgram: ProjectDrawingProgramRecord;
	extraWarnings?: string[];
}) {
	const { projectId, mode, beforeProgram, afterProgram } = args;
	const beforeRows = sortRows(beforeProgram.rows);
	const afterRows = sortRows(afterProgram.rows);
	const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
	const renumberPlan = buildRenumberPlan(projectId, beforeRows, afterRows);
	const changes: ProjectDrawingProgramChange[] = [];
	const fileActions: ProjectDrawingProgramFileAction[] = [];
	const warnings = [...(args.extraWarnings ?? [])];

	for (const row of afterRows) {
		const current = beforeById.get(row.id);
		if (!current) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "create",
				description: `Create ${row.drawingNumber} (${row.title}).`,
				before: "Not in program",
				after: `${row.drawingNumber} • ${row.title}`,
				blocked: false,
			});
			const blocked = !row.templatePath;
			if (blocked) {
				const reason = `Template path is missing for ${row.templateKey || row.sheetFamily}.`;
				warnings.push(reason);
				fileActions.push({
					id: createId("drawing-file-action"),
					rowId: row.id,
					kind: "skip-missing-template",
					fromRelativePath: null,
					toRelativePath: row.dwgRelativePath,
					templatePath: null,
					blocked: true,
					reason,
				});
			} else {
				fileActions.push({
					id: createId("drawing-file-action"),
					rowId: row.id,
					kind: "copy-template",
					fromRelativePath: null,
					toRelativePath: row.dwgRelativePath,
					templatePath: row.templatePath,
					blocked: false,
					reason: null,
				});
			}
			continue;
		}

		if (current.status !== row.status) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: row.status === "inactive" ? "deactivate" : "status-update",
				description:
					row.status === "inactive"
						? `Deactivate ${row.drawingNumber}.`
						: `Update status for ${row.drawingNumber}.`,
				before: current.status,
				after: row.status,
				blocked: false,
			});
		}
		if (current.title !== row.title) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "title-update",
				description: `Update title for ${row.drawingNumber}.`,
				before: current.title,
				after: row.title,
				blocked: false,
			});
		}
		if (current.sortOrder !== row.sortOrder) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "reorder",
				description: `Move ${row.drawingNumber} within the ACADE stack.`,
				before: String(current.sortOrder),
				after: String(row.sortOrder),
				blocked: false,
			});
		}
		if (current.drawingNumber !== row.drawingNumber) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "renumber",
				description: `Renumber ${current.drawingNumber} to ${row.drawingNumber}.`,
				before: current.drawingNumber,
				after: row.drawingNumber,
				blocked: false,
			});
		}
		if (
			current.provisionState === "provisioned" &&
			current.dwgRelativePath &&
			row.dwgRelativePath &&
			current.dwgRelativePath !== row.dwgRelativePath
		) {
			fileActions.push({
				id: createId("drawing-file-action"),
				rowId: row.id,
				kind: "rename-dwg",
				fromRelativePath: current.dwgRelativePath,
				toRelativePath: row.dwgRelativePath,
				templatePath: null,
				blocked: false,
				reason: null,
			});
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "rename-file",
				description: `Rename ${current.dwgRelativePath} to ${row.dwgRelativePath}.`,
				before: current.dwgRelativePath,
				after: row.dwgRelativePath,
				blocked: false,
			});
		}
	}

	return {
		id: createId("drawing-program-plan"),
		projectId,
		mode,
		updatedProgram: {
			...afterProgram,
			acadeSyncPending: true,
			pendingTitleBlockSyncPaths: afterProgram.pendingTitleBlockSyncPaths ?? [],
			pendingTitleBlockSyncAt: afterProgram.pendingTitleBlockSyncAt ?? null,
			updatedAt: nowIso(),
		},
		renumberPlan,
		changes,
		fileActions,
		workbookRows: buildWorkbookMirrorRows(afterProgram),
		warnings: Array.from(new Set(warnings.filter(Boolean))),
		createdAt: nowIso(),
	} satisfies ProjectDrawingProgramPlan;
}

function buildInsertedRows(args: {
	projectId: string;
	projectNumber: string;
	standardRow: ProjectDrawingStandardCatalogEntry;
	catalogSource: ProjectDrawingStandardSource;
	count: number;
	startSortOrder: number;
}) {
	const rows: ProjectDrawingProgramRow[] = [];
	const timestamp = nowIso();
	for (let index = 0; index < args.count; index += 1) {
		const sequenceNumber = args.standardRow.sequenceBandStart + index;
		const drawingNumber = buildStructuredDrawingNumber({
			projectNumber: args.projectNumber,
			typeCode: args.standardRow.typeCode,
			sequenceDigits: args.standardRow.sequenceDigits,
			sequenceNumber,
		});
		const title =
			args.count > 1 || args.standardRow.defaultCount > 1
				? `${args.standardRow.defaultTitle} ${String(index + 1).padStart(2, "0")}`
				: args.standardRow.defaultTitle;
		rows.push({
			id: createId("drawing-row"),
			projectId: args.projectId,
			standardRowId: args.standardRow.id,
			sortOrder: args.startSortOrder + index,
			drawingNumber,
			title,
			discipline: args.standardRow.discipline,
			sheetFamily: args.standardRow.sheetFamily,
			familyKey: args.standardRow.familyKey,
			typeCode: args.standardRow.typeCode,
			sequenceBandStart: args.standardRow.sequenceBandStart,
			sequenceBandEnd: args.standardRow.sequenceBandEnd,
			catalogSource: args.catalogSource,
			templateKey: args.standardRow.templateKey,
			templatePath: args.standardRow.templatePath,
			status: "planned",
			provisionState: args.standardRow.templatePath ? "planned" : "blocked",
			dwgRelativePath: buildDefaultRelativePath(drawingNumber, title),
			acadeSection: args.standardRow.acadeSection,
			acadeGroup: args.standardRow.acadeGroup,
			workbookSyncedAt: null,
			workbookDriftDetectedAt: null,
			numberPrefix: buildDrawingNumberPrefix(
				args.projectNumber,
				args.standardRow.typeCode,
			),
			sequenceDigits: args.standardRow.sequenceDigits,
			sequenceNumber,
			createdAt: timestamp,
			updatedAt: timestamp,
		});
	}
	return rows;
}

function normalizeProgramAfterMutation(
	beforeProgram: ProjectDrawingProgramRecord,
	rows: ProjectDrawingProgramRow[],
	standardSnapshotId?: string | null,
	activeStandardKey?: string | null,
) {
	return {
		...beforeProgram,
		activeStandardKey:
			normalizeText(activeStandardKey) || beforeProgram.activeStandardKey,
		standardSnapshotId: standardSnapshotId ?? beforeProgram.standardSnapshotId,
		rows: sortRows(rows).map((row, index) => ({
			...row,
			sortOrder: (index + 1) * 10,
			updatedAt: nowIso(),
		})),
		pendingTitleBlockSyncPaths: beforeProgram.pendingTitleBlockSyncPaths ?? [],
		pendingTitleBlockSyncAt: beforeProgram.pendingTitleBlockSyncAt ?? null,
		updatedAt: nowIso(),
	} satisfies ProjectDrawingProgramRecord;
}

export function detectWorkbookDrift(
	program: ProjectDrawingProgramRecord | null,
	events: WatchdogCollectorEvent[],
) {
	if (!program?.workbookMirror.workbookRelativePath) {
		return null;
	}
	const workbookRelativePath = program.workbookMirror.workbookRelativePath
		.replace(/\\/g, "/")
		.toLowerCase();
	const workbookFileName =
		workbookRelativePath.split("/").pop() || workbookRelativePath;
	const latestEvent = [...events]
		.filter((event) => {
			const path = normalizeText(event.path).replace(/\\/g, "/").toLowerCase();
			const drawingPath = normalizeText(event.drawingPath)
				.replace(/\\/g, "/")
				.toLowerCase();
			return (
				path.endsWith(workbookRelativePath) ||
				path.endsWith(workbookFileName) ||
				drawingPath.endsWith(workbookRelativePath)
			);
		})
		.sort((left, right) => right.timestamp - left.timestamp)[0];
	return latestEvent ?? null;
}

export const projectDrawingProgramService = {
	async fetchStandardSnapshot(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: null as ProjectDrawingStandardSnapshot | null,
				error: new Error("Project id is required."),
			};
		}
		const localFallback =
			readLocalStandard(normalizedProjectId) ??
			buildBuiltinStandardSnapshot(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				STANDARD_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			const normalized = normalizeStandardSnapshot(stored, normalizedProjectId);
			if (!normalized) {
				return {
					data: localFallback,
					error: new Error("Stored drawing standard snapshot is invalid."),
				};
			}
			writeLocalStandard(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load drawing standard snapshot."),
			};
		}
	},

	async importStandardWorkbook(input: ProjectDrawingStandardImportInput) {
		const normalizedProjectId = normalizeText(input.projectId);
		if (!normalizedProjectId) {
			return {
				data: null as ProjectDrawingStandardSnapshot | null,
				error: new Error("Project id is required."),
			};
		}
		try {
			const snapshot = await parseStandardWorkbook({
				...input,
				projectId: normalizedProjectId,
			});
			const persistError = await persistStandard(normalizedProjectId, snapshot);
			return {
				data: snapshot,
				error: persistError,
			};
		} catch (error) {
			return {
				data: null as ProjectDrawingStandardSnapshot | null,
				error:
					error instanceof Error
						? error
						: new Error("Unable to import drawing standard workbook."),
			};
		}
	},

	async fetchProgram(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: createEmptyProgram(""),
				error: new Error("Project id is required."),
			};
		}
		const localFallback = readLocalProgram(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				PROGRAM_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			const normalized = normalizeProgramRecord(stored, normalizedProjectId);
			if (!normalized) {
				return {
					data: localFallback,
					error: new Error("Stored drawing program is invalid."),
				};
			}
			writeLocalProgram(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load drawing program."),
			};
		}
	},

	async saveProgram(program: ProjectDrawingProgramRecord) {
		const normalizedProjectId = normalizeText(program.projectId);
		if (!normalizedProjectId) {
			return new Error("Project id is required.");
		}
		return persistProgram(normalizedProjectId, {
			...program,
			projectId: normalizedProjectId,
			rows: sortRows(program.rows),
			updatedAt: nowIso(),
		});
	},

	async fetchReceipts(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [] as ProjectDrawingProvisionReceipt[],
				error: new Error("Project id is required."),
			};
		}
		const localFallback = readLocalReceipts(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				RECEIPT_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			if (!Array.isArray(stored)) {
				return {
					data: localFallback,
					error: new Error("Stored drawing program receipts are invalid."),
				};
			}
			const normalized = sortReceipts(
				stored
					.map((entry) => normalizeProvisionReceipt(entry, normalizedProjectId))
					.filter(
						(entry): entry is ProjectDrawingProvisionReceipt => entry !== null,
					),
			);
			writeLocalReceipts(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load drawing program receipts."),
			};
		}
	},

	async appendReceipt(receipt: ProjectDrawingProvisionReceipt) {
		const normalizedProjectId = normalizeText(receipt.projectId);
		if (!normalizedProjectId) {
			return new Error("Project id is required.");
		}
		const current = readLocalReceipts(normalizedProjectId);
		return persistReceipts(normalizedProjectId, [receipt, ...current]);
	},

	buildWorkbookRows(program: ProjectDrawingProgramRecord) {
		return buildWorkbookMirrorRows(program);
	},

	async parseWorkbookMirror(file: File) {
		return parseWorkbookMirror(await file.arrayBuffer());
	},

	buildBootstrapPlan(args: {
		projectId: string;
		program: ProjectDrawingProgramRecord;
		standardSnapshot: ProjectDrawingStandardSnapshot;
		projectNumber?: string | null;
	}) {
		if (args.program.rows.some((row) => row.status !== "inactive")) {
			throw new Error(
				"Drawing program already has rows. Clear or reconcile it before bootstrapping from the standard.",
			);
		}
		const projectNumber = resolveProgramProjectNumberToken({
			projectNumber: args.projectNumber,
			rows: args.program.rows,
		});
		if (!projectNumber) {
			throw new Error(
				"Set the project number in the title block defaults before bootstrapping the electrical drawing program.",
			);
		}
		const bootstrapEntries = getBootstrapCatalogEntries(args.standardSnapshot);
		const rows = bootstrapEntries.flatMap((standardRow, index) =>
			buildInsertedRows({
				projectId: args.projectId,
				projectNumber,
				standardRow,
				catalogSource: args.standardSnapshot.source,
				count: standardRow.bootstrapDefaultCount || 1,
				startSortOrder: (index + 1) * 100,
			}),
		);
		const resequenced = applyFamilyBandAllocation({
			rows,
			projectNumber,
		});
		const afterProgram = normalizeProgramAfterMutation(
			args.program,
			resequenced,
			args.standardSnapshot.source === "project-import"
				? args.standardSnapshot.id
				: null,
			args.standardSnapshot.standardKey,
		);
		return buildPlanFromPrograms({
			projectId: args.projectId,
			mode: "bootstrap",
			beforeProgram: args.program,
			afterProgram,
			extraWarnings: args.standardSnapshot.warnings,
		});
	},

	buildInsertPlan(input: ProjectDrawingProgramInsertInput) {
		const standardRow = resolveCatalogEntryById(
			input.standardSnapshot,
			input.standardRowId,
		);
		if (!standardRow) {
			throw new Error(
				"Select an electrical family from the active drawing standard.",
			);
		}
		const projectNumber = resolveProgramProjectNumberToken({
			projectNumber: input.projectNumber,
			rows: input.program.rows,
		});
		if (!projectNumber) {
			throw new Error(
				"Set the project number in the title block defaults before inserting electrical drawings.",
			);
		}
		const count = Math.max(1, Math.min(20, Number(input.count || 1)));
		const currentRows = sortRows(input.program.rows);
		const locatedIndex = input.insertBeforeRowId
			? currentRows.findIndex((row) => row.id === input.insertBeforeRowId)
			: -1;
		const insertIndex = locatedIndex >= 0 ? locatedIndex : currentRows.length;
		const nextRows = [...currentRows];
		nextRows.splice(
			insertIndex < 0 ? currentRows.length : insertIndex,
			0,
			...buildInsertedRows({
				projectId: input.projectId,
				projectNumber,
				standardRow,
				catalogSource: input.standardSnapshot.source,
				count,
				startSortOrder: (insertIndex + 1) * 10,
			}),
		);
		const resequenced = applyFamilyBandAllocation({
			rows: nextRows,
			projectNumber,
		});
		const afterProgram = normalizeProgramAfterMutation(
			input.program,
			resequenced,
			input.standardSnapshot.source === "project-import"
				? input.standardSnapshot.id
				: null,
			input.standardSnapshot.standardKey,
		);
		return buildPlanFromPrograms({
			projectId: input.projectId,
			mode: "insert",
			beforeProgram: input.program,
			afterProgram,
			extraWarnings: standardRow.warnings,
		});
	},

	buildDeactivatePlan(input: ProjectDrawingProgramDeactivateInput) {
		const currentRow = input.program.rows.find((row) => row.id === input.rowId);
		if (!currentRow) {
			throw new Error("Select a drawing row to deactivate.");
		}
		const projectNumber = resolveProgramProjectNumberToken({
			rows: input.program.rows,
		});
		const nextRows = sortRows(input.program.rows).map((row) =>
			row.id === input.rowId
				? {
						...row,
						status: "inactive" as const,
						provisionState: "inactive" as const,
						updatedAt: nowIso(),
					}
				: row,
		);
		const allocatedRows = projectNumber
			? applyFamilyBandAllocation({
					rows: nextRows,
					projectNumber,
				})
			: nextRows;
		const afterProgram = normalizeProgramAfterMutation(
			input.program,
			allocatedRows,
		);
		return buildPlanFromPrograms({
			projectId: input.projectId,
			mode: "deactivate",
			beforeProgram: input.program,
			afterProgram,
		});
	},

	async buildWorkbookReconcilePreview(args: {
		projectId: string;
		program: ProjectDrawingProgramRecord;
		standardSnapshot?: ProjectDrawingStandardSnapshot | null;
		file: File;
	}) {
		const importedRows = await parseWorkbookMirror(
			await args.file.arrayBuffer(),
		);
		const beforeRows = sortRows(args.program.rows);
		const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
		const nextRows: ProjectDrawingProgramRow[] = [];
		const warnings: string[] = [];
		const activeSnapshot =
			args.standardSnapshot ?? buildBuiltinStandardSnapshot(args.projectId);
		const projectNumber = resolveProgramProjectNumberToken({
			rows: args.program.rows,
		});

		for (const importedRow of importedRows) {
			const existing =
				(importedRow.suiteRowId
					? beforeById.get(importedRow.suiteRowId)
					: undefined) ?? null;
			if (existing) {
				const structured = parseStructuredDrawingNumber(
					importedRow.drawingNumber,
				);
				const importedBand = parseSequenceBand(importedRow.sequenceBand);
				const effectiveTypeCode =
					normalizeText(importedRow.typeCode).toUpperCase() ||
					existing.typeCode;
				const effectiveSequenceNumber =
					structured?.sequenceNumber ?? existing.sequenceNumber;
				const matchingCatalogEntries = findCatalogEntriesByTypeAndSequence(
					effectiveTypeCode,
					effectiveSequenceNumber,
					activeSnapshot,
				);
				const matchingCatalog =
					matchingCatalogEntries.find(
						(entry) =>
							normalizeCatalogKey(entry.familyKey) ===
							normalizeCatalogKey(importedRow.familyKey || existing.familyKey),
					) ??
					matchingCatalogEntries[0] ??
					null;
				if (
					structured &&
					matchingCatalog &&
					(structured.sequenceNumber < matchingCatalog.sequenceBandStart ||
						structured.sequenceNumber > matchingCatalog.sequenceBandEnd)
				) {
					warnings.push(
						`Workbook row '${existing.drawingNumber}' tried to move outside the ${formatSequenceBand(
							matchingCatalog.sequenceBandStart,
							matchingCatalog.sequenceBandEnd,
						)} band for ${matchingCatalog.sheetFamily}. The drawing number was kept in-band.`,
					);
				}
				nextRows.push({
					...existing,
					sortOrder: importedRow.sortOrder,
					drawingNumber:
						structured &&
						matchingCatalog &&
						structured.sequenceNumber >= matchingCatalog.sequenceBandStart &&
						structured.sequenceNumber <= matchingCatalog.sequenceBandEnd
							? importedRow.drawingNumber
							: existing.drawingNumber,
					title: importedRow.title || existing.title,
					status: importedRow.status,
					discipline: importedRow.discipline || existing.discipline,
					sheetFamily: importedRow.sheetFamily || existing.sheetFamily,
					familyKey: importedRow.familyKey || existing.familyKey,
					typeCode: effectiveTypeCode,
					sequenceBandStart:
						importedBand?.start ??
						matchingCatalog?.sequenceBandStart ??
						existing.sequenceBandStart,
					sequenceBandEnd:
						importedBand?.end ??
						matchingCatalog?.sequenceBandEnd ??
						existing.sequenceBandEnd,
					catalogSource: existing.catalogSource,
					templateKey: importedRow.templateKey || existing.templateKey,
					provisionState: importedRow.provisionState || existing.provisionState,
					dwgRelativePath:
						normalizeNullableText(importedRow.dwgRelativePath) ||
						existing.dwgRelativePath,
					acadeSection:
						normalizeNullableText(importedRow.acadeSection) ??
						existing.acadeSection,
					acadeGroup:
						normalizeNullableText(importedRow.acadeGroup) ??
						existing.acadeGroup,
					numberPrefix: structured?.projectNumber
						? buildDrawingNumberPrefix(
								structured.projectNumber,
								effectiveTypeCode,
							)
						: existing.numberPrefix,
					sequenceDigits: structured?.sequenceDigits || existing.sequenceDigits,
					sequenceNumber: effectiveSequenceNumber,
					workbookDriftDetectedAt: null,
					updatedAt: nowIso(),
				});
				beforeById.delete(existing.id);
				continue;
			}

			if (!importedRow.templateKey) {
				warnings.push(
					`Workbook row '${importedRow.drawingNumber || importedRow.title}' is missing Template Key and cannot be adopted.`,
				);
				continue;
			}
			const structured = parseStructuredDrawingNumber(
				importedRow.drawingNumber,
			);
			const importedBand = parseSequenceBand(importedRow.sequenceBand);
			const effectiveTypeCode =
				normalizeText(importedRow.typeCode).toUpperCase() ||
				structured?.typeCode ||
				"";
			const matchingCatalogEntries =
				structured && effectiveTypeCode
					? findCatalogEntriesByTypeAndSequence(
							effectiveTypeCode,
							structured.sequenceNumber,
							activeSnapshot,
						)
					: [];
			const matchingCatalog =
				matchingCatalogEntries.find(
					(entry) =>
						normalizeCatalogKey(entry.familyKey) ===
						normalizeCatalogKey(importedRow.familyKey),
				) ??
				matchingCatalogEntries[0] ??
				null;
			if (!structured || !matchingCatalog || !projectNumber) {
				warnings.push(
					`Workbook row '${importedRow.drawingNumber || importedRow.title}' could not be matched to an electrical family band and was not adopted.`,
				);
				continue;
			}
			nextRows.push({
				id: createId("drawing-row"),
				projectId: args.projectId,
				standardRowId: null,
				sortOrder: importedRow.sortOrder,
				drawingNumber: importedRow.drawingNumber,
				title: importedRow.title || importedRow.drawingNumber,
				discipline: importedRow.discipline,
				sheetFamily: importedRow.sheetFamily,
				familyKey: matchingCatalog.familyKey,
				typeCode: matchingCatalog.typeCode,
				sequenceBandStart:
					importedBand?.start ?? matchingCatalog.sequenceBandStart,
				sequenceBandEnd: importedBand?.end ?? matchingCatalog.sequenceBandEnd,
				catalogSource: activeSnapshot.source,
				templateKey: importedRow.templateKey,
				templatePath: null,
				status: importedRow.status,
				provisionState: importedRow.provisionState,
				dwgRelativePath:
					normalizeNullableText(importedRow.dwgRelativePath) ||
					buildDefaultRelativePath(
						importedRow.drawingNumber,
						importedRow.title || importedRow.drawingNumber,
					),
				acadeSection: normalizeNullableText(importedRow.acadeSection),
				acadeGroup: normalizeNullableText(importedRow.acadeGroup),
				workbookSyncedAt: null,
				workbookDriftDetectedAt: null,
				numberPrefix: buildDrawingNumberPrefix(
					projectNumber,
					matchingCatalog.typeCode,
				),
				sequenceDigits: structured.sequenceDigits,
				sequenceNumber: structured.sequenceNumber,
				createdAt: nowIso(),
				updatedAt: nowIso(),
			});
		}

		for (const leftover of beforeById.values()) {
			nextRows.push({
				...leftover,
				status: "inactive",
				provisionState: "inactive",
				updatedAt: nowIso(),
			});
		}

		const allocatedRows = projectNumber
			? applyFamilyBandAllocation({
					rows: nextRows,
					projectNumber,
				})
			: nextRows;
		const afterProgram = normalizeProgramAfterMutation(
			args.program,
			allocatedRows,
			activeSnapshot.source === "project-import" ? activeSnapshot.id : null,
			activeSnapshot.standardKey,
		);
		const plan = buildPlanFromPrograms({
			projectId: args.projectId,
			mode: "workbook-reconcile",
			beforeProgram: args.program,
			afterProgram,
			extraWarnings: warnings,
		});
		return {
			plan,
			importedRows,
		} satisfies ProjectDrawingWorkbookReconcilePreview;
	},

	createSyncPlan(args: {
		projectId: string;
		program: ProjectDrawingProgramRecord;
	}) {
		const nextProgram = {
			...args.program,
			acadeSyncPending: true,
			updatedAt: nowIso(),
		};
		return buildPlanFromPrograms({
			projectId: args.projectId,
			mode: "acade-sync",
			beforeProgram: args.program,
			afterProgram: nextProgram,
		});
	},
};
