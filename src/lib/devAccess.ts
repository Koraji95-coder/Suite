export function normalizeEmail(email: string | null | undefined): string {
	return (email ?? "").trim().toLowerCase();
}

function parseAdminEmailList(value: string | undefined): string[] {
	if (!value) return [];

	return value
		.split(",")
		.map((entry) => normalizeEmail(entry))
		.filter(Boolean);
}

export function getDevAdminEmails(): string[] {
	const explicitList = parseAdminEmailList(
		import.meta.env.VITE_DEV_ADMIN_EMAILS,
	);
	if (explicitList.length > 0) {
		return explicitList;
	}

	const single = normalizeEmail(import.meta.env.VITE_DEV_ADMIN_EMAIL);
	return single ? [single] : [];
}

export function isDevAdminEmail(email: string | null | undefined): boolean {
	if (!import.meta.env.DEV) return false;

	const normalized = normalizeEmail(email);
	if (!normalized) return false;

	return getDevAdminEmails().includes(normalized);
}
