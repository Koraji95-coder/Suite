import { logger } from "@/lib/logger";
import type { WorkLedgerFilters, WorkLedgerInput, WorkLedgerRow } from "./types";
import { normalizeLifecycleState, normalizeSearch, sanitizeArray } from "./helpers";

const LOCAL_STORAGE_KEY = "suite:work-ledger:local";

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `work-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function readLocalEntries(): WorkLedgerRow[] {
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

export function writeLocalEntries(entries: WorkLedgerRow[]) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
	} catch (error) {
		logger.warn("WorkLedgerService", "Unable to persist local work ledger", {
			error,
		});
	}
}

export function buildLocalEntry(input: WorkLedgerInput, userId: string | null): WorkLedgerRow {
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
		lifecycle_state: input.lifecycleState ?? "completed",
		publish_state: input.publishState ?? "draft",
		published_at: null,
		external_reference: String(input.externalReference || "").trim() || null,
		external_url: String(input.externalUrl || "").trim() || null,
		user_id: userId ?? "local",
		created_at: timestamp,
		updated_at: timestamp,
	};
}

export function filterEntries(entries: WorkLedgerRow[], filters?: WorkLedgerFilters) {
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
			!filters?.lifecycleState || filters.lifecycleState === "all"
				? true
				: normalizeLifecycleState(
						entry.lifecycle_state,
						entry.publish_state,
					) === filters.lifecycleState,
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
