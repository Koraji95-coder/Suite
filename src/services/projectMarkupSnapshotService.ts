import { logger } from "@/lib/logger";
import { loadSetting, saveSetting } from "@/settings/userSettings";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import { safeSupabaseQuery } from "@/supabase/utils";

export type ProjectMarkupSnapshotRow =
	Database["public"]["Tables"]["project_markup_snapshots"]["Row"];
export type ProjectMarkupSnapshotInsert =
	Database["public"]["Tables"]["project_markup_snapshots"]["Insert"];
export type ProjectMarkupSnapshotUpdate =
	Database["public"]["Tables"]["project_markup_snapshots"]["Update"];

export interface ProjectMarkupSnapshotRecord {
	id: string;
	projectId: string;
	issueSetId: string | null;
	drawingPath: string;
	drawingName: string | null;
	sourcePdfName: string;
	pageIndex: number;
	contractVersion: string;
	preparePayload: Record<string, unknown>;
	comparePayload: Record<string, unknown>;
	selectedActionIds: string[];
	selectedOperationIds: string[];
	reviewedBundleJson: Record<string, unknown>;
	revisionContext: Record<string, unknown> | null;
	warnings: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ProjectMarkupSnapshotInput {
	projectId: string;
	issueSetId?: string | null;
	drawingPath: string;
	drawingName?: string | null;
	sourcePdfName: string;
	pageIndex: number;
	contractVersion?: string | null;
	preparePayload: Record<string, unknown>;
	comparePayload: Record<string, unknown>;
	selectedActionIds?: string[];
	selectedOperationIds?: string[];
	reviewedBundleJson: Record<string, unknown>;
	revisionContext?: Record<string, unknown> | null;
	warnings?: string[];
}

const MARKUP_SNAPSHOT_SETTING_KEY = "project_markup_snapshots_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-markup-snapshots";
const DEFAULT_CONTRACT_VERSION = "bluebeam-default.v1";

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `markup-snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set<string>();
	const entries: string[] = [];
	for (const entry of value) {
		const normalized = normalizeText(entry);
		if (!normalized) {
			continue;
		}
		const key = normalized.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		entries.push(normalized);
	}
	return entries;
}

function normalizeJsonRecord(value: unknown) {
	if (!isRecord(value)) {
		return {} as Record<string, unknown>;
	}
	return value;
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function normalizeRow(
	value: unknown,
): ProjectMarkupSnapshotRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectMarkupSnapshotRecord>;
	const projectId = normalizeText(candidate.projectId);
	const drawingPath = normalizeText(candidate.drawingPath);
	if (!projectId || !drawingPath) {
		return null;
	}
	const createdAt =
		normalizeNullableText(candidate.createdAt) || new Date().toISOString();
	const updatedAt = normalizeNullableText(candidate.updatedAt) || createdAt;
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		issueSetId: normalizeNullableText(candidate.issueSetId),
		drawingPath,
		drawingName: normalizeNullableText(candidate.drawingName),
		sourcePdfName: normalizeText(candidate.sourcePdfName) || "Marked drawing.pdf",
		pageIndex: Math.max(0, Number(candidate.pageIndex || 0)),
		contractVersion:
			normalizeText(candidate.contractVersion) || DEFAULT_CONTRACT_VERSION,
		preparePayload: normalizeJsonRecord(candidate.preparePayload),
		comparePayload: normalizeJsonRecord(candidate.comparePayload),
		selectedActionIds: normalizeStringArray(candidate.selectedActionIds),
		selectedOperationIds: normalizeStringArray(candidate.selectedOperationIds),
		reviewedBundleJson: normalizeJsonRecord(candidate.reviewedBundleJson),
		revisionContext: isRecord(candidate.revisionContext)
			? candidate.revisionContext
			: null,
		warnings: normalizeStringArray(candidate.warnings),
		createdAt,
		updatedAt,
	};
}

function toSnapshotRow(
	record: ProjectMarkupSnapshotRecord,
	userId: string,
): ProjectMarkupSnapshotInsert {
	return {
		id: record.id,
		project_id: record.projectId,
		issue_set_id: record.issueSetId,
		drawing_path: record.drawingPath,
		drawing_name: record.drawingName,
		source_pdf_name: record.sourcePdfName,
		page_index: record.pageIndex,
		contract_version: record.contractVersion,
		prepare_payload: record.preparePayload as Json,
		compare_payload: record.comparePayload as Json,
		selected_action_ids: record.selectedActionIds,
		selected_operation_ids: record.selectedOperationIds,
		reviewed_bundle_json: record.reviewedBundleJson as Json,
		revision_context: (record.revisionContext ?? null) as Json,
		warnings: record.warnings,
		user_id: userId,
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

function fromSnapshotRow(
	row: ProjectMarkupSnapshotRow,
): ProjectMarkupSnapshotRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		issueSetId: row.issue_set_id,
		drawingPath: row.drawing_path,
		drawingName: row.drawing_name,
		sourcePdfName: row.source_pdf_name,
		pageIndex: Math.max(0, Number(row.page_index || 0)),
		contractVersion: row.contract_version || DEFAULT_CONTRACT_VERSION,
		preparePayload: normalizeJsonRecord(row.prepare_payload),
		comparePayload: normalizeJsonRecord(row.compare_payload),
		selectedActionIds: normalizeStringArray(row.selected_action_ids),
		selectedOperationIds: normalizeStringArray(row.selected_operation_ids),
		reviewedBundleJson: normalizeJsonRecord(row.reviewed_bundle_json),
		revisionContext: isRecord(row.revision_context) ? row.revision_context : null,
		warnings: normalizeStringArray(row.warnings),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function sortSnapshots(entries: ProjectMarkupSnapshotRecord[]) {
	return [...entries].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function readLocalSnapshots(projectId: string) {
	if (typeof localStorage === "undefined") {
		return [] as ProjectMarkupSnapshotRecord[];
	}
	try {
		const raw = localStorage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return [] as ProjectMarkupSnapshotRecord[];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [] as ProjectMarkupSnapshotRecord[];
		}
		return sortSnapshots(
			parsed
				.map((entry) => normalizeRow(entry))
				.filter(
					(entry): entry is ProjectMarkupSnapshotRecord => entry !== null,
				),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local project markup snapshots.",
			"ProjectMarkupSnapshotService",
			error,
		);
		return [] as ProjectMarkupSnapshotRecord[];
	}
}

function writeLocalSnapshots(
	projectId: string,
	entries: ProjectMarkupSnapshotRecord[],
) {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(
			buildLocalStorageKey(projectId),
			JSON.stringify(sortSnapshots(entries)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local project markup snapshots.",
			"ProjectMarkupSnapshotService",
			error,
		);
	}
}

async function getCurrentUserId() {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return null;
	}
	return user.id;
}

function isMissingMarkupSnapshotTable(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error && "message" in error
				? String((error as { message?: unknown }).message || "")
				: String(error || "");
	const normalized = message.toLowerCase();
	return (
		normalized.includes("project_markup_snapshots")
		&& (normalized.includes("does not exist")
			|| normalized.includes("not found")
			|| normalized.includes("schema cache"))
	);
}

async function persistLocalSnapshots(
	projectId: string,
	entries: ProjectMarkupSnapshotRecord[],
) {
	const sorted = sortSnapshots(entries);
	const result = await saveSetting(
		MARKUP_SNAPSHOT_SETTING_KEY,
		sorted,
		projectId,
	);
	writeLocalSnapshots(projectId, sorted);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist project markup snapshots.",
		);
	}
	return null;
}

export const projectMarkupSnapshotService = {
	async fetchSnapshots(projectId: string): Promise<{
		data: ProjectMarkupSnapshotRecord[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const localFallback = readLocalSnapshots(normalizedProjectId);
		const userId = await getCurrentUserId();
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_markup_snapshots")
						.select("*")
						.eq("project_id", normalizedProjectId)
						.eq("user_id", userId)
						.order("updated_at", { ascending: false }),
				"ProjectMarkupSnapshotService",
			);
			if (result.data) {
				const normalized = sortSnapshots(
					(result.data as ProjectMarkupSnapshotRow[]).map((row) =>
						fromSnapshotRow(row),
					),
				);
				writeLocalSnapshots(normalizedProjectId, normalized);
				return { data: normalized, error: null };
			}
			if (result.error && !isMissingMarkupSnapshotTable(result.error)) {
				return {
					data: localFallback,
					error: new Error(
						String(
							result.error.message || "Unable to load project markup snapshots.",
						),
					),
				};
			}
		}

		try {
			const stored = await loadSetting<unknown>(
				MARKUP_SNAPSHOT_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			if (!Array.isArray(stored)) {
				return {
					data: localFallback,
					error: new Error("Stored project markup snapshots are invalid."),
				};
			}
			const normalized = sortSnapshots(
				stored
					.map((entry) => normalizeRow(entry))
					.filter(
						(entry): entry is ProjectMarkupSnapshotRecord => entry !== null,
					),
			);
			writeLocalSnapshots(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load project markup snapshots."),
			};
		}
	},

	async saveSnapshot(input: ProjectMarkupSnapshotInput): Promise<{
		data: ProjectMarkupSnapshotRecord | null;
		error: Error | null;
	}> {
		const projectId = normalizeText(input.projectId);
		const drawingPath = normalizeText(input.drawingPath);
		if (!projectId || !drawingPath) {
			return {
				data: null,
				error: new Error("Project id and drawing path are required."),
			};
		}

		const now = new Date().toISOString();
		const record: ProjectMarkupSnapshotRecord = {
			id: createId(),
			projectId,
			issueSetId: normalizeNullableText(input.issueSetId),
			drawingPath,
			drawingName: normalizeNullableText(input.drawingName),
			sourcePdfName: normalizeText(input.sourcePdfName) || "Marked drawing.pdf",
			pageIndex: Math.max(0, Number(input.pageIndex || 0)),
			contractVersion:
				normalizeText(input.contractVersion) || DEFAULT_CONTRACT_VERSION,
			preparePayload: normalizeJsonRecord(input.preparePayload),
			comparePayload: normalizeJsonRecord(input.comparePayload),
			selectedActionIds: normalizeStringArray(input.selectedActionIds),
			selectedOperationIds: normalizeStringArray(input.selectedOperationIds),
			reviewedBundleJson: normalizeJsonRecord(input.reviewedBundleJson),
			revisionContext: isRecord(input.revisionContext)
				? input.revisionContext
				: null,
			warnings: normalizeStringArray(input.warnings),
			createdAt: now,
			updatedAt: now,
		};

		const existing = await this.fetchSnapshots(projectId);
		const nextEntries = [record, ...existing.data];
		writeLocalSnapshots(projectId, nextEntries);

		const userId = await getCurrentUserId();
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_markup_snapshots")
						.upsert(toSnapshotRow(record, userId), { onConflict: "id" })
						.select("*")
						.maybeSingle(),
				"ProjectMarkupSnapshotService",
			);
			if (result.data) {
				const saved = fromSnapshotRow(result.data as ProjectMarkupSnapshotRow);
				writeLocalSnapshots(
					projectId,
					[saved, ...existing.data.filter((entry) => entry.id !== saved.id)],
				);
				return { data: saved, error: null };
			}
			if (result.error && !isMissingMarkupSnapshotTable(result.error)) {
				const persistError = await persistLocalSnapshots(projectId, nextEntries);
				return {
					data: record,
					error:
						persistError ||
						new Error(
							String(
								result.error.message ||
									"Unable to persist project markup snapshot.",
							),
						),
				};
			}
		}

		const persistError = await persistLocalSnapshots(projectId, nextEntries);
		return {
			data: record,
			error: persistError,
		};
	},
};
