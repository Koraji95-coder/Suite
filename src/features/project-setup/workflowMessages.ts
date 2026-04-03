import type { TitleBlockSyncResponse } from "./types";

export function normalizeTitleBlockWorkflowMessage(message: string) {
	const normalized = String(message || "").trim();
	if (!normalized) {
		return "";
	}

	const lower = normalized.toLowerCase();

	if (
		lower.includes("autocad scan bridge unavailable") ||
		lower.includes("autocad bridge is not configured") ||
		(lower.includes("filename-only fallback") && lower.includes("dwg metadata"))
	) {
		return "Live drawing metadata is not connected right now, so Suite is pairing drawing rows by filename until the DWG bridge is available.";
	}

	if (lower.includes("project_title_block_profiles")) {
		return "";
	}

	if (lower.includes("drawing_revision_register_entries")) {
		return "Hosted revision history is unavailable right now, so Suite is using local revision data where available.";
	}

	return normalized;
}

export function normalizeTitleBlockWorkflowWarnings(warnings: string[]) {
	const uniqueWarnings = new Set<string>();
	for (const warning of warnings) {
		const normalized = normalizeTitleBlockWorkflowMessage(warning);
		if (normalized) {
			uniqueWarnings.add(normalized);
		}
	}
	return Array.from(uniqueWarnings);
}

export function buildTitleBlockSyncFailureMessage(
	response:
		| Pick<TitleBlockSyncResponse, "message" | "warnings">
		| null
		| undefined,
	fallback: string,
) {
	const base =
		normalizeTitleBlockWorkflowMessage(response?.message || fallback) || fallback;
	const detail = normalizeTitleBlockWorkflowWarnings(response?.warnings || []).find(
		(warning) => warning && warning !== base,
	);
	if (!detail) {
		return base;
	}
	if (!base) {
		return detail;
	}
	if (base.includes(detail)) {
		return base;
	}
	return `${base} ${detail}`;
}
