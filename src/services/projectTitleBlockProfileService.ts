import { projectSetupBackendService } from "@/features/project-setup";
import { getLocalStorageApi } from "@/lib/browserStorage";
import { localId } from "@/lib/localId";
import { logger } from "@/lib/logger";
import { looksLikeUuid } from "@/lib/uuid";
import { getCurrentSupabaseUserId } from "@/services/projectWorkflowClientSupport";
import type { Database } from "@/supabase/database";

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

const createId = () => localId();

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
	const storage = getLocalStorageApi();
	if (!storage) return [];

	try {
		const raw = storage.getItem(LOCAL_STORAGE_KEY);
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
	const storage = getLocalStorageApi();
	if (!storage) return;

	try {
		storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
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
	try {
		return await getCurrentSupabaseUserId();
	} catch {
		return null;
	}
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

		const result = await projectSetupBackendService.fetchProfile({
			projectId: normalizedProjectId,
			projectRootPath: defaults?.projectRootPath ?? null,
		});

		if (result.data && result.data.project_id) {
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

		try {
			return (await projectSetupBackendService.saveProfile(
				normalizedProjectId,
				{
					...payloadBase,
					userId,
				},
			)) as ProjectTitleBlockProfileRow;
		} catch (error) {
			if (isMissingAcadeProjectFilePathColumn(error)) {
				logger.warn(
					"ProjectTitleBlockProfileService",
					"Hosted title block profile storage is missing acade_project_file_path; retrying with the legacy payload.",
					{
						projectId: normalizedProjectId,
						userId,
						error: error instanceof Error ? error.message : String(error),
					},
				);
				return (await projectSetupBackendService.saveProfile(
					normalizedProjectId,
					{
						projectId: normalizedProjectId,
						blockName: payloadBase.block_name,
						projectRootPath: payloadBase.project_root_path,
						acadeLine1: payloadBase.acade_line1,
						acadeLine2: payloadBase.acade_line2,
						acadeLine4: payloadBase.acade_line4,
						signerDrawnBy: payloadBase.signer_drawn_by,
						signerCheckedBy: payloadBase.signer_checked_by,
						signerEngineer: payloadBase.signer_engineer,
					},
				)) as ProjectTitleBlockProfileRow;
			}
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
