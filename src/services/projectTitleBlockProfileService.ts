import { logger } from "@/lib/logger";
import { looksLikeUuid } from "@/lib/uuid";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { safeSupabaseQuery } from "@/supabase/utils";

export type ProjectTitleBlockProfileRow =
	Database["public"]["Tables"]["project_title_block_profiles"]["Row"];
export type ProjectTitleBlockProfileInsert =
	Database["public"]["Tables"]["project_title_block_profiles"]["Insert"];
export type ProjectTitleBlockProfileUpdate =
	Database["public"]["Tables"]["project_title_block_profiles"]["Update"];

export interface ProjectTitleBlockProfileInput {
	projectId: string;
	blockName?: string;
	projectRootPath?: string | null;
	acadeProjectFilePath?: string | null;
	acadeLine1?: string;
	acadeLine2?: string;
	acadeLine4?: string;
	signerDrawnBy?: string;
	signerCheckedBy?: string;
	signerEngineer?: string;
}

interface FetchProfileDefaults {
	projectRootPath?: string | null;
}

const LOCAL_STORAGE_KEY = "suite:project-title-block-profiles:local";
export const DEFAULT_PROJECT_TITLE_BLOCK_NAME = "R3P-24x36BORDER&TITLE";

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `title-block-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function normalizeText(value: string | null | undefined) {
	return String(value || "").trim();
}

function isMissingAcadeProjectFilePathColumn(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error && "message" in error
				? String((error as { message?: unknown }).message || "")
				: String(error || "");
	const normalized = message.toLowerCase();
	return (
		normalized.includes("acade_project_file_path") &&
		(normalized.includes("column") ||
			normalized.includes("schema cache") ||
			normalized.includes("not found") ||
			normalized.includes("does not exist"))
	);
}

function readLocalProfiles(): ProjectTitleBlockProfileRow[] {
	if (typeof localStorage === "undefined") {
		return [];
	}

	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? (parsed.filter(
					(entry) => entry && typeof entry === "object",
				) as ProjectTitleBlockProfileRow[])
			: [];
	} catch {
		return [];
	}
}

function writeLocalProfiles(entries: ProjectTitleBlockProfileRow[]) {
	if (typeof localStorage === "undefined") {
		return;
	}

	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
	} catch (error) {
		logger.warn(
			"ProjectTitleBlockProfileService",
			"Unable to persist local title block profiles",
			{ error },
		);
	}
}

function buildDefaultProfile(
	projectId: string,
	userId: string | null,
	defaults?: FetchProfileDefaults,
): ProjectTitleBlockProfileRow {
	const timestamp = new Date().toISOString();
	return {
		id: createId(),
		project_id: normalizeText(projectId),
		user_id: userId ?? "local",
		block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
		project_root_path: normalizeText(defaults?.projectRootPath) || null,
		acade_project_file_path: null,
		acade_line1: "",
		acade_line2: "",
		acade_line4: "",
		signer_drawn_by: "",
		signer_checked_by: "",
		signer_engineer: "",
		created_at: timestamp,
		updated_at: timestamp,
	};
}

async function getCurrentUserId(): Promise<string | null> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		return null;
	}
	return user.id;
}

function mergeProfileDefaults(
	profile: ProjectTitleBlockProfileRow,
	defaults?: FetchProfileDefaults,
): ProjectTitleBlockProfileRow {
	if (profile.project_root_path || !defaults?.projectRootPath) {
		return profile;
	}
	return {
		...profile,
		project_root_path: normalizeText(defaults.projectRootPath) || null,
	};
}

export const projectTitleBlockProfileService = {
	async fetchProfile(
		projectId: string,
		defaults?: FetchProfileDefaults,
	): Promise<{ data: ProjectTitleBlockProfileRow; error: Error | null }> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: buildDefaultProfile("", null, defaults),
				error: new Error("Project id is required."),
			};
		}

		const userId = await getCurrentUserId();
		if (!looksLikeUuid(normalizedProjectId)) {
			const localProfile =
				readLocalProfiles().find(
					(entry) => entry.project_id === normalizedProjectId,
				) ?? buildDefaultProfile(normalizedProjectId, userId, defaults);
			return {
				data: mergeProfileDefaults(localProfile, defaults),
				error: null,
			};
		}
		if (!userId) {
			const localProfile =
				readLocalProfiles().find(
					(entry) => entry.project_id === normalizedProjectId,
				) ?? buildDefaultProfile(normalizedProjectId, null, defaults);
			return {
				data: mergeProfileDefaults(localProfile, defaults),
				error: null,
			};
		}

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("project_title_block_profiles")
					.select("*")
					.eq("project_id", normalizedProjectId)
					.eq("user_id", userId)
					.maybeSingle(),
			"ProjectTitleBlockProfileService",
		);

		if (result.data) {
			return {
				data: mergeProfileDefaults(
					result.data as ProjectTitleBlockProfileRow,
					defaults,
				),
				error: null,
			};
		}

		const localProfile =
			readLocalProfiles().find(
				(entry) => entry.project_id === normalizedProjectId,
			) ?? buildDefaultProfile(normalizedProjectId, userId, defaults);
		if (result.error) {
			const message = String(result.error.message || "").toLowerCase();
			if (
				message.includes("project_title_block_profiles") &&
				(message.includes("does not exist") ||
					message.includes("not found") ||
					message.includes("could not find"))
			) {
				logger.warn(
					"ProjectTitleBlockProfileService",
					"Hosted title block profile storage is unavailable; using local fallback.",
					{
						projectId: normalizedProjectId,
						userId,
						error: result.error.message,
					},
				);
				return {
					data: mergeProfileDefaults(localProfile, defaults),
					error: null,
				};
			}
			return {
				data: mergeProfileDefaults(localProfile, defaults),
				error: new Error(
					String(result.error.message || "Failed to load title block profile."),
				),
			};
		}

		return {
			data: mergeProfileDefaults(localProfile, defaults),
			error: null,
		};
	},

	async upsertProfile(
		input: ProjectTitleBlockProfileInput,
	): Promise<ProjectTitleBlockProfileRow | null> {
		const normalizedProjectId = normalizeText(input.projectId);
		if (!normalizedProjectId) {
			return null;
		}

		const userId = await getCurrentUserId();
		const payloadBase = {
			project_id: normalizedProjectId,
			block_name:
				normalizeText(input.blockName) || DEFAULT_PROJECT_TITLE_BLOCK_NAME,
			project_root_path: normalizeText(input.projectRootPath) || null,
			acade_project_file_path:
				normalizeText(input.acadeProjectFilePath) || null,
			acade_line1: normalizeText(input.acadeLine1),
			acade_line2: normalizeText(input.acadeLine2),
			acade_line4: normalizeText(input.acadeLine4),
			signer_drawn_by: normalizeText(input.signerDrawnBy),
			signer_checked_by: normalizeText(input.signerCheckedBy),
			signer_engineer: normalizeText(input.signerEngineer),
		};

		if (!userId) {
			const current = readLocalProfiles();
			const existing = current.find(
				(entry) => entry.project_id === normalizedProjectId,
			);
			const nextEntry: ProjectTitleBlockProfileRow = {
				...(existing ?? buildDefaultProfile(normalizedProjectId, null)),
				...payloadBase,
				updated_at: new Date().toISOString(),
			};
			const next = existing
				? current.map((entry) =>
						entry.project_id === normalizedProjectId ? nextEntry : entry,
					)
				: [nextEntry, ...current];
			writeLocalProfiles(next);
			return nextEntry;
		}

		const payload: ProjectTitleBlockProfileInsert = {
			...payloadBase,
			user_id: userId,
		};

		const runUpsert = (nextPayload: ProjectTitleBlockProfileInsert) =>
			safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_title_block_profiles")
						.upsert(nextPayload, { onConflict: "project_id" })
						.select("*")
						.maybeSingle(),
				"ProjectTitleBlockProfileService",
			);

		let result = await runUpsert(payload);
		if (result.error && isMissingAcadeProjectFilePathColumn(result.error)) {
			logger.warn(
				"ProjectTitleBlockProfileService",
				"Hosted title block profile storage is missing acade_project_file_path; retrying with the legacy payload.",
				{
					projectId: normalizedProjectId,
					userId,
					error:
						result.error instanceof Error
							? result.error.message
							: String(result.error),
				},
			);
			const legacyPayload = { ...payload };
			delete legacyPayload.acade_project_file_path;
			result = await runUpsert(legacyPayload);
		}

		if (result.data) {
			return result.data as ProjectTitleBlockProfileRow;
		}

		const current = readLocalProfiles();
		const existing = current.find(
			(entry) => entry.project_id === normalizedProjectId,
		);
		const fallback: ProjectTitleBlockProfileRow = {
			...(existing ?? buildDefaultProfile(normalizedProjectId, userId)),
			...payloadBase,
			user_id: userId,
			updated_at: new Date().toISOString(),
		};
		const next = existing
			? current.map((entry) =>
					entry.project_id === normalizedProjectId ? fallback : entry,
				)
			: [fallback, ...current];
		writeLocalProfiles(next);
		return fallback;
	},
};
