export function sanitizeArray(values: string[] | undefined): string[] {
	return (values ?? []).map((value) => String(value || "").trim()).filter(Boolean);
}

export function normalizeSearch(value: string | undefined | null) {
	return String(value || "").trim().toLowerCase();
}
