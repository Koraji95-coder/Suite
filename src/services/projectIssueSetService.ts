import { logger } from "@/lib/logger";
import { loadSetting, saveSetting } from "@/settings/userSettings";

export type ProjectIssueSetStatus = "draft" | "review" | "ready" | "issued";

export interface ProjectIssueSetSnapshot {
	drawingCount: number;
	selectedDrawingCount: number;
	reviewItemCount: number;
	titleBlockReviewCount: number;
	standardsReviewCount: number;
	unresolvedRevisionCount: number;
	setupBlockerCount: number;
	trackedDrawingCount: number;
	acceptedTitleBlockCount: number;
	waivedStandardsCount: number;
}

export interface ProjectIssueSetRecord {
	id: string;
	projectId: string;
	name: string;
	issueTag: string;
	status: ProjectIssueSetStatus;
	targetDate: string | null;
	transmittalNumber: string | null;
	transmittalDocumentName: string | null;
	registerSnapshotId: string | null;
	terminalScheduleSnapshotId: string | null;
	workPackageId?: string | null;
	recipeSnapshotId?: string | null;
	summary: string;
	notes: string | null;
	selectedDrawingPaths: string[];
	selectedRegisterRowIds: string[];
	selectedDrawingNumbers: string[];
	selectedPdfFileIds: string[];
	snapshot: ProjectIssueSetSnapshot;
	createdAt: string;
	updatedAt: string;
	issuedAt: string | null;
}

export interface ProjectIssueSetInput {
	projectId: string;
	name: string;
	issueTag: string;
	status: ProjectIssueSetStatus;
	targetDate?: string | null;
	transmittalNumber?: string | null;
	transmittalDocumentName?: string | null;
	registerSnapshotId?: string | null;
	terminalScheduleSnapshotId?: string | null;
	workPackageId?: string | null;
	recipeSnapshotId?: string | null;
	summary?: string;
	notes?: string | null;
	selectedDrawingPaths?: string[];
	selectedRegisterRowIds?: string[];
	selectedDrawingNumbers?: string[];
	selectedPdfFileIds?: string[];
	snapshot: ProjectIssueSetSnapshot;
}

const ISSUE_SET_SETTING_KEY = "project_issue_sets_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-issue-sets";

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `issue-set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): ProjectIssueSetStatus {
	switch (normalizeText(value).toLowerCase()) {
		case "review":
			return "review";
		case "ready":
			return "ready";
		case "issued":
			return "issued";
		default:
			return "draft";
	}
}

function normalizeDate(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

function normalizeSnapshot(
	value: Partial<ProjectIssueSetSnapshot> | null | undefined,
): ProjectIssueSetSnapshot {
	return {
		drawingCount: Math.max(0, Number(value?.drawingCount || 0)),
		selectedDrawingCount: Math.max(0, Number(value?.selectedDrawingCount || 0)),
		reviewItemCount: Math.max(0, Number(value?.reviewItemCount || 0)),
		titleBlockReviewCount: Math.max(
			0,
			Number(value?.titleBlockReviewCount || 0),
		),
		standardsReviewCount: Math.max(
			0,
			Number(value?.standardsReviewCount || 0),
		),
		unresolvedRevisionCount: Math.max(
			0,
			Number(value?.unresolvedRevisionCount || 0),
		),
		setupBlockerCount: Math.max(0, Number(value?.setupBlockerCount || 0)),
		trackedDrawingCount: Math.max(0, Number(value?.trackedDrawingCount || 0)),
		acceptedTitleBlockCount: Math.max(
			0,
			Number(value?.acceptedTitleBlockCount || 0),
		),
		waivedStandardsCount: Math.max(
			0,
			Number(value?.waivedStandardsCount || 0),
		),
	};
}

function normalizePaths(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const value of values) {
		const trimmed = normalizeText(value);
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(trimmed);
	}
	return normalized;
}

function normalizeStrings(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const value of values) {
		const trimmed = normalizeText(value);
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(trimmed);
	}
	return normalized;
}

function normalizeRecord(value: unknown): ProjectIssueSetRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectIssueSetRecord>;
	const projectId = normalizeText(candidate.projectId);
	const name = normalizeText(candidate.name);
	if (!projectId || !name) {
		return null;
	}
	const createdAt =
		normalizeDate(candidate.createdAt) || new Date().toISOString();
	const updatedAt = normalizeDate(candidate.updatedAt) || createdAt;
	const status = normalizeStatus(candidate.status);
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		name,
		issueTag: normalizeText(candidate.issueTag) || "ISSUE",
		status,
		targetDate: normalizeDate(candidate.targetDate),
		transmittalNumber: normalizeDate(candidate.transmittalNumber),
		transmittalDocumentName: normalizeDate(candidate.transmittalDocumentName),
		registerSnapshotId: normalizeDate(candidate.registerSnapshotId),
		terminalScheduleSnapshotId: normalizeDate(
			candidate.terminalScheduleSnapshotId,
		),
		workPackageId: normalizeDate(candidate.workPackageId),
		recipeSnapshotId: normalizeDate(candidate.recipeSnapshotId),
		summary: normalizeText(candidate.summary),
		notes: normalizeDate(candidate.notes),
		selectedDrawingPaths: normalizePaths(candidate.selectedDrawingPaths),
		selectedRegisterRowIds: normalizeStrings(candidate.selectedRegisterRowIds),
		selectedDrawingNumbers: normalizeStrings(candidate.selectedDrawingNumbers),
		selectedPdfFileIds: normalizeStrings(candidate.selectedPdfFileIds),
		snapshot: normalizeSnapshot(candidate.snapshot),
		createdAt,
		updatedAt,
		issuedAt:
			status === "issued"
				? normalizeDate(candidate.issuedAt) || updatedAt
				: normalizeDate(candidate.issuedAt),
	};
}

function sortIssueSets(entries: ProjectIssueSetRecord[]) {
	return [...entries].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function readLocalIssueSets(projectId: string): ProjectIssueSetRecord[] {
	if (typeof localStorage === "undefined") {
		return [];
	}
	try {
		const raw = localStorage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		return sortIssueSets(
			parsed
				.map((entry) => normalizeRecord(entry))
				.filter((entry): entry is ProjectIssueSetRecord => entry !== null),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local issue set cache.",
			"ProjectIssueSetService",
			error,
		);
		return [];
	}
}

function writeLocalIssueSets(
	projectId: string,
	entries: ProjectIssueSetRecord[],
) {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(
			buildLocalStorageKey(projectId),
			JSON.stringify(sortIssueSets(entries)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local issue set cache.",
			"ProjectIssueSetService",
			error,
		);
	}
}

async function persistIssueSets(
	projectId: string,
	entries: ProjectIssueSetRecord[],
): Promise<Error | null> {
	const sorted = sortIssueSets(entries);
	const result = await saveSetting(ISSUE_SET_SETTING_KEY, sorted, projectId);
	writeLocalIssueSets(projectId, sorted);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist issue sets to project settings.",
		);
	}
	return null;
}

export const projectIssueSetService = {
	async fetchIssueSets(projectId: string): Promise<{
		data: ProjectIssueSetRecord[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const localFallback = readLocalIssueSets(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				ISSUE_SET_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			if (!Array.isArray(stored)) {
				return {
					data: localFallback,
					error: new Error("Stored issue set data is invalid."),
				};
			}
			const normalized = sortIssueSets(
				stored
					.map((entry) => normalizeRecord(entry))
					.filter((entry): entry is ProjectIssueSetRecord => entry !== null),
			);
			writeLocalIssueSets(normalizedProjectId, normalized);
			return { data: normalized, error: null };
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load issue sets."),
			};
		}
	},

	async fetchIssueSet(
		projectId: string,
		issueSetId: string,
	): Promise<{
		data: ProjectIssueSetRecord | null;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		const normalizedIssueSetId = normalizeText(issueSetId);
		if (!normalizedProjectId || !normalizedIssueSetId) {
			return {
				data: null,
				error: new Error("Project id and issue set id are required."),
			};
		}

		const result = await this.fetchIssueSets(normalizedProjectId);
		if (result.error) {
			return {
				data: null,
				error: result.error,
			};
		}

		return {
			data:
				result.data.find((entry) => entry.id === normalizedIssueSetId) ?? null,
			error: null,
		};
	},

	async saveIssueSet(
		input: ProjectIssueSetInput,
		existingIssueSetId?: string | null,
	): Promise<{
		data: ProjectIssueSetRecord | null;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(input.projectId);
		const normalizedName = normalizeText(input.name);
		if (!normalizedProjectId || !normalizedName) {
			return {
				data: null,
				error: new Error("Project id and issue set name are required."),
			};
		}

		const existingResult = await this.fetchIssueSets(normalizedProjectId);
		const existingEntries = existingResult.data;
		const existing = existingIssueSetId
			? (existingEntries.find((entry) => entry.id === existingIssueSetId) ??
				null)
			: null;
		const timestamp = new Date().toISOString();
		const status = normalizeStatus(input.status);
		const record: ProjectIssueSetRecord = {
			id: existing?.id || normalizeText(existingIssueSetId) || createId(),
			projectId: normalizedProjectId,
			name: normalizedName,
			issueTag: normalizeText(input.issueTag) || existing?.issueTag || "ISSUE",
			status,
			targetDate: normalizeDate(input.targetDate),
			transmittalNumber: normalizeDate(input.transmittalNumber),
			transmittalDocumentName: normalizeDate(input.transmittalDocumentName),
			registerSnapshotId:
				normalizeDate(input.registerSnapshotId) ??
				existing?.registerSnapshotId ??
				null,
			terminalScheduleSnapshotId:
				normalizeDate(input.terminalScheduleSnapshotId) ??
				existing?.terminalScheduleSnapshotId ??
				null,
			workPackageId:
				normalizeDate(input.workPackageId) ??
				existing?.workPackageId ??
				null,
			recipeSnapshotId:
				normalizeDate(input.recipeSnapshotId) ??
				existing?.recipeSnapshotId ??
				null,
			summary: normalizeText(input.summary),
			notes: normalizeDate(input.notes),
			selectedDrawingPaths: normalizePaths(input.selectedDrawingPaths),
			selectedRegisterRowIds: normalizeStrings(input.selectedRegisterRowIds),
			selectedDrawingNumbers: normalizeStrings(input.selectedDrawingNumbers),
			selectedPdfFileIds: normalizeStrings(input.selectedPdfFileIds),
			snapshot: normalizeSnapshot(input.snapshot),
			createdAt: existing?.createdAt || timestamp,
			updatedAt: timestamp,
			issuedAt:
				status === "issued"
					? existing?.issuedAt || timestamp
					: (existing?.issuedAt ?? null),
		};
		const nextEntries = sortIssueSets([
			record,
			...existingEntries.filter((entry) => entry.id !== record.id),
		]);
		const persistError = await persistIssueSets(
			normalizedProjectId,
			nextEntries,
		);
		return {
			data: record,
			error: persistError,
		};
	},

	async deleteIssueSet(
		projectId: string,
		issueSetId: string,
	): Promise<{ success: boolean; error: Error | null }> {
		const normalizedProjectId = normalizeText(projectId);
		const normalizedIssueSetId = normalizeText(issueSetId);
		if (!normalizedProjectId || !normalizedIssueSetId) {
			return {
				success: false,
				error: new Error("Project id and issue set id are required."),
			};
		}
		const current = await this.fetchIssueSets(normalizedProjectId);
		const nextEntries = current.data.filter(
			(entry) => entry.id !== normalizedIssueSetId,
		);
		const persistError = await persistIssueSets(
			normalizedProjectId,
			nextEntries,
		);
		return {
			success: persistError === null,
			error: persistError,
		};
	},
};
