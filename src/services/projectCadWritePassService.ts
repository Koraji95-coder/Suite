import { getLocalStorageApi } from "@/lib/browserStorage";
import { logger } from "@/lib/logger";
import { getCurrentSupabaseUserId } from "@/services/projectWorkflowClientSupport";
import { loadSetting, saveSetting } from "@/settings/userSettings";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import { safeSupabaseQuery } from "@/supabase/utils";

export type ProjectCadWritePassRow =
	Database["public"]["Tables"]["project_cad_write_passes"]["Row"];
export type ProjectCadWritePassInsert =
	Database["public"]["Tables"]["project_cad_write_passes"]["Insert"];

export interface ProjectCadWritePassRecord {
	id: string;
	projectId: string;
	runId: string | null;
	snapshotId: string | null;
	drawingPath: string;
	writerKind: string;
	operationType: string;
	managedKey: string | null;
	handleRefs: string[];
	beforeJson: Record<string, unknown> | null;
	afterJson: Record<string, unknown> | null;
	status: string;
	warnings: string[];
	artifactRefs: Record<string, unknown>[];
	createdAt: string;
	updatedAt: string;
}

export interface ProjectCadWritePassInput {
	projectId: string;
	runId?: string | null;
	snapshotId?: string | null;
	drawingPath: string;
	writerKind: string;
	operationType: string;
	managedKey?: string | null;
	handleRefs?: string[];
	beforeJson?: Record<string, unknown> | null;
	afterJson?: Record<string, unknown> | null;
	status?: string;
	warnings?: string[];
	artifactRefs?: Record<string, unknown>[];
}

const PASS_SETTING_KEY = "project_cad_write_passes_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-cad-write-passes";

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `cad-write-pass-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function normalizeArtifactRefs(value: unknown) {
	if (!Array.isArray(value)) {
		return [] as Record<string, unknown>[];
	}
	return value.filter((entry): entry is Record<string, unknown> =>
		isRecord(entry),
	);
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function normalizePass(value: unknown): ProjectCadWritePassRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectCadWritePassRecord>;
	const projectId = normalizeText(candidate.projectId);
	const drawingPath = normalizeText(candidate.drawingPath);
	const operationType = normalizeText(candidate.operationType);
	if (!projectId || !drawingPath || !operationType) {
		return null;
	}
	const createdAt =
		normalizeNullableText(candidate.createdAt) || new Date().toISOString();
	const updatedAt = normalizeNullableText(candidate.updatedAt) || createdAt;
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		runId: normalizeNullableText(candidate.runId),
		snapshotId: normalizeNullableText(candidate.snapshotId),
		drawingPath,
		writerKind: normalizeText(candidate.writerKind) || "autodraft",
		operationType,
		managedKey: normalizeNullableText(candidate.managedKey),
		handleRefs: normalizeStringArray(candidate.handleRefs),
		beforeJson: isRecord(candidate.beforeJson) ? candidate.beforeJson : null,
		afterJson: isRecord(candidate.afterJson) ? candidate.afterJson : null,
		status: normalizeText(candidate.status) || "applied",
		warnings: normalizeStringArray(candidate.warnings),
		artifactRefs: normalizeArtifactRefs(candidate.artifactRefs),
		createdAt,
		updatedAt,
	};
}

function fromRow(row: ProjectCadWritePassRow): ProjectCadWritePassRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		runId: row.run_id,
		snapshotId: row.snapshot_id,
		drawingPath: row.drawing_path,
		writerKind: row.writer_kind,
		operationType: row.operation_type,
		managedKey: row.managed_key,
		handleRefs: normalizeStringArray(row.handle_refs),
		beforeJson: isRecord(row.before_json) ? row.before_json : null,
		afterJson: isRecord(row.after_json) ? row.after_json : null,
		status: row.status,
		warnings: normalizeStringArray(row.warnings),
		artifactRefs: normalizeArtifactRefs(row.artifact_refs),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toInsert(
	record: ProjectCadWritePassRecord,
	userId: string,
): ProjectCadWritePassInsert {
	return {
		id: record.id,
		project_id: record.projectId,
		run_id: record.runId,
		snapshot_id: record.snapshotId,
		drawing_path: record.drawingPath,
		writer_kind: record.writerKind,
		operation_type: record.operationType,
		managed_key: record.managedKey,
		handle_refs: record.handleRefs,
		before_json: (record.beforeJson ?? null) as Json,
		after_json: (record.afterJson ?? null) as Json,
		status: record.status,
		warnings: record.warnings,
		artifact_refs: record.artifactRefs as Json,
		user_id: userId,
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

function sortPasses(entries: ProjectCadWritePassRecord[]) {
	return [...entries].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function readLocalPasses(projectId: string) {
	const storage = getLocalStorageApi();
	if (!storage) return [] as ProjectCadWritePassRecord[];
	try {
		const raw = storage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return [] as ProjectCadWritePassRecord[];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [] as ProjectCadWritePassRecord[];
		}
		return sortPasses(
			parsed
				.map((entry) => normalizePass(entry))
				.filter((entry): entry is ProjectCadWritePassRecord => entry !== null),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local CAD write passes.",
			"ProjectCadWritePassService",
			error,
		);
		return [] as ProjectCadWritePassRecord[];
	}
}

function writeLocalPasses(
	projectId: string,
	entries: ProjectCadWritePassRecord[],
) {
	const storage = getLocalStorageApi();
	if (!storage) return;
	try {
		storage.setItem(
			buildLocalStorageKey(projectId),
			JSON.stringify(sortPasses(entries)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local CAD write passes.",
			"ProjectCadWritePassService",
			error,
		);
	}
}

async function getCurrentUserId() {
	try {
		return await getCurrentSupabaseUserId();
	} catch {
		return null;
	}
}

function isMissingPassTable(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error && "message" in error
				? String((error as { message?: unknown }).message || "")
				: String(error || "");
	const normalized = message.toLowerCase();
	return (
		normalized.includes("project_cad_write_passes") &&
		(normalized.includes("does not exist") ||
			normalized.includes("not found") ||
			normalized.includes("schema cache"))
	);
}

async function persistLocalPasses(
	projectId: string,
	entries: ProjectCadWritePassRecord[],
) {
	const sorted = sortPasses(entries);
	const result = await saveSetting(PASS_SETTING_KEY, sorted, projectId);
	writeLocalPasses(projectId, sorted);
	if (!result.success) {
		return new Error(result.error || "Unable to persist CAD write passes.");
	}
	return null;
}

export const projectCadWritePassService = {
	async fetchPasses(projectId: string): Promise<{
		data: ProjectCadWritePassRecord[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const localFallback = readLocalPasses(normalizedProjectId);
		const userId = await getCurrentUserId();
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_cad_write_passes")
						.select("*")
						.eq("project_id", normalizedProjectId)
						.eq("user_id", userId)
						.order("updated_at", { ascending: false }),
				"ProjectCadWritePassService",
			);
			if (result.data) {
				const normalized = sortPasses(
					(result.data as ProjectCadWritePassRow[]).map((row) => fromRow(row)),
				);
				writeLocalPasses(normalizedProjectId, normalized);
				return { data: normalized, error: null };
			}
			if (result.error && !isMissingPassTable(result.error)) {
				return {
					data: localFallback,
					error: new Error(
						String(result.error.message || "Unable to load CAD write passes."),
					),
				};
			}
		}

		try {
			const stored = await loadSetting<unknown>(
				PASS_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			if (!Array.isArray(stored)) {
				return {
					data: localFallback,
					error: new Error("Stored CAD write pass data is invalid."),
				};
			}
			const normalized = sortPasses(
				stored
					.map((entry) => normalizePass(entry))
					.filter(
						(entry): entry is ProjectCadWritePassRecord => entry !== null,
					),
			);
			writeLocalPasses(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load CAD write passes."),
			};
		}
	},

	async savePasses(inputs: ProjectCadWritePassInput[]): Promise<{
		data: ProjectCadWritePassRecord[];
		error: Error | null;
	}> {
		if (!Array.isArray(inputs) || inputs.length === 0) {
			return { data: [], error: null };
		}
		const projectId = normalizeText(inputs[0]?.projectId);
		if (!projectId) {
			return { data: [], error: new Error("Project id is required.") };
		}

		const now = new Date().toISOString();
		const records = inputs
			.map((input) =>
				normalizePass({
					id: createId(),
					projectId,
					runId: normalizeNullableText(input.runId),
					snapshotId: normalizeNullableText(input.snapshotId),
					drawingPath: normalizeText(input.drawingPath),
					writerKind: normalizeText(input.writerKind) || "autodraft",
					operationType: normalizeText(input.operationType),
					managedKey: normalizeNullableText(input.managedKey),
					handleRefs: normalizeStringArray(input.handleRefs),
					beforeJson: isRecord(input.beforeJson) ? input.beforeJson : null,
					afterJson: isRecord(input.afterJson) ? input.afterJson : null,
					status: normalizeText(input.status) || "applied",
					warnings: normalizeStringArray(input.warnings),
					artifactRefs: normalizeArtifactRefs(input.artifactRefs),
					createdAt: now,
					updatedAt: now,
				}),
			)
			.filter((entry): entry is ProjectCadWritePassRecord => entry !== null);
		if (records.length === 0) {
			return {
				data: [],
				error: new Error("No valid CAD write passes were supplied."),
			};
		}

		const existing = await this.fetchPasses(projectId);
		const nextEntries = [...records, ...existing.data];
		writeLocalPasses(projectId, nextEntries);

		const userId = await getCurrentUserId();
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_cad_write_passes")
						.upsert(records.map((record) => toInsert(record, userId)))
						.select("*"),
				"ProjectCadWritePassService",
			);
			if (result.data) {
				const saved = (result.data as ProjectCadWritePassRow[]).map((row) =>
					fromRow(row),
				);
				writeLocalPasses(projectId, [
					...saved,
					...existing.data.filter(
						(entry) => !saved.some((next) => next.id === entry.id),
					),
				]);
				return { data: saved, error: null };
			}
			if (result.error && !isMissingPassTable(result.error)) {
				const persistError = await persistLocalPasses(projectId, nextEntries);
				return {
					data: records,
					error:
						persistError ||
						new Error(
							String(
								result.error.message || "Unable to persist CAD write passes.",
							),
						),
				};
			}
		}

		const persistError = await persistLocalPasses(projectId, nextEntries);
		return {
			data: records,
			error: persistError,
		};
	},
};
