import type { RealtimeChannel } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { isSupabaseConfigured, safeSupabaseQuery } from "@/supabase/utils";

export type WorkLedgerRow =
	Database["public"]["Tables"]["work_ledger_entries"]["Row"];
export type WorkLedgerInsert =
	Database["public"]["Tables"]["work_ledger_entries"]["Insert"];
export type WorkLedgerUpdate =
	Database["public"]["Tables"]["work_ledger_entries"]["Update"];
export type WorkLedgerPublishJobRow =
	Database["public"]["Tables"]["work_ledger_publish_jobs"]["Row"];

export type WorkLedgerSourceKind =
	| "manual"
	| "git_checkpoint"
	| "agent_run"
	| "watchdog"
	| "architecture"
	| "project";

export type WorkLedgerPublishState = "draft" | "ready" | "published";

export interface WorkLedgerInput {
	title: string;
	summary: string;
	sourceKind?: WorkLedgerSourceKind;
	commitRefs?: string[];
	projectId?: string | null;
	appArea?: string | null;
	architecturePaths?: string[];
	hotspotIds?: string[];
	publishState?: WorkLedgerPublishState;
	externalReference?: string | null;
	externalUrl?: string | null;
}

export interface WorkLedgerFilters {
	projectId?: string | null;
	appArea?: string | null;
	publishState?: WorkLedgerPublishState | "all";
	pathQuery?: string;
	search?: string;
	limit?: number;
}

export interface WorktalePublishPayload {
	title: string;
	summary: string;
	markdown: string;
	json: Record<string, unknown>;
}

export interface WorktaleReadinessChecks {
	cliInstalled: boolean;
	cliPath: string;
	repoPath: string;
	repoExists: boolean;
	gitRepository: boolean;
	gitEmailConfigured: boolean;
	gitEmail: string;
	bootstrapped: boolean;
}

export interface WorktaleReadinessResponse {
	ok: boolean;
	publisher: "worktale";
	workstationId: string;
	ready: boolean;
	checks: WorktaleReadinessChecks;
	issues: string[];
	recommendedActions: string[];
}

export interface WorkLedgerPublishResult {
	ok: boolean;
	entry: WorkLedgerRow;
	job: WorkLedgerPublishJobRow;
	artifacts: {
		artifactDir: string;
		markdownPath: string;
		jsonPath: string;
	};
	publisher: "worktale";
	workstationId: string;
	ready: boolean;
	checks: WorktaleReadinessChecks;
	issues: string[];
	recommendedActions: string[];
}

export interface WorkLedgerOpenArtifactFolderResult {
	ok: boolean;
	entryId: string;
	jobId: string;
	artifactDir: string;
}

type WorkLedgerListener = (entry: WorkLedgerRow) => void;

const LOCAL_STORAGE_KEY = "suite:work-ledger:local";
const listeners = new Set<WorkLedgerListener>();
let realtimeChannel: RealtimeChannel | null = null;
let realtimeUserId: string | null = null;
let warnedMissingUser = false;

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `work-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function emit(entry: WorkLedgerRow) {
	listeners.forEach((listener) => listener(entry));
}

async function getCurrentUserId(): Promise<string | null> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		if (!warnedMissingUser) {
			logger.warn("WorkLedgerService", "Missing authenticated user", { error });
			warnedMissingUser = true;
		}
		return null;
	}
	warnedMissingUser = false;
	return user.id;
}

async function getSupabaseAccessToken(): Promise<string | null> {
	try {
		const {
			data: { session },
			error,
		} = await supabase.auth.getSession();
		if (error || !session?.access_token) return null;
		return String(session.access_token);
	} catch {
		return null;
	}
}

async function parseApiError(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as unknown;
		if (payload && typeof payload === "object") {
			const value = String(
				(payload as Record<string, unknown>).error ||
					(payload as Record<string, unknown>).message ||
					"",
			).trim();
			if (value) return value;
		}
	} catch {
		// No-op; fallback to raw response text.
	}
	const text = await response.text().catch(() => "");
	return text || `HTTP ${response.status}`;
}

async function requestWorkLedgerApi(
	path: string,
	init: RequestInit = {},
): Promise<unknown> {
	const accessToken = await getSupabaseAccessToken();
	const headers = new Headers(init.headers || {});
	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}
	const response = await fetch(path, {
		...init,
		headers,
		credentials: "include",
	});
	if (!response.ok) {
		throw new Error(await parseApiError(response));
	}
	return (await response.json()) as unknown;
}

function sanitizeArray(values: string[] | undefined): string[] {
	return (values ?? []).map((value) => String(value || "").trim()).filter(Boolean);
}

function normalizeSearch(value: string | undefined | null) {
	return String(value || "").trim().toLowerCase();
}

function readLocalEntries(): WorkLedgerRow[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry) => entry && typeof entry === "object") as WorkLedgerRow[];
	} catch {
		return [];
	}
}

function writeLocalEntries(entries: WorkLedgerRow[]) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
	} catch (error) {
		logger.warn("WorkLedgerService", "Unable to persist local work ledger", {
			error,
		});
	}
}

function buildLocalEntry(
	input: WorkLedgerInput,
	userId: string | null,
): WorkLedgerRow {
	const timestamp = new Date().toISOString();
	return {
		id: createId(),
		title: String(input.title || "").trim(),
		summary: String(input.summary || "").trim(),
		source_kind: input.sourceKind ?? "manual",
		commit_refs: sanitizeArray(input.commitRefs),
		project_id: input.projectId ?? null,
		app_area: String(input.appArea || "").trim() || null,
		architecture_paths: sanitizeArray(input.architecturePaths),
		hotspot_ids: sanitizeArray(input.hotspotIds),
		publish_state: input.publishState ?? "draft",
		published_at: null,
		external_reference: String(input.externalReference || "").trim() || null,
		external_url: String(input.externalUrl || "").trim() || null,
		user_id: userId ?? "local",
		created_at: timestamp,
		updated_at: timestamp,
	};
}

function filterEntries(entries: WorkLedgerRow[], filters?: WorkLedgerFilters) {
	const search = normalizeSearch(filters?.search);
	const pathQuery = normalizeSearch(filters?.pathQuery);

	return [...entries]
		.filter((entry) =>
			!filters?.projectId ? true : entry.project_id === filters.projectId,
		)
		.filter((entry) =>
			!filters?.appArea ? true : entry.app_area === filters.appArea,
		)
		.filter((entry) =>
			!filters?.publishState || filters.publishState === "all"
				? true
				: entry.publish_state === filters.publishState,
		)
		.filter((entry) =>
			!pathQuery
				? true
				: entry.architecture_paths.some((pathValue) =>
						pathValue.toLowerCase().includes(pathQuery),
					) || entry.hotspot_ids.some((hotspotId) =>
						hotspotId.toLowerCase().includes(pathQuery),
					),
		)
		.filter((entry) =>
			!search
				? true
				: [entry.title, entry.summary, entry.app_area, entry.external_reference]
						.map((value) => String(value || "").toLowerCase())
						.some((value) => value.includes(search)) ||
					entry.commit_refs.some((value) =>
						value.toLowerCase().includes(search),
					) ||
					entry.architecture_paths.some((value) =>
						value.toLowerCase().includes(search),
					) ||
					entry.hotspot_ids.some((value) =>
						value.toLowerCase().includes(search),
					),
		)
		.sort((left, right) => right.updated_at.localeCompare(left.updated_at))
		.slice(0, Math.max(1, filters?.limit ?? 12));
}

async function startRealtime() {
	if (!isSupabaseConfigured()) return;
	const userId = await getCurrentUserId();
	if (!userId) return;

	if (realtimeChannel && realtimeUserId === userId) return;

	if (realtimeChannel) {
		supabase.removeChannel(realtimeChannel);
		realtimeChannel = null;
	}

	realtimeUserId = userId;
	realtimeChannel = supabase
		.channel(`work_ledger_entries:${userId}`)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "work_ledger_entries",
				filter: `user_id=eq.${userId}`,
			},
			(payload) => {
				if (payload.new && typeof payload.new === "object") {
					emit(payload.new as WorkLedgerRow);
				}
			},
		)
		.subscribe((status) => {
			if (status === "CHANNEL_ERROR") {
				logger.warn("WorkLedgerService", "Realtime channel error");
			}
		});
}

function stopRealtimeIfIdle() {
	if (listeners.size > 0 || !realtimeChannel) return;
	supabase.removeChannel(realtimeChannel);
	realtimeChannel = null;
	realtimeUserId = null;
}

export function buildWorktalePublishPayload(entry: WorkLedgerRow): WorktalePublishPayload {
	const lines = [
		`# ${entry.title}`,
		"",
		entry.summary,
		"",
		`- Source: ${entry.source_kind}`,
		`- Publish state: ${entry.publish_state}`,
	];

	if (entry.project_id) {
		lines.push(`- Project: ${entry.project_id}`);
	}
	if (entry.app_area) {
		lines.push(`- App area: ${entry.app_area}`);
	}
	if (entry.commit_refs.length > 0) {
		lines.push(`- Commits: ${entry.commit_refs.join(", ")}`);
	}
	if (entry.architecture_paths.length > 0) {
		lines.push(`- Paths: ${entry.architecture_paths.join(", ")}`);
	}
	if (entry.hotspot_ids.length > 0) {
		lines.push(`- Hotspots: ${entry.hotspot_ids.join(", ")}`);
	}
	if (entry.external_reference) {
		lines.push(`- External reference: ${entry.external_reference}`);
	}
	if (entry.external_url) {
		lines.push(`- External URL: ${entry.external_url}`);
	}

	return {
		title: entry.title,
		summary: entry.summary,
		markdown: lines.join("\n"),
		json: {
			id: entry.id,
			title: entry.title,
			summary: entry.summary,
			sourceKind: entry.source_kind,
			commitRefs: entry.commit_refs,
			projectId: entry.project_id,
			appArea: entry.app_area,
			architecturePaths: entry.architecture_paths,
			hotspotIds: entry.hotspot_ids,
			publishState: entry.publish_state,
			publishedAt: entry.published_at,
			externalReference: entry.external_reference,
			externalUrl: entry.external_url,
			updatedAt: entry.updated_at,
		},
	};
}

export const workLedgerService = {
	subscribe(listener: WorkLedgerListener) {
		listeners.add(listener);
		void startRealtime();
		return () => {
			listeners.delete(listener);
			stopRealtimeIfIdle();
		};
	},

	async fetchEntries(filters?: WorkLedgerFilters) {
		const userId = await getCurrentUserId();
		if (!userId) {
			return {
				data: filterEntries(readLocalEntries(), filters),
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
				if (filters?.publishState && filters.publishState !== "all") {
					query = query.eq("publish_state", filters.publishState);
				}
				return await query;
			},
			"WorkLedgerService",
		);

		return {
			data: filterEntries((result.data ?? []) as WorkLedgerRow[], filters),
			error: result.error,
		};
	},

	async createEntry(input: WorkLedgerInput): Promise<WorkLedgerRow | null> {
		const userId = await getCurrentUserId();
		if (!userId) {
			const localEntry = buildLocalEntry(input, null);
			const current = readLocalEntries();
			writeLocalEntries([localEntry, ...current]);
			emit(localEntry);
			return localEntry;
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
			const entry = result.data as WorkLedgerRow;
			emit(entry);
			return entry;
		}

		const fallback = buildLocalEntry(input, userId);
		emit(fallback);
		return fallback;
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
			if (updated) emit(updated);
			return updated;
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
			const entry = result.data as WorkLedgerRow;
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
				error: error instanceof Error ? error : new Error(String(error)),
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
				error: error instanceof Error ? error : new Error(String(error)),
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
			return {
				data: payload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: error instanceof Error ? error : new Error(String(error)),
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
				`/api/work-ledger/entries/${encodeURIComponent(normalizedId)}/publish-jobs?limit=${Math.max(1, Math.min(200, Math.trunc(limit || 12)))}`,
				{ method: "GET" },
			)) as { jobs?: WorkLedgerPublishJobRow[] };
			return {
				data: Array.isArray(payload.jobs) ? payload.jobs : [],
				error: null,
			};
		} catch (error) {
			return {
				data: [],
				error: error instanceof Error ? error : new Error(String(error)),
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
				`/api/work-ledger/entries/${encodeURIComponent(normalizedEntryId)}/publish-jobs/${encodeURIComponent(normalizedJobId)}/open-artifact-folder`,
				{ method: "POST" },
			)) as WorkLedgerOpenArtifactFolderResult;
			return {
				data: payload,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	},
};
