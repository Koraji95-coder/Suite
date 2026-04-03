import type { CellValue, Row } from "exceljs";
import { loadProjectSetupDocumentSnapshot } from "@/features/project-setup/snapshotService";
import type {
	TitleBlockRevisionDisplayRow,
	TitleBlockSyncArtifacts,
	TitleBlockSyncProfile,
	TitleBlockSyncRow,
	TitleBlockSyncSummary,
} from "@/features/project-setup/types";
import { logger } from "@/lib/logger";

export type ProjectDocumentMetadataSource =
	| "title_block_sync"
	| "filename_fallback"
	| "acade_report";

export type ProjectDocumentReviewState =
	| "ready"
	| "needs-review"
	| "fallback";

export interface ProjectDocumentMetadataProjectOption {
	id: string;
	name: string;
	description: string;
	projectPeName: string;
	firmNumber: string;
	watchdogRootPath: string | null;
	pdfPackageRootPath: string | null;
}

export interface ProjectDocumentMetadataRow {
	id: string;
	projectId: string;
	fileName: string;
	relativePath: string;
	absolutePath: string;
	fileType: string;
	drawingNumber: string;
	title: string;
	revision: string;
	source: ProjectDocumentMetadataSource;
	reviewState: ProjectDocumentReviewState;
	confidence: number;
	titleBlockFound: boolean;
	hasWdTbConflict: boolean;
	currentAttributes: Record<string, string>;
	acadeValues: Record<string, string>;
	suiteUpdates: Record<string, string>;
	revisionRows: TitleBlockRevisionDisplayRow[];
	issues: string[];
	warnings: string[];
	rawRow: TitleBlockSyncRow;
}

export interface ProjectDocumentMetadataSnapshot {
	projectId: string;
	projectRootPath: string;
	profile: TitleBlockSyncProfile;
	summary: TitleBlockSyncSummary;
	artifacts: TitleBlockSyncArtifacts;
	rows: ProjectDocumentMetadataRow[];
	titleBlockRows: TitleBlockSyncRow[];
	warnings: string[];
}

export interface LoadProjectDocumentMetadataOptions {
	reportFile?: File | null;
	reportRows?: AcadeDocumentReportRow[];
}

export interface ProjectDocumentMetadataExportRow {
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

export interface ProjectMetadataStandardDocument {
	id: string;
	fileName: string;
	drawingNumber: string;
	title: string;
	revision: string;
	confidence: number;
	source: string;
	needsReview: boolean;
	accepted: boolean;
	overrideReason: string;
	modelVersion?: string;
}

export interface AcadeDocumentReportRow {
	fileName: string;
	drawingNumber: string;
	title: string;
	revision: string;
}

const DRAWING_NUMBER_PATTERN = /\bR3P(?:[-_][A-Z0-9]+){2,8}\b/i;
const SNAPSHOT_CACHE_TTL_MS = 2_000;

interface SnapshotCacheEntry {
	expiresAt: number;
	value: ProjectDocumentMetadataSnapshot;
}

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const snapshotInFlight = new Map<string, Promise<ProjectDocumentMetadataSnapshot>>();

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizePathKey(value: string) {
	return normalizeText(value)
		.replace(/[\\/]+/g, "/")
		.replace(/\/+$/g, "")
		.toLowerCase();
}

function buildSnapshotCacheKey(args: {
	projectId: string;
	projectRootPath: string;
	reportRows?: AcadeDocumentReportRow[];
}) {
	if ((args.reportRows?.length ?? 0) > 0) {
		return null;
	}
	return `${normalizeText(args.projectId)}::${normalizePathKey(args.projectRootPath)}`;
}

function normalizeDrawingKey(value: unknown) {
	return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeFileStem(value: string) {
	return value.replace(/\.[^/.]+$/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function deriveFilenameDrawingNumber(fileName: string) {
	const match = fileName.match(DRAWING_NUMBER_PATTERN);
	return match ? match[0].replace(/_/g, "-").toUpperCase() : "";
}

function resolvePreferredMetadataRow(
	current: ProjectDocumentMetadataRow | null,
	candidate: ProjectDocumentMetadataRow,
) {
	if (!current) return candidate;
	if (candidate.fileType === "pdf" && current.fileType !== "pdf") {
		return candidate;
	}
	if (candidate.reviewState === "ready" && current.reviewState !== "ready") {
		return candidate;
	}
	if (candidate.issues.length < current.issues.length) {
		return candidate;
	}
	return current;
}

function resolveReviewState(row: TitleBlockSyncRow): ProjectDocumentReviewState {
	if (
		row.fileType === "pdf" ||
		!row.titleBlockFound ||
		row.hasWdTbConflict
	) {
		return "fallback";
	}
	if (row.issues.length > 0 || row.warnings.length > 0) {
		return "needs-review";
	}
	return "ready";
}

export function buildProjectDocumentMetadataRows(
	projectId: string,
	rows: TitleBlockSyncRow[],
	reportRows: AcadeDocumentReportRow[] = [],
): ProjectDocumentMetadataRow[] {
	const reportByDrawingKey = new Map<string, AcadeDocumentReportRow>();
	for (const row of reportRows) {
		const drawingKey = normalizeDrawingKey(row.drawingNumber);
		const fileKey = normalizeFileStem(row.fileName);
		if (drawingKey) {
			reportByDrawingKey.set(drawingKey, row);
		}
		if (fileKey) {
			reportByDrawingKey.set(fileKey, row);
		}
	}

	return rows.map((row) => {
		const reportMatch =
			reportByDrawingKey.get(normalizeDrawingKey(row.drawingNumber)) ??
			reportByDrawingKey.get(normalizeFileStem(row.fileName));
		const drawingNumber =
			normalizeText(row.drawingNumber) ||
			normalizeText(row.currentAttributes.DWGNO) ||
			normalizeText(reportMatch?.drawingNumber) ||
			normalizeText(row.filenameDrawingNumber);
		const title =
			normalizeText(row.drawingTitle) ||
			normalizeText(row.currentAttributes.TITLE3) ||
			normalizeText(reportMatch?.title) ||
			normalizeText(row.filenameTitle) ||
			row.fileName.replace(/\.[^/.]+$/, "");
		const revision =
			normalizeText(row.suiteUpdates.REV) ||
			normalizeText(row.currentAttributes.REV) ||
			normalizeText(reportMatch?.revision) ||
			normalizeText(row.filenameRevision);
		const issues = [...row.issues];
		if (reportMatch) {
			const reportTitle = normalizeText(reportMatch.title);
			const reportRevision = normalizeText(reportMatch.revision);
			if (reportTitle && reportTitle !== title) {
				issues.push("ACADE report title does not match title block metadata.");
			}
			if (reportRevision && reportRevision !== revision) {
				issues.push("ACADE report revision does not match revision register/title block metadata.");
			}
		}
		const reviewState = resolveReviewState({ ...row, issues });
		const confidence =
			reviewState === "ready"
				? 1
				: reviewState === "needs-review"
					? 0.82
					: 0.55;
		return {
			id: row.id,
			projectId,
			fileName: row.fileName,
			relativePath: row.relativePath,
			absolutePath: row.absolutePath,
			fileType: row.fileType,
			drawingNumber,
			title,
			revision,
			source:
				reportMatch && !row.titleBlockFound
					? "acade_report"
					: reviewState === "fallback"
						? "filename_fallback"
						: "title_block_sync",
			reviewState,
			confidence,
			titleBlockFound: row.titleBlockFound,
			hasWdTbConflict: row.hasWdTbConflict,
			currentAttributes: row.currentAttributes,
			acadeValues: row.acadeValues,
			suiteUpdates: row.suiteUpdates,
			revisionRows: row.revisionRows,
			issues,
			warnings: [...row.warnings],
			rawRow: row,
		};
	});
}

export function normalizeTitleBlockSyncRows(
	rows: TitleBlockSyncRow[],
	reportRows: AcadeDocumentReportRow[] = [],
) {
	return buildProjectDocumentMetadataRows("", rows, reportRows);
}

export function buildDrawingIndexExportRows(
	rows: ProjectDocumentMetadataRow[],
): ProjectDocumentMetadataExportRow[] {
	return rows.map((row) => ({
		id: row.id,
		fileName: row.fileName,
		title: row.title,
		discipline: "",
		sheetType: row.fileType.toUpperCase(),
		sequence: null,
		revision: row.revision,
		drawingNumber: row.drawingNumber,
		source: row.source === "title_block_sync" ? "generated" : "folder",
	}));
}

function buildStandardDocumentFromMetadata(
	row: ProjectDocumentMetadataRow,
	fileNameOverride?: string,
): ProjectMetadataStandardDocument {
	const needsReview = row.reviewState !== "ready";
	return {
		id: `project-metadata:${row.id}:${fileNameOverride ?? row.fileName}`,
		fileName: fileNameOverride ?? row.fileName,
		drawingNumber: row.drawingNumber,
		title: row.title,
		revision: row.revision,
		confidence: row.confidence,
		source:
			row.source === "acade_report"
				? "acade_report"
				: row.reviewState === "fallback"
					? "filename_fallback"
					: "project_metadata",
		needsReview,
		accepted: !needsReview,
		overrideReason: "",
		modelVersion: "project-metadata-v1",
	};
}

function buildFilenameFallbackStandardDocument(
	file: File,
): ProjectMetadataStandardDocument {
	const drawingNumber = deriveFilenameDrawingNumber(file.name);
	return {
		id: `project-metadata:fallback:${file.name}`,
		fileName: file.name,
		drawingNumber,
		title: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim(),
		revision: "",
		confidence: 0.35,
		source: "filename_fallback",
		needsReview: true,
		accepted: false,
		overrideReason: "",
		modelVersion: "project-metadata-v1",
	};
}

export function buildStandardDocumentsFromProjectMetadata(
	rows: ProjectDocumentMetadataRow[],
	pdfFiles: File[],
): ProjectMetadataStandardDocument[] {
	const preferredByKey = new Map<string, ProjectDocumentMetadataRow>();
	for (const row of rows) {
		const keys = [
			normalizeDrawingKey(row.drawingNumber),
			normalizeFileStem(row.fileName),
		].filter(Boolean);
		for (const key of keys) {
			preferredByKey.set(
				key,
				resolvePreferredMetadataRow(preferredByKey.get(key) ?? null, row),
			);
		}
	}

	if (pdfFiles.length === 0) {
		return Array.from(new Set(preferredByKey.values())).map((row) =>
			buildStandardDocumentFromMetadata(row),
		);
	}

	return pdfFiles.map((file) => {
		const fileStemKey = normalizeFileStem(file.name);
		const fileDrawingKey = normalizeDrawingKey(deriveFilenameDrawingNumber(file.name));
		const matched =
			preferredByKey.get(fileStemKey) ??
			(fileDrawingKey ? preferredByKey.get(fileDrawingKey) : undefined);
		return matched
			? buildStandardDocumentFromMetadata(matched, file.name)
			: buildFilenameFallbackStandardDocument(file);
	});
}

export function buildProjectMetadataRowsForFiles(
	fileNames: string[],
	rows: ProjectDocumentMetadataRow[],
): ProjectDocumentMetadataRow[] {
	const preferredByKey = new Map<string, ProjectDocumentMetadataRow>();
	for (const row of rows) {
		const keys = [
			normalizeDrawingKey(row.drawingNumber),
			normalizeFileStem(row.fileName),
		].filter(Boolean);
		for (const key of keys) {
			preferredByKey.set(
				key,
				resolvePreferredMetadataRow(preferredByKey.get(key) ?? null, row),
			);
		}
	}

	if (fileNames.length === 0) {
		return Array.from(new Set(preferredByKey.values()));
	}

	return fileNames.map((fileName) => {
		const matched =
			preferredByKey.get(normalizeFileStem(fileName)) ??
			preferredByKey.get(normalizeDrawingKey(deriveFilenameDrawingNumber(fileName)));
		if (matched) {
			return matched;
		}

		const fallbackDoc = buildFilenameFallbackStandardDocument(
			new File([""], fileName, { type: "application/pdf" }),
		);
		return {
			id: fallbackDoc.id,
			projectId: "",
			fileName,
			relativePath: fileName,
			absolutePath: "",
			fileType: "pdf",
			drawingNumber: fallbackDoc.drawingNumber,
			title: fallbackDoc.title,
			revision: fallbackDoc.revision,
			source: "filename_fallback",
			reviewState: "fallback",
			confidence: fallbackDoc.confidence,
			titleBlockFound: false,
			hasWdTbConflict: false,
			currentAttributes: {},
			acadeValues: {},
			suiteUpdates: {},
			revisionRows: [],
			issues: fallbackDoc.drawingNumber
				? []
				: ["Filename drawing number could not be derived."],
			warnings: [],
			rawRow: {
				id: fallbackDoc.id,
				fileName,
				relativePath: fileName,
				absolutePath: "",
				fileType: "pdf",
				filenameDrawingNumber: fallbackDoc.drawingNumber,
				filenameTitle: fallbackDoc.title,
				filenameRevision: "",
				titleBlockFound: false,
				effectiveBlockName: "",
				layoutName: "",
				titleBlockHandle: "",
				hasWdTbConflict: false,
				currentAttributes: {},
				editableFields: {
					scale: "",
					drawnBy: "",
					drawnDate: "",
					checkedBy: "",
					checkedDate: "",
					engineer: "",
					engineerDate: "",
				},
				issues: fallbackDoc.drawingNumber
					? []
					: ["Filename drawing number could not be derived."],
				warnings: [],
				revisionEntryCount: 0,
				drawingNumber: fallbackDoc.drawingNumber,
				drawingTitle: fallbackDoc.title,
				acadeValues: {},
				suiteUpdates: {},
				pendingSuiteWrites: [],
				pendingAcadeWrites: [],
				revisionRows: [],
			},
		};
	});
}

function readCellText(row: Row, index: number) {
	const cell = row.getCell(index);
	const raw = cell.value;
	if (raw == null) return "";
	if (typeof raw === "object" && "text" in raw) {
		return normalizeText(raw.text);
	}
	return normalizeText(raw);
}

function resolveReportColumnIndex(headers: string[], aliases: string[]) {
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

export const projectDocumentMetadataService = {
	async loadSnapshot(args: {
		projectId: string;
		projectRootPath: string;
		reportRows?: AcadeDocumentReportRow[];
	}): Promise<ProjectDocumentMetadataSnapshot> {
		const projectId = normalizeText(args.projectId);
		const projectRootPath = normalizeText(args.projectRootPath);
		const cacheKey = buildSnapshotCacheKey({
			projectId,
			projectRootPath,
			reportRows: args.reportRows,
		});
		if (!projectId) {
			throw new Error("Project id is required.");
		}
		if (!projectRootPath) {
			throw new Error("Project root path is required.");
		}

		if (cacheKey) {
			const cached = snapshotCache.get(cacheKey);
			if (cached && cached.expiresAt > Date.now()) {
				return cached.value;
			}
			const inFlight = snapshotInFlight.get(cacheKey);
			if (inFlight) {
				return inFlight;
			}
		}

		const loader = (async () => {
			const projectSetupSnapshot = await loadProjectSetupDocumentSnapshot({
				projectId,
				projectRootPath,
			});

			const snapshot = {
				projectId,
				projectRootPath: projectSetupSnapshot.projectRootPath,
				profile: projectSetupSnapshot.profile,
				summary: projectSetupSnapshot.summary,
				artifacts: projectSetupSnapshot.artifacts,
				titleBlockRows: projectSetupSnapshot.drawings,
				rows: buildProjectDocumentMetadataRows(
					projectId,
					projectSetupSnapshot.drawings,
					args.reportRows || [],
				),
				warnings: projectSetupSnapshot.warnings,
			} satisfies ProjectDocumentMetadataSnapshot;

			if (cacheKey) {
				snapshotCache.set(cacheKey, {
					expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
					value: snapshot,
				});
			}

			return snapshot;
		})();

		if (cacheKey) {
			snapshotInFlight.set(cacheKey, loader);
		}

		try {
			return await loader;
		} finally {
			if (cacheKey) {
				snapshotInFlight.delete(cacheKey);
			}
		}
	},

	buildProjectDocumentMetadataRows,
	normalizeTitleBlockSyncRows,
	buildDrawingIndexExportRows,
	buildProjectMetadataRowsForFiles,
	buildStandardDocumentsFromProjectMetadata,
	parseAcadeDocumentReportFile,
};

export async function loadProjectDocumentMetadata(
	project: ProjectDocumentMetadataProjectOption,
	options: LoadProjectDocumentMetadataOptions = {},
) {
	const projectId = normalizeText(project.id);
	const projectRootPath = normalizeText(project.watchdogRootPath);
	if (!projectId) {
		throw new Error("Project id is required.");
	}
	if (!projectRootPath) {
		throw new Error(
			"Selected project does not have a watchdog root path configured.",
		);
	}
	const reportRows =
		options.reportRows ??
		(options.reportFile
			? await parseAcadeDocumentReportFile(options.reportFile)
			: []);
	return projectDocumentMetadataService.loadSnapshot({
		projectId,
		projectRootPath,
		reportRows,
	});
}

export function logProjectMetadataFailure(
	context: string,
	error: unknown,
	extra?: Record<string, unknown>,
) {
	logger.error("Project document metadata request failed", context, {
		message: error instanceof Error ? error.message : String(error),
		...(extra || {}),
	});
}
