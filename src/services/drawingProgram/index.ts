import { getLocalStorageApi } from "@/lib/browserStorage";
import { logger } from "@/lib/logger";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
import {
	applyFamilyBandAllocation,
	buildPlanFromPrograms,
	parseSequenceBand,
} from "./reconciliation";
import type {
	ProjectDrawingProgramDeactivateInput,
	ProjectDrawingProgramInsertInput,
	ProjectDrawingProgramRecord,
	ProjectDrawingProgramRow,
	ProjectDrawingProvisionReceipt,
	ProjectDrawingStandardCatalogEntry,
	ProjectDrawingStandardImportInput,
	ProjectDrawingStandardSnapshot,
	ProjectDrawingStandardSource,
	ProjectDrawingTemplateMapping,
	ProjectDrawingWorkbookMirror,
	ProjectDrawingWorkbookMirrorRow,
	ProjectDrawingWorkbookReconcilePreview,
} from "./types";
import {
	buildDefaultRelativePath,
	buildDrawingNumberPrefix,
	buildStructuredDrawingNumber,
	createId,
	findCatalogEntriesByTypeAndSequence,
	formatSequenceBand,
	isRecord,
	normalizeCatalogKey,
	normalizeNullableText,
	normalizeNumberPrefix,
	normalizeProvisionState,
	normalizeStatus,
	normalizeStringArray,
	normalizeText,
	normalizeWorkbookPath,
	nowIso,
	parseDrawingNumberParts,
	parseStructuredDrawingNumber,
	resolveProgramProjectNumberToken,
	sortCatalogEntries,
	sortReceipts,
	sortRows,
	validateStandardSource,
	normalizeTemplateMapping,
	normalizeStarterRow,
	DEFAULT_SEQUENCE_DIGITS,
} from "./validation";
import {
	buildWorkbookMirrorRows,
	parseStandardWorkbook,
	parseWorkbookMirror,
} from "./workbookParser";

// Re-export everything for barrel access
export * from "./types";
export {
	detectWorkbookDrift,
	applyFamilyBandAllocation,
	buildPlanFromPrograms,
	parseSequenceBand,
} from "./reconciliation";
export {
	buildWorkbookMirrorRows,
	parseStandardWorkbook,
	parseWorkbookMirror,
} from "./workbookParser";
export * from "./validation";

const STANDARD_SETTING_KEY = "project_drawing_standard_snapshot_v1";
const PROGRAM_SETTING_KEY = "project_drawing_program_v1";
const RECEIPT_SETTING_KEY = "project_drawing_program_receipts_v1";
const LOCAL_STANDARD_PREFIX = "suite:project-drawing-standard";
const LOCAL_PROGRAM_PREFIX = "suite:project-drawing-program";
const LOCAL_RECEIPT_PREFIX = "suite:project-drawing-program-receipts";
const DEFAULT_WORKBOOK_RELATIVE_PATH = "Drawing Index.xlsx";
const BUILTIN_STANDARD_KEY = "r3p-electrical-v1";
const BUILTIN_STANDARD_ID = "builtin:r3p-electrical-v1";

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

function buildLocalStorageKey(prefix: string, projectId: string) {
	return `${prefix}:${projectId}`;
}

function normalizeWorkbookMirror(
	value: unknown,
): ProjectDrawingWorkbookMirror {
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
	const source = validateStandardSource(value.source);
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
						(entry): entry is ProjectDrawingTemplateMapping =>
							entry !== null,
					)
			: [],
		warnings: normalizeStringArray(value.warnings),
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
					.map((entry) =>
						normalizeProvisionReceipt(entry, normalizedProjectId),
					)
					.filter(
						(entry): entry is ProjectDrawingProvisionReceipt =>
							entry !== null,
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

	buildWorkbookRows(program: ProjectDrawingProgramRecord): ProjectDrawingWorkbookMirrorRow[] {
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
		const currentRow = input.program.rows.find(
			(row) => row.id === input.rowId,
		);
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
	}): Promise<ProjectDrawingWorkbookReconcilePreview> {
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
