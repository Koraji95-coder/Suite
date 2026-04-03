import { logger } from "@/lib/logger";
import { loadSetting, saveSetting } from "@/settings/userSettings";
import {
	createProjectScopedFetchCache,
	getLocalStorageApi,
} from "@/services/projectWorkflowClientSupport";

export type ProjectReviewDecisionItemType = "title-block" | "standards";
export type ProjectReviewDecisionStatus = "accepted" | "waived";

export interface ProjectReviewDecisionRecord {
	id: string;
	projectId: string;
	issueSetId: string | null;
	itemId: string;
	itemType: ProjectReviewDecisionItemType;
	fingerprint: string;
	status: ProjectReviewDecisionStatus;
	note: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectReviewDecisionInput {
	projectId: string;
	issueSetId?: string | null;
	itemId: string;
	itemType: ProjectReviewDecisionItemType;
	fingerprint: string;
	status: ProjectReviewDecisionStatus;
	note?: string | null;
}

const REVIEW_DECISION_SETTING_KEY = "project_review_decisions_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-review-decisions";
const hasOwn = Object.prototype.hasOwnProperty;
const reviewDecisionFetchCache = createProjectScopedFetchCache<{
	data: ProjectReviewDecisionRecord[];
	error: Error | null;
}>();

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `project-review-decision-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}`;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeItemType(value: unknown): ProjectReviewDecisionItemType {
	return normalizeText(value) === "standards" ? "standards" : "title-block";
}

function normalizeStatus(value: unknown): ProjectReviewDecisionStatus {
	return normalizeText(value) === "waived" ? "waived" : "accepted";
}

function normalizeRecord(value: unknown): ProjectReviewDecisionRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as Partial<ProjectReviewDecisionRecord>;
	const projectId = normalizeText(candidate.projectId);
	const issueSetId = normalizeText(candidate.issueSetId) || null;
	const itemId = normalizeText(candidate.itemId);
	const fingerprint = normalizeText(candidate.fingerprint);
	if (!projectId || !itemId || !fingerprint) {
		return null;
	}

	const createdAt =
		normalizeText(candidate.createdAt) || new Date().toISOString();
	const updatedAt = normalizeText(candidate.updatedAt) || createdAt;

	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		issueSetId,
		itemId,
		itemType: normalizeItemType(candidate.itemType),
		fingerprint,
		status: normalizeStatus(candidate.status),
		note: normalizeText(candidate.note) || null,
		createdAt,
		updatedAt,
	};
}

function sortDecisions(entries: ProjectReviewDecisionRecord[]) {
	return [...entries].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function readLocalDecisions(projectId: string): ProjectReviewDecisionRecord[] {
	const storage = getLocalStorageApi();
	if (!storage) {
		return [];
	}

	try {
		const raw = storage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		return sortDecisions(
			parsed
				.map((entry) => normalizeRecord(entry))
				.filter(
					(entry): entry is ProjectReviewDecisionRecord => entry !== null,
				),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local project review decisions.",
			"ProjectReviewDecisionService",
			error,
		);
		return [];
	}
}

function writeLocalDecisions(
	projectId: string,
	entries: ProjectReviewDecisionRecord[],
) {
	const storage = getLocalStorageApi();
	if (!storage) {
		return;
	}

	try {
		storage.setItem(
			buildLocalStorageKey(projectId),
			JSON.stringify(sortDecisions(entries)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local project review decisions.",
			"ProjectReviewDecisionService",
			error,
		);
	}
}

async function persistDecisions(
	projectId: string,
	entries: ProjectReviewDecisionRecord[],
) {
	const sorted = sortDecisions(entries);
	const result = await saveSetting(
		REVIEW_DECISION_SETTING_KEY,
		sorted,
		projectId,
	);
	writeLocalDecisions(projectId, sorted);
	if (!result.success) {
		return new Error(
			result.error || "Unable to persist project review decisions.",
		);
	}
	return null;
}

export const projectReviewDecisionService = {
	async fetchDecisions(projectId: string): Promise<{
		data: ProjectReviewDecisionRecord[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const cached = reviewDecisionFetchCache.read(normalizedProjectId);
		if (cached) {
			return cached;
		}
		const inFlight =
			reviewDecisionFetchCache.readInFlight(normalizedProjectId);
		if (inFlight) {
			return await inFlight;
		}

		const localFallback = readLocalDecisions(normalizedProjectId);
		const loader = reviewDecisionFetchCache.writeInFlight(
			normalizedProjectId,
			(async () => {
				try {
					const stored = await loadSetting<unknown>(
						REVIEW_DECISION_SETTING_KEY,
						normalizedProjectId,
						null,
					);
					if (stored === null) {
						return reviewDecisionFetchCache.write(normalizedProjectId, {
							data: localFallback,
							error: null,
						});
					}
					if (!Array.isArray(stored)) {
						return reviewDecisionFetchCache.write(normalizedProjectId, {
							data: localFallback,
							error: new Error("Stored review decision data is invalid."),
						});
					}
					const normalized = sortDecisions(
						stored
							.map((entry) => normalizeRecord(entry))
							.filter(
								(entry): entry is ProjectReviewDecisionRecord => entry !== null,
							),
					);
					writeLocalDecisions(normalizedProjectId, normalized);
					return reviewDecisionFetchCache.write(normalizedProjectId, {
						data: normalized,
						error: null,
					});
				} catch (error) {
					return reviewDecisionFetchCache.write(normalizedProjectId, {
						data: localFallback,
						error:
							error instanceof Error
								? error
								: new Error("Unable to load review decisions."),
					});
				}
			})(),
		);

		try {
			return await loader;
		} finally {
			reviewDecisionFetchCache.clearInFlight(normalizedProjectId);
		}
	},

	async saveDecision(input: ProjectReviewDecisionInput): Promise<{
		data: ProjectReviewDecisionRecord | null;
		error: Error | null;
	}> {
		const projectId = normalizeText(input.projectId);
		const itemId = normalizeText(input.itemId);
		const fingerprint = normalizeText(input.fingerprint);
		if (!projectId || !itemId || !fingerprint) {
			return {
				data: null,
				error: new Error("Project id, item id, and fingerprint are required."),
			};
		}

		const existingResult = await this.fetchDecisions(projectId);
		const existing = existingResult.data.find(
			(entry) =>
				entry.itemId === itemId &&
				entry.itemType === normalizeItemType(input.itemType),
		);
		const normalizedIssueSetId = hasOwn.call(input, "issueSetId")
			? normalizeText(input.issueSetId) || null
			: existing?.issueSetId || null;
		const timestamp = new Date().toISOString();
		const record: ProjectReviewDecisionRecord = {
			id: existing?.id || createId(),
			projectId,
			issueSetId: normalizedIssueSetId,
			itemId,
			itemType: normalizeItemType(input.itemType),
			fingerprint,
			status: normalizeStatus(input.status),
			note: normalizeText(input.note) || null,
			createdAt: existing?.createdAt || timestamp,
			updatedAt: timestamp,
		};
		const nextEntries = sortDecisions([
			record,
			...existingResult.data.filter((entry) => entry.id !== record.id),
		]);
		const persistError = await persistDecisions(projectId, nextEntries);
		reviewDecisionFetchCache.write(projectId, {
			data: nextEntries,
			error: persistError,
		});
		return {
			data: record,
			error: persistError,
		};
	},

	async clearDecision(
		projectId: string,
		itemType: ProjectReviewDecisionItemType,
		itemId: string,
	): Promise<{ success: boolean; error: Error | null }> {
		const normalizedProjectId = normalizeText(projectId);
		const normalizedItemId = normalizeText(itemId);
		if (!normalizedProjectId || !normalizedItemId) {
			return {
				success: false,
				error: new Error("Project id and item id are required."),
			};
		}
		const current = await this.fetchDecisions(normalizedProjectId);
		const nextEntries = current.data.filter(
			(entry) =>
				!(
					entry.itemType === normalizeItemType(itemType) &&
					entry.itemId === normalizedItemId
				),
		);
		const persistError = await persistDecisions(
			normalizedProjectId,
			nextEntries,
		);
		reviewDecisionFetchCache.write(normalizedProjectId, {
			data: nextEntries,
			error: persistError,
		});
		return {
			success: persistError === null,
			error: persistError,
		};
	},
};
