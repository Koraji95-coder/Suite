import type {
	AutomationBindingKind,
	AutomationQueueItem,
} from "@/features/automation-studio";
import { getLocalStorageApi } from "@/lib/browserStorage";
import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { localId } from "@/lib/localId";
import { logger } from "@/lib/logger";
import type { CadReplaceRule } from "@/services/cadBatchFindReplaceService";
import type { ProjectMarkupSnapshotRecord } from "@/services/projectMarkupSnapshotService";
import type {
	ProjectTerminalConnectionRow,
	ProjectTerminalStripRow,
} from "@/services/projectTerminalScheduleService";
import { getCurrentSupabaseUserId } from "@/services/projectWorkflowClientSupport";
import { loadSetting, saveSetting } from "@/settings/userSettings";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import { safeSupabaseQuery } from "@/supabase/utils";

export type AutomationRecipeStepSource = "autodraft" | "autowire" | "cad-utils";

export type ProjectAutomationRunStatus =
	| "draft"
	| "previewed"
	| "applied"
	| "verified"
	| "failed";

export type CadVerificationArtifactKind =
	| "excel-report"
	| "json-manifest"
	| "workspace"
	| "verification";

export interface CadManagedEntityKey {
	source: AutomationRecipeStepSource;
	entityKind: string;
	value: string;
	drawingPath: string | null;
}

export interface ProjectCadAutomationOperation {
	id: string;
	source: AutomationRecipeStepSource;
	operationType: string;
	drawingPath: string | null;
	drawingName: string | null;
	relativePath: string | null;
	managedKey: CadManagedEntityKey | null;
	targetHandleRefs?: string[];
	before: string | null;
	after: string | null;
	detail: string;
	warnings: string[];
	artifactRefs: string[];
	approved: boolean;
	nativePayload: Record<string, unknown> | null;
}

export interface CadPreflightIssue {
	id: string;
	severity: "info" | "warning" | "blocker";
	label: string;
	detail: string;
	drawingPath: string | null;
}

export interface CadPreflightResult {
	requestId: string | null;
	workPackageId: string | null;
	recipeSnapshotId: string | null;
	ok: boolean;
	simulateOnCopy: boolean;
	drawingCount: number;
	resolvedDrawingCount: number;
	pluginReady: boolean;
	acadeContextFound: boolean;
	blockers: string[];
	warnings: string[];
	issues: CadPreflightIssue[];
	message: string;
}

export interface CadVerificationArtifact {
	id: string;
	label: string;
	kind: CadVerificationArtifactKind;
	downloadUrl: string | null;
	path: string | null;
	description: string | null;
}

export interface ProjectAutomationRecipeStep {
	id: string;
	source: AutomationRecipeStepSource;
	label: string;
	enabled: boolean;
	ready: boolean;
	actionable: boolean;
	plannedItemCount: number;
	approvedItemCount: number;
	warningCount: number;
	bindingKinds: AutomationBindingKind[];
	summary: string;
	requestId: string | null;
	reportId: string | null;
}

export interface ProjectAutomationWorkPackageRecord {
	id: string;
	projectId: string;
	issueSetId: string | null;
	issueSetLabel: string | null;
	registerSnapshotId: string | null;
	terminalScheduleSnapshotId: string | null;
	selectedDrawingPaths: string[];
	drawingRootPath: string | null;
	projectRootPath: string | null;
	pdfPackageRootPath: string | null;
	titleBlockSnapshotStatus: string | null;
	titleBlockWarningCount: number;
	createdAt: string;
	updatedAt: string;
	warnings: string[];
}

export interface ProjectAutomationRecipeRecord {
	id: string;
	projectId: string;
	issueSetId: string | null;
	workPackageId: string | null;
	name: string;
	simulateOnCopy: boolean;
	steps: ProjectAutomationRecipeStep[];
	createdAt: string;
	updatedAt: string;
	warnings: string[];
}

export interface ProjectAutomationRunRecord {
	id: string;
	projectId: string;
	issueSetId: string | null;
	workPackageId: string | null;
	recipeId: string | null;
	status: ProjectAutomationRunStatus;
	requestId: string | null;
	simulateOnCopy: boolean;
	changedDrawingCount: number;
	changedItemCount: number;
	reportId: string | null;
	reportFilename: string | null;
	downloadUrl: string | null;
	operations: ProjectCadAutomationOperation[];
	warnings: string[];
	verificationArtifacts: CadVerificationArtifact[];
	createdAt: string;
	updatedAt: string;
}

export interface AutomationRecipeAutodraftStepPayload {
	requestId: string | null;
	queueItems: AutomationQueueItem[];
	markupSnapshotIds?: string[];
	markupSnapshots?: ProjectMarkupSnapshotRecord[];
	selectedActionIds?: string[];
	selectedOperationIds?: string[];
}

export interface AutomationRecipeAutowireStepPayload {
	requestId: string | null;
	scheduleSnapshotId: string | null;
	stripRows: ProjectTerminalStripRow[];
	connectionRows: ProjectTerminalConnectionRow[];
	selectedOperationIds: string[];
}

export interface AutomationRecipeCadUtilsStepPayload {
	requestId: string | null;
	rules: CadReplaceRule[];
	selectedPreviewKeys: string[];
	blockNameHint: string | null;
}

export interface ProjectAutomationRecipeStepPayloads {
	autodraft?: AutomationRecipeAutodraftStepPayload | null;
	autowire?: AutomationRecipeAutowireStepPayload | null;
	cadUtils?: AutomationRecipeCadUtilsStepPayload | null;
}

export interface ProjectAutomationRecipeRequest {
	workPackage: ProjectAutomationWorkPackageRecord;
	recipe: ProjectAutomationRecipeRecord;
	stepPayloads: ProjectAutomationRecipeStepPayloads;
	operations?: ProjectCadAutomationOperation[];
	runId?: string | null;
}

export interface ProjectAutomationRecipePreviewResponse {
	requestId: string | null;
	workPackageId: string | null;
	recipeSnapshotId: string | null;
	steps: ProjectAutomationRecipeStep[];
	operations: ProjectCadAutomationOperation[];
	warnings: string[];
	blockers: string[];
	message: string;
}

export interface ProjectAutomationRecipeApplyResponse {
	requestId: string | null;
	runId: string;
	changedDrawingCount: number;
	changedItemCount: number;
	reportId: string | null;
	reportFilename: string | null;
	downloadUrl: string | null;
	warnings: string[];
	artifacts: CadVerificationArtifact[];
	operations: ProjectCadAutomationOperation[];
	message: string;
}

export interface ProjectAutomationRecipeVerifyResponse {
	requestId: string | null;
	runId: string;
	verified: boolean;
	warnings: string[];
	artifacts: CadVerificationArtifact[];
	message: string;
}

export interface ProjectAcadeReconcileResult {
	requestId: string | null;
	drawingCount: number;
	acadeProjectFilePath: string | null;
	acadeSupportFiles: string[];
	blockers: string[];
	warnings: string[];
	message: string;
}

const WORK_PACKAGE_SETTING_KEY = "project_automation_work_packages_v1";
const RECIPE_SETTING_KEY = "project_automation_recipes_v1";
const RUN_SETTING_KEY = "project_automation_runs_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-automation-recipes";

type ProjectAutomationRunRow =
	Database["public"]["Tables"]["project_automation_runs"]["Row"];
type ProjectAutomationRunInsert =
	Database["public"]["Tables"]["project_automation_runs"]["Insert"];

function createId() {
	return localId();
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
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

function normalizeBindingKinds(value: unknown): AutomationBindingKind[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is AutomationBindingKind => {
		const normalized = normalizeText(entry);
		return (
			normalized === "title-block" ||
			normalized === "drawing-row" ||
			normalized === "deliverable-row" ||
			normalized === "drawing-content" ||
			normalized === "terminal-wiring" ||
			normalized === "schedule-row" ||
			normalized === "note-only"
		);
	});
}

function normalizeStepSource(value: unknown): AutomationRecipeStepSource {
	const normalized = normalizeText(value).toLowerCase();
	if (normalized === "autowire") {
		return "autowire";
	}
	if (normalized === "cad-utils") {
		return "cad-utils";
	}
	return "autodraft";
}

function buildLocalStorageKey(projectId: string, suffix: string) {
	return `${LOCAL_STORAGE_PREFIX}:${suffix}:${projectId}`;
}

function buildFilenameFromDisposition(
	contentDisposition: string | null,
	fallbackFilename: string,
) {
	const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
	return match?.[1] || fallbackFilename;
}

async function downloadResponseAsFile(
	response: Response,
	fallbackFilename: string,
) {
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = buildFilenameFromDisposition(
		response.headers.get("content-disposition"),
		fallbackFilename,
	);
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

function toManagedKey(value: unknown): CadManagedEntityKey | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadManagedEntityKey>;
	const entityKind = normalizeText(candidate.entityKind);
	const result = normalizeNullableText(candidate.value);
	if (!entityKind || !result) {
		return null;
	}
	return {
		source: normalizeStepSource(candidate.source),
		entityKind,
		value: result,
		drawingPath: normalizeNullableText(candidate.drawingPath),
	};
}

function toRecipeStep(value: unknown): ProjectAutomationRecipeStep | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectAutomationRecipeStep>;
	const label = normalizeText(candidate.label);
	if (!label) {
		return null;
	}
	return {
		id: normalizeText(candidate.id) || createId(),
		source: normalizeStepSource(candidate.source),
		label,
		enabled: candidate.enabled !== false,
		ready: candidate.ready !== false,
		actionable: candidate.actionable !== false,
		plannedItemCount: Math.max(0, Number(candidate.plannedItemCount || 0)),
		approvedItemCount: Math.max(0, Number(candidate.approvedItemCount || 0)),
		warningCount: Math.max(0, Number(candidate.warningCount || 0)),
		bindingKinds: normalizeBindingKinds(candidate.bindingKinds),
		summary: normalizeText(candidate.summary),
		requestId: normalizeNullableText(candidate.requestId),
		reportId: normalizeNullableText(candidate.reportId),
	};
}

function toRecipeOperation(
	value: unknown,
): ProjectCadAutomationOperation | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectCadAutomationOperation>;
	const operationId = normalizeText(candidate.id);
	if (!operationId) {
		return null;
	}
	return {
		id: operationId,
		source: normalizeStepSource(candidate.source),
		operationType: normalizeText(candidate.operationType) || "preview",
		drawingPath: normalizeNullableText(candidate.drawingPath),
		drawingName: normalizeNullableText(candidate.drawingName),
		relativePath: normalizeNullableText(candidate.relativePath),
		managedKey: toManagedKey(candidate.managedKey),
		targetHandleRefs: normalizeStringArray(
			(candidate as { targetHandleRefs?: unknown }).targetHandleRefs,
		),
		before: normalizeNullableText(candidate.before),
		after: normalizeNullableText(candidate.after),
		detail: normalizeText(candidate.detail),
		warnings: normalizeStringArray(candidate.warnings),
		artifactRefs: normalizeStringArray(candidate.artifactRefs),
		approved: candidate.approved !== false,
		nativePayload:
			candidate.nativePayload && typeof candidate.nativePayload === "object"
				? (candidate.nativePayload as Record<string, unknown>)
				: null,
	};
}

function toPreflightIssue(value: unknown): CadPreflightIssue | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadPreflightIssue>;
	const label = normalizeText(candidate.label);
	if (!label) {
		return null;
	}
	const severity = normalizeText(candidate.severity).toLowerCase();
	return {
		id: normalizeText(candidate.id) || createId(),
		severity:
			severity === "blocker"
				? "blocker"
				: severity === "info"
					? "info"
					: "warning",
		label,
		detail: normalizeText(candidate.detail),
		drawingPath: normalizeNullableText(candidate.drawingPath),
	};
}

function toVerificationArtifact(
	value: unknown,
): CadVerificationArtifact | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadVerificationArtifact>;
	const label = normalizeText(candidate.label);
	if (!label) {
		return null;
	}
	const kind = normalizeText(candidate.kind).toLowerCase();
	return {
		id: normalizeText(candidate.id) || createId(),
		label,
		kind:
			kind === "json-manifest"
				? "json-manifest"
				: kind === "workspace"
					? "workspace"
					: kind === "verification"
						? "verification"
						: "excel-report",
		downloadUrl: normalizeNullableText(candidate.downloadUrl),
		path: normalizeNullableText(candidate.path),
		description: normalizeNullableText(candidate.description),
	};
}

function normalizeWorkPackage(
	value: unknown,
): ProjectAutomationWorkPackageRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectAutomationWorkPackageRecord>;
	const projectId = normalizeText(candidate.projectId);
	if (!projectId) {
		return null;
	}
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		issueSetId: normalizeNullableText(candidate.issueSetId),
		issueSetLabel: normalizeNullableText(candidate.issueSetLabel),
		registerSnapshotId: normalizeNullableText(candidate.registerSnapshotId),
		terminalScheduleSnapshotId: normalizeNullableText(
			candidate.terminalScheduleSnapshotId,
		),
		selectedDrawingPaths: normalizeStringArray(candidate.selectedDrawingPaths),
		drawingRootPath: normalizeNullableText(candidate.drawingRootPath),
		projectRootPath: normalizeNullableText(candidate.projectRootPath),
		pdfPackageRootPath: normalizeNullableText(candidate.pdfPackageRootPath),
		titleBlockSnapshotStatus: normalizeNullableText(
			candidate.titleBlockSnapshotStatus,
		),
		titleBlockWarningCount: Math.max(
			0,
			Number(candidate.titleBlockWarningCount || 0),
		),
		createdAt: normalizeText(candidate.createdAt) || new Date().toISOString(),
		updatedAt: normalizeText(candidate.updatedAt) || new Date().toISOString(),
		warnings: normalizeStringArray(candidate.warnings),
	};
}

function normalizeRecipe(value: unknown): ProjectAutomationRecipeRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectAutomationRecipeRecord>;
	const projectId = normalizeText(candidate.projectId);
	const name = normalizeText(candidate.name);
	if (!projectId || !name) {
		return null;
	}
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		issueSetId: normalizeNullableText(candidate.issueSetId),
		workPackageId: normalizeNullableText(candidate.workPackageId),
		name,
		simulateOnCopy: candidate.simulateOnCopy !== false,
		steps: Array.isArray(candidate.steps)
			? candidate.steps
					.map((entry) => toRecipeStep(entry))
					.filter(
						(entry): entry is ProjectAutomationRecipeStep => entry !== null,
					)
			: [],
		createdAt: normalizeText(candidate.createdAt) || new Date().toISOString(),
		updatedAt: normalizeText(candidate.updatedAt) || new Date().toISOString(),
		warnings: normalizeStringArray(candidate.warnings),
	};
}

function normalizeRun(value: unknown): ProjectAutomationRunRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectAutomationRunRecord>;
	const projectId = normalizeText(candidate.projectId);
	if (!projectId) {
		return null;
	}
	const status = normalizeText(candidate.status).toLowerCase();
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		issueSetId: normalizeNullableText(candidate.issueSetId),
		workPackageId: normalizeNullableText(candidate.workPackageId),
		recipeId: normalizeNullableText(candidate.recipeId),
		status:
			status === "previewed" ||
			status === "applied" ||
			status === "verified" ||
			status === "failed"
				? status
				: "draft",
		requestId: normalizeNullableText(candidate.requestId),
		simulateOnCopy: candidate.simulateOnCopy !== false,
		changedDrawingCount: Math.max(
			0,
			Number(candidate.changedDrawingCount || 0),
		),
		changedItemCount: Math.max(0, Number(candidate.changedItemCount || 0)),
		reportId: normalizeNullableText(candidate.reportId),
		reportFilename: normalizeNullableText(candidate.reportFilename),
		downloadUrl: normalizeNullableText(candidate.downloadUrl),
		operations: Array.isArray(candidate.operations)
			? candidate.operations
					.map((entry) => toRecipeOperation(entry))
					.filter(
						(entry): entry is ProjectCadAutomationOperation => entry !== null,
					)
			: [],
		warnings: normalizeStringArray(candidate.warnings),
		verificationArtifacts: Array.isArray(candidate.verificationArtifacts)
			? candidate.verificationArtifacts
					.map((entry) => toVerificationArtifact(entry))
					.filter((entry): entry is CadVerificationArtifact => entry !== null)
			: [],
		createdAt: normalizeText(candidate.createdAt) || new Date().toISOString(),
		updatedAt: normalizeText(candidate.updatedAt) || new Date().toISOString(),
	};
}

function fromRunRow(row: ProjectAutomationRunRow): ProjectAutomationRunRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		issueSetId: normalizeNullableText(row.issue_set_id),
		workPackageId: normalizeNullableText(row.work_package_id),
		recipeId: normalizeNullableText(row.recipe_id),
		status:
			normalizeRun({
				projectId: row.project_id,
				status: row.status,
			})?.status ?? "draft",
		requestId: normalizeNullableText(row.request_id),
		simulateOnCopy: row.simulate_on_copy !== false,
		changedDrawingCount: Math.max(0, Number(row.changed_drawing_count || 0)),
		changedItemCount: Math.max(0, Number(row.changed_item_count || 0)),
		reportId: normalizeNullableText(row.report_id),
		reportFilename: normalizeNullableText(row.report_filename),
		downloadUrl: normalizeNullableText(row.download_url),
		operations: Array.isArray(row.operations)
			? row.operations
					.map((entry) => toRecipeOperation(entry))
					.filter(
						(entry): entry is ProjectCadAutomationOperation => entry !== null,
					)
			: [],
		warnings: normalizeStringArray(row.warnings),
		verificationArtifacts: Array.isArray(row.verification_artifacts)
			? row.verification_artifacts
					.map((entry) => toVerificationArtifact(entry))
					.filter((entry): entry is CadVerificationArtifact => entry !== null)
			: [],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toRunInsert(
	record: ProjectAutomationRunRecord,
	userId: string,
): ProjectAutomationRunInsert {
	return {
		id: record.id,
		project_id: record.projectId,
		issue_set_id: record.issueSetId,
		work_package_id: record.workPackageId,
		recipe_id: record.recipeId,
		status: record.status,
		request_id: record.requestId,
		simulate_on_copy: record.simulateOnCopy,
		changed_drawing_count: record.changedDrawingCount,
		changed_item_count: record.changedItemCount,
		report_id: record.reportId,
		report_filename: record.reportFilename,
		download_url: record.downloadUrl,
		operations: record.operations as unknown as Json,
		warnings: record.warnings,
		artifacts: [] as unknown as Json,
		verification_artifacts: record.verificationArtifacts as unknown as Json,
		user_id: userId,
		created_at: record.createdAt,
		updated_at: record.updatedAt,
	};
}

function isMissingAutomationRunTable(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error && "message" in error
				? String((error as { message?: unknown }).message || "")
				: String(error || "");
	const normalized = message.toLowerCase();
	return (
		normalized.includes("project_automation_runs") &&
		(normalized.includes("does not exist") ||
			normalized.includes("not found") ||
			normalized.includes("schema cache"))
	);
}

function sortByUpdatedAtDescending<
	T extends { updatedAt?: string; createdAt?: string },
>(entries: T[]) {
	return [...entries].sort((left, right) =>
		String(right.updatedAt || right.createdAt || "").localeCompare(
			String(left.updatedAt || left.createdAt || ""),
		),
	);
}

function readLocalRecords<T extends { updatedAt?: string; createdAt?: string }>(
	projectId: string,
	suffix: string,
	normalizeRecord: (value: unknown) => T | null,
) {
	const storage = getLocalStorageApi();
	if (!storage) {
		return [] as T[];
	}
	try {
		const raw = storage.getItem(buildLocalStorageKey(projectId, suffix));
		if (!raw) {
			return [] as T[];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [] as T[];
		}
		return sortByUpdatedAtDescending(
			parsed
				.map((entry) => normalizeRecord(entry))
				.filter((entry): entry is T => entry !== null),
		);
	} catch (error) {
		logger.warn(
			`Unable to read local automation ${suffix} cache.`,
			"ProjectAutomationRecipeService",
			error,
		);
		return [] as T[];
	}
}

function writeLocalRecords<
	T extends { updatedAt?: string; createdAt?: string },
>(projectId: string, suffix: string, records: T[]) {
	const storage = getLocalStorageApi();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(
			buildLocalStorageKey(projectId, suffix),
			JSON.stringify(sortByUpdatedAtDescending(records)),
		);
	} catch (error) {
		logger.warn(
			`Unable to write local automation ${suffix} cache.`,
			"ProjectAutomationRecipeService",
			error,
		);
	}
}

async function persistRecords<
	T extends { projectId: string; updatedAt?: string; createdAt?: string },
>(projectId: string, suffix: string, settingKey: string, records: T[]) {
	const sorted = sortByUpdatedAtDescending(records);
	const result = await saveSetting(settingKey, sorted, projectId);
	writeLocalRecords(projectId, suffix, sorted);
	if (!result.success) {
		return new Error(result.error || `Unable to persist ${suffix}.`);
	}
	return null;
}

async function loadRecords<
	T extends { updatedAt?: string; createdAt?: string },
>(
	projectId: string,
	suffix: string,
	settingKey: string,
	normalizeRecord: (value: unknown) => T | null,
) {
	const localFallback = readLocalRecords(projectId, suffix, normalizeRecord);
	try {
		const stored = await loadSetting<unknown>(settingKey, projectId, null);
		if (stored === null) {
			return { data: localFallback, error: null };
		}
		if (!Array.isArray(stored)) {
			return {
				data: localFallback,
				error: new Error(`Stored ${suffix} payload is invalid.`),
			};
		}
		const normalized = sortByUpdatedAtDescending(
			stored
				.map((entry) => normalizeRecord(entry))
				.filter((entry): entry is T => entry !== null),
		);
		writeLocalRecords(projectId, suffix, normalized);
		return { data: normalized, error: null };
	} catch (error) {
		return {
			data: localFallback,
			error:
				error instanceof Error ? error : new Error(`Unable to load ${suffix}.`),
		};
	}
}

class ProjectAutomationRecipeService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl = (
			import.meta.env.VITE_COORDINATES_BACKEND_URL ||
			import.meta.env.VITE_BACKEND_URL ||
			"http://localhost:5000"
		)
			.trim()
			.replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
	}

	private async getAccessToken() {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to resolve Supabase session for automation recipes.",
					"ProjectAutomationRecipeService",
					error,
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.warn(
				"Unexpected auth error while resolving automation recipe session.",
				"ProjectAutomationRecipeService",
				error,
			);
			return null;
		}
	}

	private async getCurrentUserId() {
		try {
			return await getCurrentSupabaseUserId();
		} catch (error) {
			logger.warn(
				"Unexpected auth error while resolving automation recipe user.",
				"ProjectAutomationRecipeService",
				error,
			);
			return null;
		}
	}

	private async buildHeaders() {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": `automation-recipe-${Date.now()}`,
		};
		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		} else if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}
		return headers;
	}

	async fetchWorkPackages(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [] as ProjectAutomationWorkPackageRecord[],
				error: new Error("Project id is required."),
			};
		}
		return loadRecords(
			normalizedProjectId,
			"work-packages",
			WORK_PACKAGE_SETTING_KEY,
			normalizeWorkPackage,
		);
	}

	async saveWorkPackage(record: ProjectAutomationWorkPackageRecord): Promise<{
		data: ProjectAutomationWorkPackageRecord | null;
		error: Error | null;
	}> {
		const normalized = normalizeWorkPackage(record);
		if (!normalized) {
			return {
				data: null,
				error: new Error("Work package payload is invalid."),
			};
		}
		const existing = await this.fetchWorkPackages(normalized.projectId);
		const next = [
			{
				...normalized,
				updatedAt: new Date().toISOString(),
				createdAt: normalized.createdAt || new Date().toISOString(),
			},
			...existing.data.filter((entry) => entry.id !== normalized.id),
		];
		const persistError = await persistRecords(
			normalized.projectId,
			"work-packages",
			WORK_PACKAGE_SETTING_KEY,
			next,
		);
		return {
			data: next[0] ?? null,
			error: persistError,
		};
	}

	async fetchRecipes(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [] as ProjectAutomationRecipeRecord[],
				error: new Error("Project id is required."),
			};
		}
		return loadRecords(
			normalizedProjectId,
			"recipes",
			RECIPE_SETTING_KEY,
			normalizeRecipe,
		);
	}

	async saveRecipe(record: ProjectAutomationRecipeRecord): Promise<{
		data: ProjectAutomationRecipeRecord | null;
		error: Error | null;
	}> {
		const normalized = normalizeRecipe(record);
		if (!normalized) {
			return {
				data: null,
				error: new Error("Recipe payload is invalid."),
			};
		}
		const existing = await this.fetchRecipes(normalized.projectId);
		const next = [
			{
				...normalized,
				updatedAt: new Date().toISOString(),
				createdAt: normalized.createdAt || new Date().toISOString(),
			},
			...existing.data.filter((entry) => entry.id !== normalized.id),
		];
		const persistError = await persistRecords(
			normalized.projectId,
			"recipes",
			RECIPE_SETTING_KEY,
			next,
		);
		return {
			data: next[0] ?? null,
			error: persistError,
		};
	}

	async fetchRuns(projectId: string) {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [] as ProjectAutomationRunRecord[],
				error: new Error("Project id is required."),
			};
		}
		const userId = await this.getCurrentUserId();
		const localFallback = readLocalRecords(
			normalizedProjectId,
			"runs",
			normalizeRun,
		);
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_automation_runs")
						.select("*")
						.eq("project_id", normalizedProjectId)
						.eq("user_id", userId)
						.order("updated_at", { ascending: false }),
				"ProjectAutomationRecipeService",
			);
			if (result.data) {
				const normalized = sortByUpdatedAtDescending(
					(result.data as ProjectAutomationRunRow[]).map((row) =>
						fromRunRow(row),
					),
				);
				writeLocalRecords(normalizedProjectId, "runs", normalized);
				return { data: normalized, error: null };
			}
			if (result.error && !isMissingAutomationRunTable(result.error)) {
				return {
					data: localFallback,
					error: new Error(
						String(result.error.message || "Unable to load recipe runs."),
					),
				};
			}
		}
		return loadRecords(
			normalizedProjectId,
			"runs",
			RUN_SETTING_KEY,
			normalizeRun,
		);
	}

	async saveRun(record: ProjectAutomationRunRecord): Promise<{
		data: ProjectAutomationRunRecord | null;
		error: Error | null;
	}> {
		const normalized = normalizeRun(record);
		if (!normalized) {
			return {
				data: null,
				error: new Error("Run payload is invalid."),
			};
		}
		const existing = await this.fetchRuns(normalized.projectId);
		const next = [
			{
				...normalized,
				updatedAt: new Date().toISOString(),
				createdAt: normalized.createdAt || new Date().toISOString(),
			},
			...existing.data.filter((entry) => entry.id !== normalized.id),
		];
		writeLocalRecords(normalized.projectId, "runs", next);
		const userId = await this.getCurrentUserId();
		if (userId) {
			const result = await safeSupabaseQuery(
				async () =>
					await supabase
						.from("project_automation_runs")
						.upsert(toRunInsert(next[0], userId), { onConflict: "id" })
						.select("*")
						.maybeSingle(),
				"ProjectAutomationRecipeService",
			);
			if (result.data) {
				const saved = fromRunRow(result.data as ProjectAutomationRunRow);
				writeLocalRecords(normalized.projectId, "runs", [
					saved,
					...existing.data.filter((entry) => entry.id !== saved.id),
				]);
				return {
					data: saved,
					error: null,
				};
			}
			if (result.error && !isMissingAutomationRunTable(result.error)) {
				const persistError = await persistRecords(
					normalized.projectId,
					"runs",
					RUN_SETTING_KEY,
					next,
				);
				return {
					data: next[0] ?? null,
					error:
						persistError ||
						new Error(
							String(result.error.message || "Unable to persist recipe run."),
						),
				};
			}
		}
		const persistError = await persistRecords(
			normalized.projectId,
			"runs",
			RUN_SETTING_KEY,
			next,
		);
		return {
			data: next[0] ?? null,
			error: persistError,
		};
	}

	async preflightProjectScope(
		payload: ProjectAutomationRecipeRequest,
	): Promise<CadPreflightResult> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/cad/preflight/project-scope`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 180_000,
					requestName: "CAD recipe preflight",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(body?.error || body?.message || "CAD preflight failed."),
				);
			}
			return {
				requestId: normalizeNullableText(body?.requestId),
				workPackageId: normalizeNullableText(body?.workPackageId),
				recipeSnapshotId: normalizeNullableText(body?.recipeSnapshotId),
				ok: body?.ok !== false,
				simulateOnCopy: body?.simulateOnCopy !== false,
				drawingCount: Math.max(0, Number(body?.drawingCount || 0)),
				resolvedDrawingCount: Math.max(
					0,
					Number(body?.resolvedDrawingCount || 0),
				),
				pluginReady: body?.pluginReady !== false,
				acadeContextFound: body?.acadeContextFound === true,
				blockers: normalizeStringArray(body?.blockers),
				warnings: normalizeStringArray(body?.warnings),
				issues: Array.isArray(body?.issues)
					? body.issues
							.map((entry: unknown) => toPreflightIssue(entry))
							.filter(
								(entry: CadPreflightIssue | null): entry is CadPreflightIssue =>
									entry !== null,
							)
					: [],
				message:
					normalizeText(body?.message) || "CAD recipe preflight completed.",
			};
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "CAD preflight failed."));
		}
	}

	async previewRecipe(
		payload: ProjectAutomationRecipeRequest,
	): Promise<ProjectAutomationRecipePreviewResponse> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/automation-recipes/preview`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 240_000,
					requestName: "Automation recipe preview",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(
						body?.error || body?.message || "Automation recipe preview failed.",
					),
				);
			}
			return {
				requestId: normalizeNullableText(body?.requestId),
				workPackageId: normalizeNullableText(body?.workPackageId),
				recipeSnapshotId: normalizeNullableText(body?.recipeSnapshotId),
				steps: Array.isArray(body?.steps)
					? body.steps
							.map((entry: unknown) => toRecipeStep(entry))
							.filter(
								(
									entry: ProjectAutomationRecipeStep | null,
								): entry is ProjectAutomationRecipeStep => entry !== null,
							)
					: [],
				operations: Array.isArray(body?.operations)
					? body.operations
							.map((entry: unknown) => toRecipeOperation(entry))
							.filter(
								(
									entry: ProjectCadAutomationOperation | null,
								): entry is ProjectCadAutomationOperation => entry !== null,
							)
					: [],
				warnings: normalizeStringArray(body?.warnings),
				blockers: normalizeStringArray(body?.blockers),
				message:
					normalizeText(body?.message) ||
					"Automation recipe preview completed.",
			};
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Automation recipe preview failed."),
			);
		}
	}

	async applyRecipe(
		payload: ProjectAutomationRecipeRequest,
	): Promise<ProjectAutomationRecipeApplyResponse> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/automation-recipes/apply`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 240_000,
					requestName: "Automation recipe apply",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(
						body?.error || body?.message || "Automation recipe apply failed.",
					),
				);
			}
			const runId = normalizeText(body?.runId);
			if (!runId) {
				throw new Error("Automation recipe apply did not return a run id.");
			}
			return {
				requestId: normalizeNullableText(body?.requestId),
				runId,
				changedDrawingCount: Math.max(
					0,
					Number(body?.changedDrawingCount || 0),
				),
				changedItemCount: Math.max(0, Number(body?.changedItemCount || 0)),
				reportId: normalizeNullableText(body?.reportId),
				reportFilename: normalizeNullableText(body?.reportFilename),
				downloadUrl: normalizeNullableText(body?.downloadUrl),
				warnings: normalizeStringArray(body?.warnings),
				artifacts: Array.isArray(body?.artifacts)
					? body.artifacts
							.map((entry: unknown) => toVerificationArtifact(entry))
							.filter(
								(
									entry: CadVerificationArtifact | null,
								): entry is CadVerificationArtifact => entry !== null,
							)
					: [],
				operations: Array.isArray(body?.operations)
					? body.operations
							.map((entry: unknown) => toRecipeOperation(entry))
							.filter(
								(
									entry: ProjectCadAutomationOperation | null,
								): entry is ProjectCadAutomationOperation => entry !== null,
							)
					: [],
				message:
					normalizeText(body?.message) || "Automation recipe apply completed.",
			};
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Automation recipe apply failed."),
			);
		}
	}

	async verifyRecipe(
		payload: ProjectAutomationRecipeRequest,
	): Promise<ProjectAutomationRecipeVerifyResponse> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/automation-recipes/verify`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 180_000,
					requestName: "Automation recipe verify",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(
						body?.error || body?.message || "Automation recipe verify failed.",
					),
				);
			}
			const runId = normalizeText(body?.runId);
			if (!runId) {
				throw new Error("Automation recipe verify did not return a run id.");
			}
			return {
				requestId: normalizeNullableText(body?.requestId),
				runId,
				verified: body?.verified !== false,
				warnings: normalizeStringArray(body?.warnings),
				artifacts: Array.isArray(body?.artifacts)
					? body.artifacts
							.map((entry: unknown) => toVerificationArtifact(entry))
							.filter(
								(
									entry: CadVerificationArtifact | null,
								): entry is CadVerificationArtifact => entry !== null,
							)
					: [],
				message:
					normalizeText(body?.message) ||
					"Automation recipe verification completed.",
			};
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Automation recipe verify failed."),
			);
		}
	}

	async reconcileAcadeProjectScope(
		payload: ProjectAutomationRecipeRequest,
	): Promise<ProjectAcadeReconcileResult> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/acade/reconcile/project-scope`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 180_000,
					requestName: "ACADE reconcile",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(body?.error || body?.message || "ACADE reconcile failed."),
				);
			}
			return {
				requestId: normalizeNullableText(body?.requestId),
				drawingCount: Math.max(0, Number(body?.drawingCount || 0)),
				acadeProjectFilePath: normalizeNullableText(body?.acadeProjectFilePath),
				acadeSupportFiles: normalizeStringArray(body?.acadeSupportFiles),
				blockers: normalizeStringArray(body?.blockers),
				warnings: normalizeStringArray(body?.warnings),
				message: normalizeText(body?.message) || "ACADE reconcile completed.",
			};
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "ACADE reconcile failed."));
		}
	}

	async downloadCadReport(reportId: string, fallbackFilename?: string) {
		const normalizedReportId = normalizeText(reportId);
		if (!normalizedReportId) {
			throw new Error("Report id is required.");
		}
		const headers = await this.buildHeaders();
		const response = await fetchWithTimeout(
			`${this.baseUrl}/api/cad/reports/${encodeURIComponent(normalizedReportId)}`,
			{
				method: "GET",
				credentials: "include",
				headers,
				timeoutMs: 120_000,
				requestName: "Automation CAD report download",
			},
		);
		if (!response.ok) {
			throw new Error(
				await parseResponseErrorMessage(
					response,
					"Unable to download automation CAD report.",
				),
			);
		}
		await downloadResponseAsFile(
			response,
			fallbackFilename || "suite_automation_recipe_report.xlsx",
		);
	}
}

export const projectAutomationRecipeService =
	new ProjectAutomationRecipeService();
