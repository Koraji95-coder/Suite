export interface AutodeskReferenceStandardFamily {
	id: string;
	label: string;
	kind: string;
	menuCount: number;
	totalEntryCount: number;
	topCategories: string[];
	fileNames: string[];
	includesLegacy: boolean;
}

interface AutodeskReferenceStandardsResponse {
	success?: boolean;
	requestId?: string;
	recommendedDefaults?: unknown;
	count?: unknown;
	standards?: unknown;
}

export interface AutodeskStandardsReferenceSummary {
	requestId: string | null;
	recommendedDefaults: string[];
	count: number;
	standards: AutodeskReferenceStandardFamily[];
}

function normalizeText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.map((entry) => normalizeText(entry))
				.filter((entry) => entry.length > 0)
		: [];
}

function normalizeFamily(value: unknown): AutodeskReferenceStandardFamily | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Record<string, unknown>;
	const id = normalizeText(candidate.id);
	const label = normalizeText(candidate.label);
	if (!id || !label) {
		return null;
	}

	return {
		id,
		label,
		kind: normalizeText(candidate.kind),
		menuCount:
			typeof candidate.menuCount === "number" ? candidate.menuCount : 0,
		totalEntryCount:
			typeof candidate.totalEntryCount === "number"
				? candidate.totalEntryCount
				: 0,
		topCategories: normalizeStringArray(candidate.topCategories),
		fileNames: normalizeStringArray(candidate.fileNames),
		includesLegacy: Boolean(candidate.includesLegacy),
	};
}

export async function fetchAutodeskStandardsReferenceSummary(): Promise<AutodeskStandardsReferenceSummary> {
	const response = await fetch("/api/autocad/reference/standards", {
		method: "GET",
		credentials: "include",
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Autodesk standards reference request failed with ${response.status}.`,
		);
	}

	const payload =
		(await response.json()) as AutodeskReferenceStandardsResponse | null;
	const standards = Array.isArray(payload?.standards)
		? payload.standards
				.map((entry) => normalizeFamily(entry))
				.filter(
					(
						entry,
					): entry is AutodeskReferenceStandardFamily => entry !== null,
				)
		: [];

	return {
		requestId: normalizeText(payload?.requestId) || null,
		recommendedDefaults: normalizeStringArray(payload?.recommendedDefaults),
		count:
			typeof payload?.count === "number" ? payload.count : standards.length,
		standards,
	};
}
