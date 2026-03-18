import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";

export type {
	WorkLedgerFilters,
	WorkLedgerInput,
	WorkLedgerInsert,
	WorkLedgerPublishJobRow,
	WorkLedgerLifecycleState,
	WorkLedgerPublishResult,
	WorkLedgerPublishState,
	WorkLedgerOpenArtifactFolderResult,
	WorkLedgerRow,
	WorkLedgerUpdate,
	WorktalePublishPayload,
	WorktaleReadinessResponse,
} from "./work-ledger/types";

import type {
	WorkLedgerFilters,
	WorkLedgerInput,
	WorkLedgerInsert,
	WorkLedgerPublishJobRow,
	WorkLedgerPublishResult,
	WorkLedgerOpenArtifactFolderResult,
	WorkLedgerRow,
	WorkLedgerUpdate,
	WorktalePublishPayload,
	WorktaleReadinessResponse,
} from "./work-ledger/types";
import {
	buildLocalEntry,
	filterEntries,
	readLocalEntries,
	writeLocalEntries,
} from "./work-ledger/local";
import {
	getCurrentUserId,
	requestWorkLedgerApi,
	WorkLedgerApiError,
} from "./work-ledger/api";
import {
	normalizeLifecycleState,
	sanitizeArray,
} from "./work-ledger/helpers";
import {
	startRealtimeEntryListener,
	stopRealtimeIfIdle,
} from "./work-ledger/realtime";
import { buildWorktalePublishPayload as buildPayload } from "./work-ledger/payload";

type WorkLedgerListener = (entry: WorkLedgerRow) => void;

const listeners = new Set<WorkLedgerListener>();

function emit(entry: WorkLedgerRow) {
	listeners.forEach((listener) => listener(entry));
}

function normalizeWorkLedgerEntry(entry: WorkLedgerRow): WorkLedgerRow {
	return {
		...entry,
		lifecycle_state: normalizeLifecycleState(
			entry.lifecycle_state,
			entry.publish_state,
		),
	};
}

function normalizeWorkLedgerEntries(entries: WorkLedgerRow[]): WorkLedgerRow[] {
	return entries.map(normalizeWorkLedgerEntry);
}

function isMissingWorkLedgerSchema(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message || "")
		.toLowerCase()
		.trim();
	return (
		message.includes("work_ledger_entries") &&
		(message.includes("does not exist") ||
			message.includes("not found") ||
			message.includes("could not find"))
	);
}

function classifyPublisherError(error: unknown): Error {
	if (error instanceof WorkLedgerApiError) {
		if (error.status === 404) {
			return new Error(
				"Work Ledger publisher routes are unavailable. Restart the backend from this repo checkout.",
			);
		}
		if (error.status === 401 || error.status === 403) {
			return new Error("Sign in again to access Work Ledger publisher routes.");
		}
		return new Error(error.message || "Work Ledger publisher request failed.");
	}
	const rawMessage = String((error as { message?: unknown })?.message || "").trim();
	if (
		rawMessage.toLowerCase().includes("failed to fetch") ||
		rawMessage.toLowerCase().includes("networkerror")
	) {
		return new Error(
			"Work Ledger backend is unreachable. Start backend and verify Vite /api proxy target.",
		);
	}
	return new Error(rawMessage || "Work Ledger publisher request failed.");
}

export const buildWorktalePublishPayload: (
	entry: WorkLedgerRow,
) => WorktalePublishPayload = buildPayload;

export const workLedgerService = {
	subscribe(listener: WorkLedgerListener) {
		listeners.add(listener);
		void startRealtimeEntryListener(emit, getCurrentUserId);
		return () => {
			listeners.delete(listener);
			stopRealtimeIfIdle(() => listeners.size > 0);
		};
	},

	async fetchEntries(filters?: WorkLedgerFilters) {
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: filterEntries(normalizeWorkLedgerEntries(readLocalEntries()), filters),
				error: null,
			};
		}

		const limit = Math.max(1, filters?.limit ?? 12);
		const result = await safeSupabaseQuery(
			async () => {
				let query = supabase
					.from("work_ledger_entries")
					.select("*")
					.eq("user_id", userId)
					.order("updated_at", { ascending: false })
					.limit(limit * 3);
				if (filters?.projectId) {
					query = query.eq("project_id", filters.projectId);
				}
				if (filters?.appArea) {
					query = query.eq("app_area", filters.appArea);
				}
				if (filters?.lifecycleState && filters.lifecycleState !== "all") {
					query = query.eq("lifecycle_state", filters.lifecycleState);
				}
				if (filters?.publishState && filters.publishState !== "all") {
					query = query.eq("publish_state", filters.publishState);
				}
				return await query;
			},
			"WorkLedgerService",
		);

		const localFallback = filterEntries(
			normalizeWorkLedgerEntries(readLocalEntries()),
			filters,
		);
		const remoteRows = normalizeWorkLedgerEntries(
			(result.data ?? []) as WorkLedgerRow[],
		);

		if (result.error) {
			if (isMissingWorkLedgerSchema(result.error)) {
				return {
					data: localFallback,
					error: new Error(
						"Supabase schema is missing `work_ledger_entries`. Apply consolidated migration to enable hosted Work Ledger storage.",
					),
				};
			}
			return {
				data: localFallback.length > 0 ? localFallback : filterEntries(remoteRows, filters),
				error: new Error(
					String(result.error.message || "Work ledger query failed."),
				),
			};
		}

		return {
			data: filterEntries(remoteRows, filters),
			error: null,
		};
	},

	async createEntry(input: WorkLedgerInput): Promise<WorkLedgerRow | null> {
		const userId = await getCurrentUserId();
		if (!userId) {
			const localEntry = buildLocalEntry(input, null);
			const current = readLocalEntries();
			writeLocalEntries([localEntry, ...current]);
			const normalized = normalizeWorkLedgerEntry(localEntry);
			emit(normalized);
			return normalized;
		}

		const payload: WorkLedgerInsert = {
			title: String(input.title || "").trim(),
			summary: String(input.summary || "").trim(),
			source_kind: input.sourceKind ?? "manual",
			commit_refs: sanitizeArray(input.commitRefs),
			project_id: input.projectId ?? null,
			app_area: String(input.appArea || "").trim() || null,
			architecture_paths: sanitizeArray(input.architecturePaths),
			hotspot_ids: sanitizeArray(input.hotspotIds),
			lifecycle_state: input.lifecycleState ?? "completed",
			publish_state: input.publishState ?? "draft",
			external_reference: String(input.externalReference || "").trim() || null,
			external_url: String(input.externalUrl || "").trim() || null,
			user_id: userId,
		};

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("work_ledger_entries")
					.insert(payload)
					.select("*")
					.maybeSingle(),
			"WorkLedgerService",
		);

		if (result.data) {
			const entry = normalizeWorkLedgerEntry(result.data as WorkLedgerRow);
			emit(entry);
			return entry;
		}

		const fallback = buildLocalEntry(input, userId);
		const normalized = normalizeWorkLedgerEntry(fallback);
		emit(normalized);
		return normalized;
	},

	async updateEntry(
		entryId: string,
		patch: Partial<WorkLedgerInput>,
	): Promise<WorkLedgerRow | null> {
		const normalizedId = String(entryId || "").trim();
		if (!normalizedId) return null;

		const userId = await getCurrentUserId();
		if (!userId) {
			const current = readLocalEntries();
			const next = current.map((entry) =>
				entry.id === normalizedId
					? {
							...entry,
							title: patch.title ? patch.title.trim() : entry.title,
							summary: patch.summary ? patch.summary.trim() : entry.summary,
							source_kind: patch.sourceKind ?? entry.source_kind,
							commit_refs: patch.commitRefs
								? sanitizeArray(patch.commitRefs)
								: entry.commit_refs,
							project_id:
								patch.projectId === undefined ? entry.project_id : patch.projectId,
							app_area:
								patch.appArea === undefined
									? entry.app_area
									: String(patch.appArea || "").trim() || null,
							architecture_paths: patch.architecturePaths
								? sanitizeArray(patch.architecturePaths)
								: entry.architecture_paths,
							hotspot_ids: patch.hotspotIds
								? sanitizeArray(patch.hotspotIds)
								: entry.hotspot_ids,
							lifecycle_state:
								patch.lifecycleState === undefined
									? normalizeLifecycleState(
											entry.lifecycle_state,
											entry.publish_state,
										)
									: patch.lifecycleState,
							publish_state: patch.publishState ?? entry.publish_state,
							published_at: entry.published_at,
							external_reference:
								patch.externalReference === undefined
									? entry.external_reference
									: String(patch.externalReference || "").trim() || null,
							external_url:
								patch.externalUrl === undefined
									? entry.external_url
									: String(patch.externalUrl || "").trim() || null,
							updated_at: new Date().toISOString(),
						}
					: entry,
			);
			writeLocalEntries(next);
			const updated = next.find((entry) => entry.id === normalizedId) ?? null;
			if (updated) {
				const normalized = normalizeWorkLedgerEntry(updated);
				emit(normalized);
				return normalized;
			}
			return null;
		}

		const payload: WorkLedgerUpdate = {
			title: patch.title?.trim(),
			summary: patch.summary?.trim(),
			source_kind: patch.sourceKind,
			commit_refs: patch.commitRefs ? sanitizeArray(patch.commitRefs) : undefined,
			project_id: patch.projectId,
			app_area:
				patch.appArea === undefined
					? undefined
					: String(patch.appArea || "").trim() || null,
			architecture_paths: patch.architecturePaths
				? sanitizeArray(patch.architecturePaths)
				: undefined,
			hotspot_ids: patch.hotspotIds ? sanitizeArray(patch.hotspotIds) : undefined,
			lifecycle_state: patch.lifecycleState,
			publish_state: patch.publishState,
			external_reference:
				patch.externalReference === undefined
					? undefined
					: String(patch.externalReference || "").trim() || null,
			external_url:
				patch.externalUrl === undefined
					? undefined
					: String(patch.externalUrl || "").trim() || null,
		};

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("work_ledger_entries")
					.update(payload)
					.eq("id", normalizedId)
					.eq("user_id", userId)
					.select("*")
					.maybeSingle(),
			"WorkLedgerService",
		);

		if (result.data) {
			const entry = normalizeWorkLedgerEntry(result.data as WorkLedgerRow);
			emit(entry);
			return entry;
		}

		return null;
	},

	async fetchWorktaleReadiness(): Promise<{
		data: WorktaleReadinessResponse | null;
		error: Error | null;
	}> {
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: null,
				error: new Error("Sign in to use Worktale publishing."),
			};
		}
		try {
			const payload = (await requestWorkLedgerApi(
				"/api/work-ledger/publishers/worktale/readiness",
				{ method: "GET" },
			)) as WorktaleReadinessResponse;
			return {
				data: payload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: classifyPublisherError(error),
			};
		}
	},

	async bootstrapWorktale(): Promise<{
		data: WorktaleReadinessResponse | null;
		error: Error | null;
	}> {
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: null,
				error: new Error("Sign in to bootstrap Worktale."),
			};
		}
		try {
			const payload = (await requestWorkLedgerApi(
				"/api/work-ledger/publishers/worktale/bootstrap",
				{ method: "POST" },
			)) as WorktaleReadinessResponse;
			return {
				data: payload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: classifyPublisherError(error),
			};
		}
	},

	async publishEntryToWorktale(entryId: string): Promise<{
		data: WorkLedgerPublishResult | null;
		error: Error | null;
	}> {
		const normalizedId = String(entryId || "").trim();
		if (!normalizedId) {
			return {
				data: null,
				error: new Error("Entry id is required."),
			};
		}
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: null,
				error: new Error("Sign in to publish to Worktale."),
			};
		}
		try {
			const payload = (await requestWorkLedgerApi(
				`/api/work-ledger/entries/${encodeURIComponent(normalizedId)}/publish/worktale`,
				{ method: "POST" },
			)) as WorkLedgerPublishResult;
			const normalizedPayload = {
				...payload,
				entry: normalizeWorkLedgerEntry(payload.entry),
			};
			return {
				data: normalizedPayload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: classifyPublisherError(error),
			};
		}
	},

	async listPublishJobs(
		entryId: string,
		limit = 12,
	): Promise<{
		data: WorkLedgerPublishJobRow[];
		error: Error | null;
	}> {
		const normalizedId = String(entryId || "").trim();
		if (!normalizedId) {
			return {
				data: [],
				error: new Error("Entry id is required."),
			};
		}
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: [],
				error: new Error("Sign in to load publish receipts."),
			};
		}
		try {
			const payload = (await requestWorkLedgerApi(
				`/api/work-ledger/entries/${encodeURIComponent(normalizedId)}/publish-jobs?limit=${Math.max(
					1,
					Math.min(200, Math.trunc(limit || 12)),
				)}`,
				{ method: "GET" },
			)) as { jobs?: WorkLedgerPublishJobRow[] };
			return {
				data: Array.isArray(payload.jobs) ? payload.jobs : [],
				error: null,
			};
		} catch (error) {
			return {
				data: [],
				error: classifyPublisherError(error),
			};
		}
	},

	async openPublishJobArtifactFolder(
		entryId: string,
		jobId: string,
	): Promise<{
		data: WorkLedgerOpenArtifactFolderResult | null;
		error: Error | null;
	}> {
		const normalizedEntryId = String(entryId || "").trim();
		const normalizedJobId = String(jobId || "").trim();
		if (!normalizedEntryId || !normalizedJobId) {
			return {
				data: null,
				error: new Error("Entry id and job id are required."),
			};
		}
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: null,
				error: new Error("Sign in to open publish artifacts."),
			};
		}
		try {
			const payload = (await requestWorkLedgerApi(
				`/api/work-ledger/entries/${encodeURIComponent(normalizedEntryId)}/publish-jobs/${encodeURIComponent(
					normalizedJobId,
				)}/open-artifact-folder`,
				{ method: "POST" },
			)) as WorkLedgerOpenArtifactFolderResult;
			return {
				data: payload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: classifyPublisherError(error),
			};
		}
	},
};
