import { hasAdminClaim } from "./roles";

export function normalizeEmail(email: string | null | undefined): string {
	return (email ?? "").trim().toLowerCase();
}

type AuthLikeUser =
	| {
			email?: string | null;
			app_metadata?: Record<string, unknown> | null;
	  }
	| null
	| undefined;

function parseAdminEmailList(value: string | undefined): string[] {
	if (!value) return [];

	return value
		.split(",")
		.map((entry) => normalizeEmail(entry))
		.filter(Boolean);
}

type DevAdminSource = "hybrid" | "supabase" | "allowlist";

function getDevAdminSource(): DevAdminSource {
	const raw = String(import.meta.env.VITE_DEV_ADMIN_SOURCE || "")
		.trim()
		.toLowerCase();
	if (raw === "supabase" || raw === "allowlist") {
		return raw;
	}
	return "hybrid";
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
	const source = getDevAdminSource();
	if (source === "supabase") return false;

	const allowlist = getDevAdminEmails();
	if (allowlist.length === 0) return source === "hybrid";

	const normalized = normalizeEmail(email);
	if (!normalized) return false;

	return allowlist.includes(normalized);
}

export function isCommandCenterAuthorized(user: AuthLikeUser): boolean {
	// Temporary policy: Command Center is disabled in production.
	if (!import.meta.env.DEV) {
		return false;
	}

	const source = getDevAdminSource();
	const hasClaim = hasAdminClaim(user);
	if (source === "supabase") {
		return hasClaim;
	}

	// Development policy:
	// 1) Admin claim always allowed.
	// 2) Fallback to DEV allowlist for local workflows.
	// 3) If no allowlist is set in DEV, allow by default.
	if (hasClaim) return true;

	const allowlist = getDevAdminEmails();
	if (allowlist.length === 0) return source === "hybrid";

	const normalized = normalizeEmail(user?.email ?? null);
	if (!normalized) return false;
	return allowlist.includes(normalized);
}
