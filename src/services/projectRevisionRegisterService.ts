import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { safeSupabaseQuery } from "@/supabase/utils";
import {
	DEFAULT_DISCIPLINES,
	DEFAULT_SHEET_TYPES,
	parseFileName,
} from "@/components/apps/drawing-list-manager/drawingListManagerModels";

export type DrawingRevisionRegisterRow =
	Database["public"]["Tables"]["drawing_revision_register_entries"]["Row"];
export type DrawingRevisionRegisterInsert =
	Database["public"]["Tables"]["drawing_revision_register_entries"]["Insert"];
export type DrawingRevisionRegisterUpdate =
	Database["public"]["Tables"]["drawing_revision_register_entries"]["Update"];
export type RevisionRegisterProjectFile =
	Database["public"]["Tables"]["files"]["Row"];

export type DrawingRevisionIssueStatus = "open" | "in-review" | "resolved";
export type DrawingRevisionSeverity = "low" | "medium" | "high" | "critical";
export type DrawingRevisionSourceKind =
	| "manual"
	| "file"
	| "autodraft"
	| "transmittal";

export interface DrawingRevisionRegisterInput {
	projectId: string;
	fileId?: string | null;
	drawingNumber?: string;
	title?: string;
	revision?: string;
	previousRevision?: string | null;
	issueSummary?: string;
	issueStatus?: DrawingRevisionIssueStatus;
	issueSeverity?: DrawingRevisionSeverity;
	sourceKind?: DrawingRevisionSourceKind;
	sourceRef?: string | null;
	autodraftRequestId?: string | null;
	transmittalNumber?: string | null;
	transmittalDocumentName?: string | null;
	notes?: string | null;
}

export interface AutoDraftExecutionTraceInput {
	projectId: string;
	fileId?: string | null;
	drawingNumber?: string;
	title?: string;
	revision?: string;
	previousRevision?: string | null;
	issueSummary?: string;
	notes?: string | null;
	requestId: string;
	sourceRef?: string | null;
	status?: string | null;
	accepted?: number;
	skipped?: number;
}

const LOCAL_STORAGE_KEY = "suite:project-revision-register:local";

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `revision-register-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function normalizeIssueStatus(
	value: string | null | undefined,
): DrawingRevisionIssueStatus {
	switch (String(value || "").trim().toLowerCase()) {
		case "resolved":
			return "resolved";
		case "in-review":
		case "in_review":
			return "in-review";
		default:
			return "open";
	}
}

function normalizeSeverity(
	value: string | null | undefined,
): DrawingRevisionSeverity {
	switch (String(value || "").trim().toLowerCase()) {
		case "low":
			return "low";
		case "high":
			return "high";
		case "critical":
			return "critical";
		default:
			return "medium";
	}
}

function normalizeSourceKind(
	value: string | null | undefined,
): DrawingRevisionSourceKind {
	switch (String(value || "").trim().toLowerCase()) {
		case "file":
			return "file";
		case "autodraft":
			return "autodraft";
		case "transmittal":
			return "transmittal";
		default:
			return "manual";
	}
}

function normalizeText(value: string | null | undefined) {
	return String(value || "").trim();
}

function readLocalEntries(): DrawingRevisionRegisterRow[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? (parsed.filter((entry) => entry && typeof entry === "object") as DrawingRevisionRegisterRow[])
			: [];
	} catch {
		return [];
	}
}

function writeLocalEntries(entries: DrawingRevisionRegisterRow[]) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
	} catch (error) {
		logger.warn(
			"ProjectRevisionRegisterService",
			"Unable to persist local drawing revision register",
			{ error },
		);
	}
}

function buildLocalEntry(
	input: DrawingRevisionRegisterInput,
	userId: string | null,
): DrawingRevisionRegisterRow {
	const timestamp = new Date().toISOString();
	return {
		id: createId(),
		project_id: input.projectId,
		file_id: input.fileId ?? null,
		drawing_number: normalizeText(input.drawingNumber),
		title: normalizeText(input.title),
		revision: normalizeText(input.revision),
		previous_revision: normalizeText(input.previousRevision) || null,
		issue_summary: normalizeText(input.issueSummary),
		issue_status: normalizeIssueStatus(input.issueStatus),
		issue_severity: normalizeSeverity(input.issueSeverity),
		source_kind: normalizeSourceKind(input.sourceKind),
		source_ref: normalizeText(input.sourceRef) || null,
		autodraft_request_id: normalizeText(input.autodraftRequestId) || null,
		transmittal_number: normalizeText(input.transmittalNumber) || null,
		transmittal_document_name:
			normalizeText(input.transmittalDocumentName) || null,
		notes: normalizeText(input.notes) || null,
		user_id: userId ?? "local",
		created_at: timestamp,
		updated_at: timestamp,
	};
}

function normalizeRow(
	row: DrawingRevisionRegisterRow,
): DrawingRevisionRegisterRow {
	return {
		...row,
		issue_status: normalizeIssueStatus(row.issue_status),
		issue_severity: normalizeSeverity(row.issue_severity),
		source_kind: normalizeSourceKind(row.source_kind),
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

function buildImportDraft(
	projectId: string,
	file: RevisionRegisterProjectFile,
): DrawingRevisionRegisterInput {
	const parsed = parseFileName(file.name, {
		projectNumber: "",
		revisionDefault: "A",
		enforceProjectCode: false,
		allowedDisciplines: DEFAULT_DISCIPLINES,
		allowedSheetTypes: DEFAULT_SHEET_TYPES,
	});

	const drawingNumber =
		parsed.drawingNumber === "Unparsed" ? "" : normalizeText(parsed.drawingNumber);
	const issueSummary =
		parsed.issues.length > 0
			? parsed.issues.join("; ")
			: "Imported from project file.";
	const issueSeverity: DrawingRevisionSeverity = parsed.issues.includes(
		"Missing revision",
	)
		? "high"
		: parsed.issues.length > 0
			? "medium"
			: "low";

	return {
		projectId,
		fileId: file.id,
		drawingNumber,
		title: parsed.title || file.name.replace(/\.[^/.]+$/, ""),
		revision: normalizeText(parsed.revision),
		previousRevision: null,
		issueSummary,
		issueStatus: "open",
		issueSeverity,
		sourceKind: "file",
		sourceRef: file.file_path,
		notes: parsed.issues.length > 0 ? parsed.issues.join("; ") : null,
	};
}

export const projectRevisionRegisterService = {
	async fetchEntries(projectId: string): Promise<{
		data: DrawingRevisionRegisterRow[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: readLocalEntries()
					.filter((entry) => entry.project_id === normalizedProjectId)
					.map(normalizeRow)
					.sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
				error: null,
			};
		}

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("drawing_revision_register_entries")
					.select("*")
					.eq("project_id", normalizedProjectId)
					.eq("user_id", userId)
					.order("updated_at", { ascending: false }),
			"ProjectRevisionRegisterService",
		);

		const localFallback = readLocalEntries()
			.filter((entry) => entry.project_id === normalizedProjectId)
			.map(normalizeRow)
			.sort((left, right) => right.updated_at.localeCompare(left.updated_at));

		if (result.error) {
			const message = String(result.error.message || "").toLowerCase();
			if (
				message.includes("drawing_revision_register_entries") &&
				(message.includes("does not exist") ||
					message.includes("not found") ||
					message.includes("could not find"))
			) {
				return {
					data: localFallback,
					error: new Error(
						"Supabase schema is missing `drawing_revision_register_entries`. Apply the latest consolidated migration to enable hosted revision register storage.",
					),
				};
			}
			return {
				data: localFallback,
				error: new Error(String(result.error.message || "Failed to load revisions.")),
			};
		}

		return {
			data: ((result.data ?? []) as DrawingRevisionRegisterRow[]).map(normalizeRow),
			error: null,
		};
	},

	async createEntry(
		input: DrawingRevisionRegisterInput,
	): Promise<DrawingRevisionRegisterRow | null> {
		const normalizedProjectId = normalizeText(input.projectId);
		if (!normalizedProjectId) {
			return null;
		}

		const userId = await getCurrentUserId();
		if (!userId) {
			const localEntry = buildLocalEntry(input, null);
			const current = readLocalEntries();
			writeLocalEntries([localEntry, ...current]);
			return normalizeRow(localEntry);
		}

		const payload: DrawingRevisionRegisterInsert = {
			project_id: normalizedProjectId,
			file_id: input.fileId ?? null,
			drawing_number: normalizeText(input.drawingNumber),
			title: normalizeText(input.title),
			revision: normalizeText(input.revision),
			previous_revision: normalizeText(input.previousRevision) || null,
			issue_summary: normalizeText(input.issueSummary),
			issue_status: normalizeIssueStatus(input.issueStatus),
			issue_severity: normalizeSeverity(input.issueSeverity),
			source_kind: normalizeSourceKind(input.sourceKind),
			source_ref: normalizeText(input.sourceRef) || null,
			autodraft_request_id: normalizeText(input.autodraftRequestId) || null,
			transmittal_number: normalizeText(input.transmittalNumber) || null,
			transmittal_document_name:
				normalizeText(input.transmittalDocumentName) || null,
			notes: normalizeText(input.notes) || null,
			user_id: userId,
		};

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("drawing_revision_register_entries")
					.insert(payload)
					.select("*")
					.maybeSingle(),
			"ProjectRevisionRegisterService",
		);

		if (result.data) {
			return normalizeRow(result.data as DrawingRevisionRegisterRow);
		}

		const fallback = buildLocalEntry(input, userId);
		return normalizeRow(fallback);
	},

	async updateEntry(
		entryId: string,
		patch: Partial<DrawingRevisionRegisterInput>,
	): Promise<DrawingRevisionRegisterRow | null> {
		const normalizedId = normalizeText(entryId);
		if (!normalizedId) {
			return null;
		}

		const userId = await getCurrentUserId();
		if (!userId) {
			const current = readLocalEntries();
			const next = current.map((entry) =>
				entry.id === normalizedId
					? {
							...entry,
							file_id:
								patch.fileId === undefined ? entry.file_id : patch.fileId ?? null,
							drawing_number:
								patch.drawingNumber === undefined
									? entry.drawing_number
									: normalizeText(patch.drawingNumber),
							title:
								patch.title === undefined ? entry.title : normalizeText(patch.title),
							revision:
								patch.revision === undefined
									? entry.revision
									: normalizeText(patch.revision),
							previous_revision:
								patch.previousRevision === undefined
									? entry.previous_revision
									: normalizeText(patch.previousRevision) || null,
							issue_summary:
								patch.issueSummary === undefined
									? entry.issue_summary
									: normalizeText(patch.issueSummary),
							issue_status:
								patch.issueStatus === undefined
									? entry.issue_status
									: normalizeIssueStatus(patch.issueStatus),
							issue_severity:
								patch.issueSeverity === undefined
									? entry.issue_severity
									: normalizeSeverity(patch.issueSeverity),
							source_kind:
								patch.sourceKind === undefined
									? entry.source_kind
									: normalizeSourceKind(patch.sourceKind),
							source_ref:
								patch.sourceRef === undefined
									? entry.source_ref
									: normalizeText(patch.sourceRef) || null,
							autodraft_request_id:
								patch.autodraftRequestId === undefined
									? entry.autodraft_request_id
									: normalizeText(patch.autodraftRequestId) || null,
							transmittal_number:
								patch.transmittalNumber === undefined
									? entry.transmittal_number
									: normalizeText(patch.transmittalNumber) || null,
							transmittal_document_name:
								patch.transmittalDocumentName === undefined
									? entry.transmittal_document_name
									: normalizeText(patch.transmittalDocumentName) || null,
							notes:
								patch.notes === undefined
									? entry.notes
									: normalizeText(patch.notes) || null,
							updated_at: new Date().toISOString(),
						}
					: entry,
			);
			writeLocalEntries(next);
			const updated = next.find((entry) => entry.id === normalizedId) ?? null;
			return updated ? normalizeRow(updated) : null;
		}

		const payload: DrawingRevisionRegisterUpdate = {
			file_id: patch.fileId,
			drawing_number:
				patch.drawingNumber === undefined
					? undefined
					: normalizeText(patch.drawingNumber),
			title: patch.title === undefined ? undefined : normalizeText(patch.title),
			revision:
				patch.revision === undefined ? undefined : normalizeText(patch.revision),
			previous_revision:
				patch.previousRevision === undefined
					? undefined
					: normalizeText(patch.previousRevision) || null,
			issue_summary:
				patch.issueSummary === undefined
					? undefined
					: normalizeText(patch.issueSummary),
			issue_status:
				patch.issueStatus === undefined
					? undefined
					: normalizeIssueStatus(patch.issueStatus),
			issue_severity:
				patch.issueSeverity === undefined
					? undefined
					: normalizeSeverity(patch.issueSeverity),
			source_kind:
				patch.sourceKind === undefined
					? undefined
					: normalizeSourceKind(patch.sourceKind),
			source_ref:
				patch.sourceRef === undefined
					? undefined
					: normalizeText(patch.sourceRef) || null,
			autodraft_request_id:
				patch.autodraftRequestId === undefined
					? undefined
					: normalizeText(patch.autodraftRequestId) || null,
			transmittal_number:
				patch.transmittalNumber === undefined
					? undefined
					: normalizeText(patch.transmittalNumber) || null,
			transmittal_document_name:
				patch.transmittalDocumentName === undefined
					? undefined
					: normalizeText(patch.transmittalDocumentName) || null,
			notes:
				patch.notes === undefined
					? undefined
					: normalizeText(patch.notes) || null,
		};

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("drawing_revision_register_entries")
					.update(payload)
					.eq("id", normalizedId)
					.eq("user_id", userId)
					.select("*")
					.maybeSingle(),
			"ProjectRevisionRegisterService",
		);

		if (result.data) {
			return normalizeRow(result.data as DrawingRevisionRegisterRow);
		}

		return null;
	},

	async deleteEntry(entryId: string): Promise<boolean> {
		const normalizedId = normalizeText(entryId);
		if (!normalizedId) {
			return false;
		}
		const userId = await getCurrentUserId();
		if (!userId) {
			const current = readLocalEntries();
			const next = current.filter((entry) => entry.id !== normalizedId);
			writeLocalEntries(next);
			return next.length !== current.length;
		}

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("drawing_revision_register_entries")
					.delete()
					.eq("id", normalizedId)
					.eq("user_id", userId),
			"ProjectRevisionRegisterService",
		);
		return !result.error;
	},

	buildImportDrafts(
		projectId: string,
		files: RevisionRegisterProjectFile[],
		existingEntries: DrawingRevisionRegisterRow[],
	): DrawingRevisionRegisterInput[] {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) return [];
		const existingFileIds = new Set(
			existingEntries
				.map((entry) => normalizeText(entry.file_id))
				.filter(Boolean),
		);
		return files
			.filter((file) => !existingFileIds.has(file.id))
			.map((file) => buildImportDraft(normalizedProjectId, file));
	},

	async upsertAutoDraftExecutionEntry(
		input: AutoDraftExecutionTraceInput,
	): Promise<DrawingRevisionRegisterRow | null> {
		const normalizedProjectId = normalizeText(input.projectId);
		const requestId = normalizeText(input.requestId);
		if (!normalizedProjectId || !requestId) {
			return null;
		}

		const issueSummary =
			normalizeText(input.issueSummary) ||
			`AutoDraft ${normalizeText(input.status) || "execution"} receipt recorded.`;
		const notes = normalizeText(input.notes);
		const title =
			normalizeText(input.title) ||
			normalizeText(input.drawingNumber) ||
			"AutoDraft execution";
		const existing = await this.fetchEntries(normalizedProjectId);
		const matched = existing.data.find(
			(entry) => normalizeText(entry.autodraft_request_id) === requestId,
		);
		const basePayload: DrawingRevisionRegisterInput = {
			projectId: normalizedProjectId,
			fileId: input.fileId ?? null,
			drawingNumber: normalizeText(input.drawingNumber),
			title,
			revision: normalizeText(input.revision),
			previousRevision: normalizeText(input.previousRevision) || null,
			issueSummary,
			issueStatus:
				Number(input.accepted || 0) > 0 ? "in-review" : "open",
			issueSeverity:
				Number(input.skipped || 0) > 0 ? "medium" : "low",
			sourceKind: "autodraft",
			sourceRef: normalizeText(input.sourceRef) || null,
			autodraftRequestId: requestId,
			notes: notes || null,
		};
		if (matched) {
			return await this.updateEntry(matched.id, basePayload);
		}
		return await this.createEntry(basePayload);
	},
};
