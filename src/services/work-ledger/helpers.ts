import type {
	WorkLedgerLifecycleState,
	WorkLedgerPublishState,
} from "./types";

export function sanitizeArray(values: string[] | undefined): string[] {
	return (values ?? []).map((value) => String(value || "").trim()).filter(Boolean);
}

export function normalizeSearch(value: string | undefined | null) {
	return String(value || "").trim().toLowerCase();
}

export function normalizeLifecycleState(
	value: unknown,
	publishState: WorkLedgerPublishState | string | null | undefined,
): WorkLedgerLifecycleState {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (
		normalized === "planned" ||
		normalized === "active" ||
		normalized === "completed" ||
		normalized === "archived"
	) {
		return normalized;
	}
	if (publishState === "published") {
		return "completed";
	}
	return "active";
}
