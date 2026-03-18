type CompareFeedbackImportPayload = {
	events: unknown[];
	pairs: unknown[];
	metrics: unknown[];
};

export function buildJsonDownloadPackage<T>(payload: T, filename: string) {
	return {
		filename,
		text: JSON.stringify(payload, null, 2),
	};
}

export function parseCompareFeedbackImportPayload(
	raw: Record<string, unknown>,
): CompareFeedbackImportPayload {
	return {
		events: Array.isArray(raw.events) ? raw.events : [],
		pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
		metrics: Array.isArray(raw.metrics) ? raw.metrics : [],
	};
}
