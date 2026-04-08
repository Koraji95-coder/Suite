import { localId } from "@/lib/localId";
import type {
	ProjectDrawingProgramRow,
	ProjectDrawingProgramRowStatus,
	ProjectDrawingProvisionState,
	ProjectDrawingStandardCatalogEntry,
	ProjectDrawingStandardSnapshot,
	ProjectDrawingStandardStarterRow,
	ProjectDrawingStandardSource,
	ProjectDrawingTemplateMapping,
	ProjectDrawingProvisionReceipt,
} from "./types";

export const DEFAULT_SEQUENCE_DIGITS = 4;

export function createId(prefix?: string) {
	return localId(prefix);
}

export function nowIso() {
	return new Date().toISOString();
}

export function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

export function normalizeNullableText(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

export function normalizeHeader(value: string) {
	return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function normalizeStatus(value: unknown): ProjectDrawingProgramRowStatus {
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

export function normalizeProvisionState(
	value: unknown,
): ProjectDrawingProvisionState {
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

export function normalizeWorkbookPath(value: unknown) {
	return normalizeText(value).replace(/\\/g, "/");
}

export function normalizeNumberPrefix(value: unknown) {
	return normalizeText(value).replace(/\s+/g, " ");
}

export function normalizeCatalogKey(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function sanitizePathSegment(value: string) {
	const withoutControlCharacters = Array.from(value, (char) =>
		char.charCodeAt(0) < 32 ? " " : char,
	).join("");

	return withoutControlCharacters
		.replace(/[<>:"/\\|?*]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function parsePositiveInt(value: unknown, fallback: number) {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeStringArray(value: unknown) {
	if (!Array.isArray(value)) {
		return [] as string[];
	}
	return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatDrawingNumber(
	numberPrefix: string,
	sequenceDigits: number,
	sequenceNumber: number,
) {
	return `${numberPrefix}${String(sequenceNumber).padStart(
		Math.max(1, sequenceDigits),
		"0",
	)}`;
}

export function formatSequenceBand(
	start: number,
	end: number,
	digits = DEFAULT_SEQUENCE_DIGITS,
) {
	return `${String(Math.max(0, start)).padStart(Math.max(1, digits), "0")}-${String(
		Math.max(0, end),
	).padStart(Math.max(1, digits), "0")}`;
}

export function buildDrawingNumberPrefix(
	projectNumber: string,
	typeCode: string,
) {
	return `R3P-${projectNumber}-${typeCode}-`;
}

export function buildStructuredDrawingNumber(args: {
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

export function parseDrawingNumberParts(drawingNumber: string) {
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

export function parseStructuredDrawingNumber(drawingNumber: string) {
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

export function normalizeProjectNumberToken(value: unknown) {
	const normalized = normalizeText(value).replace(/^R3P-/i, "");
	return normalized.replace(/\s+/g, "").replace(/[^A-Za-z0-9-]+/g, "");
}

export function resolveProgramProjectNumberToken(args: {
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

export function buildDefaultRelativePath(drawingNumber: string, title: string) {
	const sanitizedTitle = sanitizePathSegment(title);
	return sanitizedTitle
		? `${drawingNumber} - ${sanitizedTitle}.dwg`
		: `${drawingNumber}.dwg`;
}

export function replaceDrawingNumberInRelativePath(
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

export function sortRows(rows: ProjectDrawingProgramRow[]) {
	return [...rows].sort((left, right) => {
		if (left.sortOrder !== right.sortOrder) {
			return left.sortOrder - right.sortOrder;
		}
		return left.drawingNumber.localeCompare(right.drawingNumber);
	});
}

export function sortCatalogEntries(
	entries: ProjectDrawingStandardCatalogEntry[],
) {
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

export function sortReceipts(entries: ProjectDrawingProvisionReceipt[]) {
	return [...entries].sort((left, right) =>
		right.appliedAt.localeCompare(left.appliedAt),
	);
}

export function normalizeTemplateMapping(
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

export function normalizeStarterRow(
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
	} satisfies ProjectDrawingStandardStarterRow;
}

export function validateStandardSource(
	value: unknown,
): ProjectDrawingStandardSource {
	return normalizeText(value) === "project-import"
		? "project-import"
		: "builtin";
}

export function findCatalogEntriesByTypeAndSequence(
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
