import type { CellValue, Worksheet } from "exceljs";
import type { ProjectFile } from "@/features/project-core";
import { logger } from "@/lib/logger";
import { deleteSetting, loadSetting, saveSetting } from "@/settings/userSettings";
import { supabase } from "@/supabase/client";
import type { ProjectDocumentMetadataRow } from "@/features/project-documents";
import {
	createProjectScopedFetchCache,
	getCurrentSupabaseUserId,
	getLocalStorageApi,
} from "@/services/projectWorkflowClientSupport";

export type ProjectDeliverableReadinessState =
	| "package-ready"
	| "planning"
	| "blocked";

export type ProjectDeliverablePairingStatus =
	| "paired"
	| "missing"
	| "multiple"
	| "manual";

export type ProjectDeliverableVerificationState =
	| "matched"
	| "mismatch"
	| "partial"
	| "unavailable";

export interface ProjectDeliverableRevisionSnapshot {
	revision: string;
	date: string | null;
	order: number;
}

export interface ProjectDeliverablePairingMatch {
	id: string;
	fileId: string | null;
	fileName: string;
	filePath: string;
	relativePath: string;
	matchKind: "project-file" | "metadata-row";
	manual: boolean;
	title: string | null;
	revision: string | null;
}

export interface ProjectDeliverableRegisterRow {
	id: string;
	snapshotId: string;
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
	pdfPairingStatus: ProjectDeliverablePairingStatus;
	pdfMatches: ProjectDeliverablePairingMatch[];
	manualPdfMatchId: string | null;
	dwgPairingStatus: ProjectDeliverablePairingStatus;
	dwgMatches: ProjectDeliverablePairingMatch[];
	manualDwgMatchId: string | null;
	titleBlockVerificationState: ProjectDeliverableVerificationState;
	titleBlockVerificationDetail: string | null;
	acadeVerificationState: ProjectDeliverableVerificationState;
	acadeVerificationDetail: string | null;
	issueSetEligible: boolean;
}

export interface ProjectDeliverableRegisterSnapshot {
	id: string;
	projectId: string;
	workbookFileName: string;
	importedAt: string;
	dwgRootPath: string | null;
	pdfSourceSummary: string | null;
	sheetNames: string[];
	rowCount: number;
	rows: ProjectDeliverableRegisterRow[];
}

export interface ProjectDeliverableRegisterImportInput {
	projectId: string;
	fileName: string;
	arrayBuffer: ArrayBuffer;
	projectFiles?: ProjectFile[];
	metadataRows?: ProjectDocumentMetadataRow[];
	dwgRootPath?: string | null;
	previousSnapshot?: ProjectDeliverableRegisterSnapshot | null;
}

interface ParsedDeliverableRegisterRow {
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

const DELIVERABLE_REGISTER_SETTING_KEY = "project_deliverable_register_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-deliverable-register";
const DRAWING_NUMBER_PATTERN = /\b[A-Z0-9]+(?:[-_][A-Z0-9]+){2,}\b/i;
const deliverableRegisterFetchCache = createProjectScopedFetchCache<{
	data: ProjectDeliverableRegisterSnapshot | null;
	error: Error | null;
}>();

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `deliverable-register-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}`;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeDrawingKey(value: unknown) {
	return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeFileStem(value: string) {
	return value
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function readLocalSnapshot(
	projectId: string,
): ProjectDeliverableRegisterSnapshot | null {
	const storage = getLocalStorageApi();
	if (!storage) {
		return null;
	}
	try {
		const raw = storage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return null;
		}
		return normalizeSnapshot(JSON.parse(raw));
	} catch (error) {
		logger.warn(
			"Unable to read local deliverable register snapshot.",
			"ProjectDeliverableRegisterService",
			error,
		);
		return null;
	}
}

function writeLocalSnapshot(snapshot: ProjectDeliverableRegisterSnapshot) {
	const storage = getLocalStorageApi();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(
			buildLocalStorageKey(snapshot.projectId),
			JSON.stringify(snapshot),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local deliverable register snapshot.",
			"ProjectDeliverableRegisterService",
			error,
		);
	}
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
			return value.richText.map((entry) => normalizeText(entry.text)).join("").trim();
		}
	}
	return "";
}

function normalizeCellDate(value: CellValue | undefined): string | null {
	if (value == null) {
		return null;
	}
	const resolved =
		typeof value === "object" && value && "result" in value
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

function normalizeHeader(value: string) {
	return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function findHeaderIndex(headers: string[], label: string): number {
	return headers.findIndex((header) => normalizeHeader(header) === label);
}

function inferReadinessState(status: string | null, notes: string | null) {
	const normalizedStatus = normalizeHeader(status ?? "");
	const normalizedNotes = normalizeHeader(notes ?? "");
	if (
		normalizedStatus === "NOT CREATED YET" ||
		normalizedNotes.includes("NOT CREATED YET")
	) {
		return "blocked" as ProjectDeliverableReadinessState;
	}
	if (normalizedStatus === "READY FOR SUBMITTAL") {
		return "package-ready" as ProjectDeliverableReadinessState;
	}
	return "planning" as ProjectDeliverableReadinessState;
}

function isDrawingNumberCandidate(value: string) {
	const normalized = normalizeText(value);
	return Boolean(normalized && DRAWING_NUMBER_PATTERN.test(normalized));
}

function createRowId(sheetName: string, setName: string | null, drawingNumber: string) {
	return [sheetName, setName || "default", drawingNumber]
		.map((entry) => normalizeDrawingKey(entry))
		.filter(Boolean)
		.join("::");
}

function parseRevisionPairs(
	worksheet: Worksheet,
	headers: string[],
	rowNumber: number,
	descriptionIndex: number,
) {
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

function findHeaderRow(worksheet: Worksheet) {
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

function buildPdfMatch(
	file: ProjectFile,
	manual: boolean,
): ProjectDeliverablePairingMatch {
	return {
		id: file.id,
		fileId: file.id,
		fileName: file.name,
		filePath: file.file_path,
		relativePath: file.name,
		matchKind: "project-file",
		manual,
		title: null,
		revision: null,
	};
}

function buildDwgMatch(
	row: ProjectDocumentMetadataRow,
	manual: boolean,
): ProjectDeliverablePairingMatch {
	return {
		id: row.id,
		fileId: null,
		fileName: row.fileName,
		filePath: row.absolutePath,
		relativePath: row.relativePath,
		matchKind: "metadata-row",
		manual,
		title: row.title || null,
		revision: row.revision || null,
	};
}

function resolvePairingStatus(
	matches: ProjectDeliverablePairingMatch[],
	manualMatchId: string | null,
): {
	status: ProjectDeliverablePairingStatus;
	matches: ProjectDeliverablePairingMatch[];
} {
	if (manualMatchId) {
		const manualMatch = matches.find((match) => match.id === manualMatchId);
		if (manualMatch) {
			return {
				status: "manual",
				matches: [{ ...manualMatch, manual: true }],
			};
		}
	}
	if (matches.length === 0) {
		return { status: "missing", matches: [] };
	}
	if (matches.length === 1) {
		return { status: "paired", matches };
	}
	return { status: "multiple", matches };
}

function buildVerificationState(args: {
	registerRow: ParsedDeliverableRegisterRow;
	dwgMatches: ProjectDeliverablePairingMatch[];
	metadataRowsById: Map<string, ProjectDocumentMetadataRow>;
}) {
	const { registerRow, dwgMatches, metadataRowsById } = args;
	if (dwgMatches.length !== 1) {
		return {
			titleBlockVerificationState:
				dwgMatches.length > 1 ? ("partial" as const) : ("unavailable" as const),
			titleBlockVerificationDetail:
				dwgMatches.length > 1
					? "Multiple DWG candidates matched this deliverable row."
					: "No DWG/title block row matched this deliverable row yet.",
			acadeVerificationState:
				dwgMatches.length > 1 ? ("partial" as const) : ("unavailable" as const),
			acadeVerificationDetail:
				dwgMatches.length > 1
					? "Multiple DWG candidates matched this deliverable row."
					: "ACADE verification is unavailable without a single DWG match.",
		};
	}

	const matchedMetadata = metadataRowsById.get(dwgMatches[0].id);
	if (!matchedMetadata) {
		return {
			titleBlockVerificationState: "unavailable" as const,
			titleBlockVerificationDetail: "DWG metadata row is unavailable.",
			acadeVerificationState: "unavailable" as const,
			acadeVerificationDetail: "ACADE verification is unavailable.",
		};
	}

	const normalizedRegisterTitle = normalizeHeader(registerRow.drawingDescription);
	const normalizedMetadataTitle = normalizeHeader(matchedMetadata.title);
	const normalizedRegisterRevision = normalizeHeader(registerRow.currentRevision);
	const normalizedMetadataRevision = normalizeHeader(matchedMetadata.revision);
	const titleMismatch =
		Boolean(normalizedRegisterTitle) &&
		Boolean(normalizedMetadataTitle) &&
		normalizedRegisterTitle !== normalizedMetadataTitle;
	const revisionMismatch =
		Boolean(normalizedRegisterRevision) &&
		Boolean(normalizedMetadataRevision) &&
		normalizedRegisterRevision !== normalizedMetadataRevision;
	const mismatchDetails: string[] = [];
	if (titleMismatch) {
		mismatchDetails.push("Workbook title does not match title block metadata.");
	}
	if (revisionMismatch) {
		mismatchDetails.push(
			"Workbook revision does not match title block/metadata revision.",
		);
	}
	const titleBlockVerificationState: ProjectDeliverableVerificationState =
		mismatchDetails.length > 0
			? "mismatch"
			: matchedMetadata.reviewState === "fallback"
				? "partial"
				: "matched";
	const titleBlockVerificationDetail =
		mismatchDetails.length > 0
			? mismatchDetails.join(" ")
			: matchedMetadata.reviewState === "fallback"
				? "Live title block metadata is unavailable; Suite is using filename fallback."
				: "Workbook row matches DWG title block metadata.";

	const acadeDrawing = normalizeHeader(matchedMetadata.acadeValues.DWGNO);
	const acadeTitle = normalizeHeader(
		matchedMetadata.acadeValues.TITLE3 || matchedMetadata.acadeValues.TITLE1,
	);
	const acadeRevision = normalizeHeader(matchedMetadata.acadeValues.REV);
	const hasAcadeValues = Boolean(acadeDrawing || acadeTitle || acadeRevision);
	const acadeMismatch =
		(Boolean(acadeDrawing) &&
			acadeDrawing !== normalizeHeader(registerRow.drawingNumber)) ||
		(Boolean(acadeTitle) &&
			Boolean(normalizedRegisterTitle) &&
			acadeTitle !== normalizedRegisterTitle) ||
		(Boolean(acadeRevision) &&
			Boolean(normalizedRegisterRevision) &&
			acadeRevision !== normalizedRegisterRevision);
	const acadeVerificationState: ProjectDeliverableVerificationState =
		!hasAcadeValues
			? "unavailable"
			: acadeMismatch
				? "mismatch"
				: "matched";
	const acadeVerificationDetail = !hasAcadeValues
		? "ACADE report values are not available for this drawing."
		: acadeMismatch
			? "Workbook row does not match ACADE report values."
			: "Workbook row matches ACADE report values.";

	return {
		titleBlockVerificationState,
		titleBlockVerificationDetail,
		acadeVerificationState,
		acadeVerificationDetail,
	};
}

function buildSnapshot(args: {
	projectId: string;
	workbookFileName: string;
	parsedRows: ParsedDeliverableRegisterRow[];
	projectFiles: ProjectFile[];
	metadataRows: ProjectDocumentMetadataRow[];
	previousSnapshot?: ProjectDeliverableRegisterSnapshot | null;
	dwgRootPath?: string | null;
}): ProjectDeliverableRegisterSnapshot {
	const pdfFiles = args.projectFiles.filter((file) => {
		const mimeType = normalizeText(file.mime_type).toLowerCase();
		return mimeType.includes("pdf") || /\.pdf$/i.test(file.name);
	});
	const metadataRows = args.metadataRows.filter(
		(row) => normalizeText(row.fileType).toLowerCase() === "dwg",
	);
	const metadataRowsById = new Map(metadataRows.map((row) => [row.id, row]));
	const previousRowsById = new Map(
		(args.previousSnapshot?.rows ?? []).map((row) => [row.id, row]),
	);

	const rows = args.parsedRows.map<ProjectDeliverableRegisterRow>((parsedRow) => {
		const previousRow = previousRowsById.get(parsedRow.id) ?? null;
		const pdfMatches = pdfFiles
			.filter((file) =>
				normalizeFileStem(file.name).includes(parsedRow.drawingKey),
			)
			.map((file) => buildPdfMatch(file, file.id === previousRow?.manualPdfMatchId));
		const dwgMatches = metadataRows
			.filter((metadataRow) => {
				const drawingKey = normalizeDrawingKey(metadataRow.drawingNumber);
				const fileStem = normalizeFileStem(metadataRow.fileName);
				return (
					drawingKey === parsedRow.drawingKey ||
					fileStem.includes(parsedRow.drawingKey)
				);
			})
			.map((row) => buildDwgMatch(row, row.id === previousRow?.manualDwgMatchId));

		const resolvedPdf = resolvePairingStatus(
			pdfMatches,
			previousRow?.manualPdfMatchId ?? null,
		);
		const resolvedDwg = resolvePairingStatus(
			dwgMatches,
			previousRow?.manualDwgMatchId ?? null,
		);
		const verification = buildVerificationState({
			registerRow: parsedRow,
			dwgMatches: resolvedDwg.matches,
			metadataRowsById,
		});

		const statusText = normalizeHeader(parsedRow.status ?? "");
		const notesText = normalizeHeader(parsedRow.notes ?? "");
		const contradictoryCreationState =
			(statusText === "NOT CREATED YET" || notesText.includes("NOT CREATED YET")) &&
			(resolvedPdf.matches.length > 0 || resolvedDwg.matches.length > 0);
		const packageReadyByStatus =
			parsedRow.readinessState === "package-ready" && !contradictoryCreationState;
		const issueSetEligible =
			packageReadyByStatus &&
			(resolvedPdf.status === "paired" || resolvedPdf.status === "manual") &&
			verification.titleBlockVerificationState !== "mismatch" &&
			verification.acadeVerificationState !== "mismatch";

		return {
			id: parsedRow.id,
			snapshotId: args.previousSnapshot?.id ?? createId(),
			sheetName: parsedRow.sheetName,
			setName: parsedRow.setName,
			drawingNumber: parsedRow.drawingNumber,
			drawingKey: parsedRow.drawingKey,
			drawingDescription: parsedRow.drawingDescription,
			currentRevision: parsedRow.currentRevision,
			revisionHistory: parsedRow.revisionHistory,
			notes: parsedRow.notes,
			status: parsedRow.status,
			readinessState: contradictoryCreationState
				? "blocked"
				: parsedRow.readinessState,
			pdfPairingStatus: resolvedPdf.status,
			pdfMatches: resolvedPdf.matches,
			manualPdfMatchId: previousRow?.manualPdfMatchId ?? null,
			dwgPairingStatus: resolvedDwg.status,
			dwgMatches: resolvedDwg.matches,
			manualDwgMatchId: previousRow?.manualDwgMatchId ?? null,
			titleBlockVerificationState: contradictoryCreationState
				? "mismatch"
				: verification.titleBlockVerificationState,
			titleBlockVerificationDetail: contradictoryCreationState
				? "Workbook marks this drawing as not created yet, but matching PDF or DWG files already exist."
				: verification.titleBlockVerificationDetail,
			acadeVerificationState: contradictoryCreationState
				? "mismatch"
				: verification.acadeVerificationState,
			acadeVerificationDetail: contradictoryCreationState
				? "Workbook marks this drawing as not created yet, but matching PDF or DWG files already exist."
				: verification.acadeVerificationDetail,
			issueSetEligible,
		};
	});

	const snapshotId = args.previousSnapshot?.id ?? createId();
	return {
		id: snapshotId,
		projectId: args.projectId,
		workbookFileName: args.workbookFileName,
		importedAt: new Date().toISOString(),
		dwgRootPath: normalizeText(args.dwgRootPath) || null,
		pdfSourceSummary:
			pdfFiles.length > 0
				? `${pdfFiles.length} uploaded project PDF${pdfFiles.length === 1 ? "" : "s"}`
				: "No uploaded project PDFs paired yet",
		sheetNames: Array.from(new Set(args.parsedRows.map((row) => row.sheetName))),
		rowCount: rows.length,
		rows: rows.map((row) => ({ ...row, snapshotId })),
	};
}

function normalizeRevisionHistory(
	value: unknown,
): ProjectDeliverableRevisionSnapshot[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry, index) => {
			if (!entry || typeof entry !== "object") {
				return null;
			}
			const candidate = entry as Partial<ProjectDeliverableRevisionSnapshot>;
			const revision = normalizeText(candidate.revision);
			const date = normalizeText(candidate.date) || null;
			if (!revision && !date) {
				return null;
			}
			return {
				revision,
				date,
				order: Number.isFinite(Number(candidate.order))
					? Number(candidate.order)
					: index,
			};
		})
		.filter(
			(entry): entry is ProjectDeliverableRevisionSnapshot => entry !== null,
		);
}

function normalizePairingMatches(
	value: unknown,
	fallbackKind: ProjectDeliverablePairingMatch["matchKind"],
): ProjectDeliverablePairingMatch[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => {
			if (!entry || typeof entry !== "object") {
				return null;
			}
			const candidate = entry as Partial<ProjectDeliverablePairingMatch>;
			const id = normalizeText(candidate.id);
			const fileName = normalizeText(candidate.fileName);
			if (!id || !fileName) {
				return null;
			}
			return {
				id,
				fileId: normalizeText(candidate.fileId) || null,
				fileName,
				filePath: normalizeText(candidate.filePath),
				relativePath:
					normalizeText(candidate.relativePath) || normalizeText(candidate.fileName),
				matchKind:
					candidate.matchKind === "metadata-row"
						? "metadata-row"
						: candidate.matchKind === "project-file"
							? "project-file"
							: fallbackKind,
				manual: Boolean(candidate.manual),
				title: normalizeText(candidate.title) || null,
				revision: normalizeText(candidate.revision) || null,
			} satisfies ProjectDeliverablePairingMatch;
		})
		.filter((entry): entry is ProjectDeliverablePairingMatch => entry !== null);
}

function normalizeSnapshot(
	value: unknown,
): ProjectDeliverableRegisterSnapshot | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectDeliverableRegisterSnapshot>;
	const projectId = normalizeText(candidate.projectId);
	if (!projectId) {
		return null;
	}
	const id = normalizeText(candidate.id) || createId();
	const rows = Array.isArray(candidate.rows)
		? candidate.rows
				.map((entry) => {
					if (!entry || typeof entry !== "object") {
						return null;
					}
					const row = entry as Partial<ProjectDeliverableRegisterRow>;
					const drawingNumber = normalizeText(row.drawingNumber);
					if (!drawingNumber) {
						return null;
					}
					return {
						id: normalizeText(row.id) || createId(),
						snapshotId: normalizeText(row.snapshotId) || id,
						sheetName: normalizeText(row.sheetName) || "Register",
						setName: normalizeText(row.setName) || null,
						drawingNumber,
						drawingKey:
							normalizeText(row.drawingKey) || normalizeDrawingKey(drawingNumber),
						drawingDescription: normalizeText(row.drawingDescription),
						currentRevision: normalizeText(row.currentRevision),
						revisionHistory: normalizeRevisionHistory(row.revisionHistory),
						notes: normalizeText(row.notes) || null,
						status: normalizeText(row.status) || null,
						readinessState:
							row.readinessState === "package-ready"
								? "package-ready"
								: row.readinessState === "blocked"
									? "blocked"
									: "planning",
						pdfPairingStatus:
							row.pdfPairingStatus === "paired" ||
							row.pdfPairingStatus === "missing" ||
							row.pdfPairingStatus === "multiple" ||
							row.pdfPairingStatus === "manual"
								? row.pdfPairingStatus
								: "missing",
						pdfMatches: normalizePairingMatches(row.pdfMatches, "project-file"),
						manualPdfMatchId: normalizeText(row.manualPdfMatchId) || null,
						dwgPairingStatus:
							row.dwgPairingStatus === "paired" ||
							row.dwgPairingStatus === "missing" ||
							row.dwgPairingStatus === "multiple" ||
							row.dwgPairingStatus === "manual"
								? row.dwgPairingStatus
								: "missing",
						dwgMatches: normalizePairingMatches(row.dwgMatches, "metadata-row"),
						manualDwgMatchId: normalizeText(row.manualDwgMatchId) || null,
						titleBlockVerificationState:
							row.titleBlockVerificationState === "matched" ||
							row.titleBlockVerificationState === "mismatch" ||
							row.titleBlockVerificationState === "partial" ||
							row.titleBlockVerificationState === "unavailable"
								? row.titleBlockVerificationState
								: "unavailable",
						titleBlockVerificationDetail:
							normalizeText(row.titleBlockVerificationDetail) || null,
						acadeVerificationState:
							row.acadeVerificationState === "matched" ||
							row.acadeVerificationState === "mismatch" ||
							row.acadeVerificationState === "partial" ||
							row.acadeVerificationState === "unavailable"
								? row.acadeVerificationState
								: "unavailable",
						acadeVerificationDetail:
							normalizeText(row.acadeVerificationDetail) || null,
						issueSetEligible: Boolean(row.issueSetEligible),
					} satisfies ProjectDeliverableRegisterRow;
				})
				.filter((entry): entry is ProjectDeliverableRegisterRow => entry !== null)
		: [];

	return {
		id,
		projectId,
		workbookFileName: normalizeText(candidate.workbookFileName) || "Deliverable Register",
		importedAt: normalizeText(candidate.importedAt) || new Date().toISOString(),
		dwgRootPath: normalizeText(candidate.dwgRootPath) || null,
		pdfSourceSummary: normalizeText(candidate.pdfSourceSummary) || null,
		sheetNames: Array.isArray(candidate.sheetNames)
			? candidate.sheetNames.map((entry) => normalizeText(entry)).filter(Boolean)
			: Array.from(new Set(rows.map((row) => row.sheetName))),
		rowCount: Math.max(rows.length, Number(candidate.rowCount) || 0),
		rows,
	};
}

async function parseDeliverableRegisterWorkbook(args: {
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

async function persistSnapshot(snapshot: ProjectDeliverableRegisterSnapshot) {
	const result = await saveSetting(
		DELIVERABLE_REGISTER_SETTING_KEY,
		snapshot,
		snapshot.projectId,
	);
	writeLocalSnapshot(snapshot);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist project deliverable register snapshot.",
		);
	}
	return null;
}

async function getCurrentUserId() {
	const userId = await getCurrentSupabaseUserId();
	if (!userId) {
		throw new Error("Not authenticated");
	}
	return userId;
}

export const projectDeliverableRegisterService = {
	async fetchSnapshot(projectId: string): Promise<{
		data: ProjectDeliverableRegisterSnapshot | null;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: null,
				error: new Error("Project id is required."),
			};
		}

		const cached = deliverableRegisterFetchCache.read(normalizedProjectId);
		if (cached) {
			return cached;
		}
		const inFlight =
			deliverableRegisterFetchCache.readInFlight(normalizedProjectId);
		if (inFlight) {
			return await inFlight;
		}

		const localFallback = readLocalSnapshot(normalizedProjectId);
		const loader = deliverableRegisterFetchCache.writeInFlight(
			normalizedProjectId,
			(async () => {
				try {
					const stored = await loadSetting<unknown>(
						DELIVERABLE_REGISTER_SETTING_KEY,
						normalizedProjectId,
						null,
					);
					if (stored === null) {
						return deliverableRegisterFetchCache.write(normalizedProjectId, {
							data: localFallback,
							error: null,
						});
					}
					const normalized = normalizeSnapshot(stored);
					if (!normalized) {
						return deliverableRegisterFetchCache.write(normalizedProjectId, {
							data: localFallback,
							error: new Error("Stored deliverable register data is invalid."),
						});
					}
					writeLocalSnapshot(normalized);
					return deliverableRegisterFetchCache.write(normalizedProjectId, {
						data: normalized,
						error: null,
					});
				} catch (error) {
					return deliverableRegisterFetchCache.write(normalizedProjectId, {
						data: localFallback,
						error:
							error instanceof Error
								? error
								: new Error("Unable to load deliverable register snapshot."),
					});
				}
			})(),
		);

		try {
			return await loader;
		} finally {
			deliverableRegisterFetchCache.clearInFlight(normalizedProjectId);
		}
	},

	async importWorkbook(
		input: ProjectDeliverableRegisterImportInput,
	): Promise<{
		data: ProjectDeliverableRegisterSnapshot | null;
		error: Error | null;
	}> {
		const projectId = normalizeText(input.projectId);
		if (!projectId) {
			return {
				data: null,
				error: new Error("Project id is required."),
			};
		}
		try {
			const parsedRows = await parseDeliverableRegisterWorkbook({
				fileName: input.fileName,
				arrayBuffer: input.arrayBuffer,
			});
			const snapshot = buildSnapshot({
				projectId,
				workbookFileName: normalizeText(input.fileName) || "Deliverable Register",
				parsedRows,
				projectFiles: input.projectFiles ?? [],
				metadataRows: input.metadataRows ?? [],
				previousSnapshot: input.previousSnapshot ?? null,
				dwgRootPath: input.dwgRootPath ?? null,
			});
			const persistError = await persistSnapshot(snapshot);
			deliverableRegisterFetchCache.write(projectId, {
				data: snapshot,
				error: persistError,
			});
			return {
				data: snapshot,
				error: persistError,
			};
		} catch (error) {
			return {
				data: null,
				error:
					error instanceof Error
						? error
						: new Error("Unable to import deliverable register workbook."),
			};
		}
	},

	async refreshSnapshot(args: {
		projectId: string;
		projectFiles?: ProjectFile[];
		metadataRows?: ProjectDocumentMetadataRow[];
		dwgRootPath?: string | null;
	}): Promise<{
		data: ProjectDeliverableRegisterSnapshot | null;
		error: Error | null;
	}> {
		const current = await this.fetchSnapshot(args.projectId);
		if (current.error || !current.data) {
			return current;
		}
		const parsedRows: ParsedDeliverableRegisterRow[] = current.data.rows.map((row) => ({
			id: row.id,
			sheetName: row.sheetName,
			setName: row.setName,
			drawingNumber: row.drawingNumber,
			drawingKey: row.drawingKey,
			drawingDescription: row.drawingDescription,
			currentRevision: row.currentRevision,
			revisionHistory: row.revisionHistory,
			notes: row.notes,
			status: row.status,
			readinessState: row.readinessState,
		}));
		const snapshot = buildSnapshot({
			projectId: current.data.projectId,
			workbookFileName: current.data.workbookFileName,
			parsedRows,
			projectFiles: args.projectFiles ?? [],
			metadataRows: args.metadataRows ?? [],
			previousSnapshot: current.data,
			dwgRootPath: args.dwgRootPath ?? current.data.dwgRootPath,
		});
		const persistError = await persistSnapshot(snapshot);
		deliverableRegisterFetchCache.write(current.data.projectId, {
			data: snapshot,
			error: persistError,
		});
		return { data: snapshot, error: persistError };
	},

	async clearSnapshot(projectId: string): Promise<{
		success: boolean;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				success: false,
				error: new Error("Project id is required."),
			};
		}
		try {
			await deleteSetting(DELIVERABLE_REGISTER_SETTING_KEY, normalizedProjectId);
			const storage = getLocalStorageApi();
			if (storage) {
				storage.removeItem(buildLocalStorageKey(normalizedProjectId));
			}
			deliverableRegisterFetchCache.write(normalizedProjectId, {
				data: null,
				error: null,
			});
			return { success: true, error: null };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error
						: new Error("Unable to clear deliverable register snapshot."),
			};
		}
	},

	async savePairingOverride(args: {
		projectId: string;
		rowId: string;
		pdfMatchId?: string | null;
		dwgMatchId?: string | null;
		projectFiles?: ProjectFile[];
		metadataRows?: ProjectDocumentMetadataRow[];
		dwgRootPath?: string | null;
	}): Promise<{
		data: ProjectDeliverableRegisterSnapshot | null;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(args.projectId);
		const normalizedRowId = normalizeText(args.rowId);
		if (!normalizedProjectId || !normalizedRowId) {
			return {
				data: null,
				error: new Error("Project id and row id are required."),
			};
		}
		const current = await this.fetchSnapshot(normalizedProjectId);
		if (current.error || !current.data) {
			return current;
		}
		const nextRows = current.data.rows.map((row) => {
			if (row.id !== normalizedRowId) {
				return row;
			}
			return {
				...row,
				manualPdfMatchId:
					args.pdfMatchId !== undefined
						? normalizeText(args.pdfMatchId) || null
						: row.manualPdfMatchId,
				manualDwgMatchId:
					args.dwgMatchId !== undefined
						? normalizeText(args.dwgMatchId) || null
						: row.manualDwgMatchId,
			};
		});
		const parsedRows: ParsedDeliverableRegisterRow[] = nextRows.map((row) => ({
			id: row.id,
			sheetName: row.sheetName,
			setName: row.setName,
			drawingNumber: row.drawingNumber,
			drawingKey: row.drawingKey,
			drawingDescription: row.drawingDescription,
			currentRevision: row.currentRevision,
			revisionHistory: row.revisionHistory,
			notes: row.notes,
			status: row.status,
			readinessState: row.readinessState,
		}));
		const snapshot = buildSnapshot({
			projectId: current.data.projectId,
			workbookFileName: current.data.workbookFileName,
			parsedRows,
			projectFiles: args.projectFiles ?? [],
			metadataRows: args.metadataRows ?? [],
			previousSnapshot: {
				...current.data,
				rows: nextRows,
			},
			dwgRootPath: args.dwgRootPath ?? current.data.dwgRootPath,
		});
		const persistError = await persistSnapshot(snapshot);
		deliverableRegisterFetchCache.write(current.data.projectId, {
			data: snapshot,
			error: persistError,
		});
		return {
			data: snapshot,
			error: persistError,
		};
	},

	async fetchProjectFiles(projectId: string): Promise<{
		data: ProjectFile[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}
		try {
			const userId = await getCurrentUserId();
			const { data, error } = await supabase
				.from("files")
				.select("*")
				.eq("project_id", normalizedProjectId)
				.eq("user_id", userId)
				.order("uploaded_at", { ascending: false });
			if (error) {
				throw error;
			}
			return { data: (data ?? []) as ProjectFile[], error: null };
		} catch (error) {
			return {
				data: [],
				error:
					error instanceof Error
						? error
						: new Error("Unable to load project files."),
			};
		}
	},

	async fetchProjectFilesByIds(args: {
		projectId: string;
		fileIds: string[];
	}): Promise<{
		data: ProjectFile[];
		error: Error | null;
	}> {
		const allFiles = await this.fetchProjectFiles(args.projectId);
		if (allFiles.error) {
			return allFiles;
		}
		const idSet = new Set(args.fileIds.map((id) => normalizeText(id)).filter(Boolean));
		return {
			data: allFiles.data.filter((file) => idSet.has(file.id)),
			error: null,
		};
	},

	async materializeProjectPdfFiles(files: ProjectFile[]): Promise<{
		data: File[];
		error: Error | null;
	}> {
		try {
			const downloads = await Promise.all(
				files.map(async (file) => {
					const { data, error } = await supabase.storage
						.from("project-files")
						.download(file.file_path);
					if (error) {
						throw error;
					}
					return new File([data], file.name, {
						type: normalizeText(file.mime_type) || "application/pdf",
						lastModified: new Date(file.uploaded_at).getTime(),
					});
				}),
			);
			return { data: downloads, error: null };
		} catch (error) {
			return {
				data: [],
				error:
					error instanceof Error
						? error
						: new Error("Unable to load project PDF files."),
			};
		}
	},
};
