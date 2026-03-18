import type { WorkLedgerPublishState } from "@/services/workLedgerService";

export interface WorkLedgerNavigationFilters {
	projectId?: string | null;
	query?: string | null;
	path?: string | null;
	hotspot?: string | null;
	publishState?: WorkLedgerPublishState | "all" | null;
}

function setIfPresent(
	params: URLSearchParams,
	key: string,
	value: string | null | undefined,
) {
	const normalizedValue = String(value || "").trim();
	if (!normalizedValue || normalizedValue === "all") return;
	params.set(key, normalizedValue);
}

export function buildChangelogSearchParams(
	filters: WorkLedgerNavigationFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	setIfPresent(params, "project", filters.projectId);
	setIfPresent(params, "query", filters.query);
	setIfPresent(params, "path", filters.path);
	setIfPresent(params, "hotspot", filters.hotspot);
	setIfPresent(params, "publishState", filters.publishState ?? null);
	setIfPresent(params, "focus", "ledger");
	return params;
}

export function buildDashboardLedgerSearchParams(
	filters: WorkLedgerNavigationFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	setIfPresent(params, "project", filters.projectId);
	setIfPresent(params, "query", filters.query);
	setIfPresent(params, "path", filters.path);
	setIfPresent(params, "hotspot", filters.hotspot);
	setIfPresent(params, "publishState", filters.publishState ?? null);
	setIfPresent(params, "focus", "ledger");
	return params;
}
