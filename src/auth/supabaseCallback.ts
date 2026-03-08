const ALLOWED_SUPABASE_CALLBACK_PATHS = new Set([
	"/login",
	"/signup",
	"/agent/pairing-callback",
	"/app/agent/pairing-callback",
]);

const REQUIRED_SUPABASE_SESSION_KEYS = [
	"access_token",
	"refresh_token",
	"token_type",
] as const;
const EXPIRY_SUPABASE_SESSION_KEYS = ["expires_in", "expires_at"] as const;

const SUPABASE_AUTH_PARAM_KEYS = new Set([
	"access_token",
	"refresh_token",
	"expires_in",
	"expires_at",
	"token_type",
	"provider_token",
	"provider_refresh_token",
	"scope",
	"error",
	"error_code",
	"error_description",
]);

const CALLBACK_FINGERPRINT_STORAGE_KEY = "suite:supabase-callback-fingerprint";

type SupabaseCallbackParams = Record<string, string>;

function normalizePathname(pathname: string): string {
	const value = String(pathname || "").trim();
	if (!value) {
		return "/";
	}
	if (value.length > 1 && value.endsWith("/")) {
		return value.slice(0, -1);
	}
	return value;
}

function createDeterministicHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function removeSupabaseAuthParams(params: URLSearchParams): boolean {
	let changed = false;
	for (const key of SUPABASE_AUTH_PARAM_KEYS) {
		if (params.has(key)) {
			params.delete(key);
			changed = true;
		}
	}
	return changed;
}

function buildCallbackFingerprint(params: SupabaseCallbackParams): string {
	const source = [
		params.access_token || "",
		params.refresh_token || "",
		params.expires_in || "",
		params.expires_at || "",
		params.token_type || "",
	].join("|");
	return createDeterministicHash(source);
}

function readConsumedCallbackFingerprint(): string {
	try {
		return window.sessionStorage.getItem(CALLBACK_FINGERPRINT_STORAGE_KEY) || "";
	} catch {
		return "";
	}
}

function storeConsumedCallbackFingerprint(fingerprint: string): void {
	try {
		window.sessionStorage.setItem(CALLBACK_FINGERPRINT_STORAGE_KEY, fingerprint);
	} catch {
		// Ignore storage errors and continue without duplicate-suppression memory.
	}
}

export function hasSupabaseSessionCallbackParams(
	params: SupabaseCallbackParams,
): boolean {
	const hasRequiredKeys = REQUIRED_SUPABASE_SESSION_KEYS.every((key) => {
		return typeof params[key] === "string" && params[key].trim().length > 0;
	});
	if (!hasRequiredKeys) {
		return false;
	}
	return EXPIRY_SUPABASE_SESSION_KEYS.some((key) => {
		return typeof params[key] === "string" && params[key].trim().length > 0;
	});
}

export function isAllowedSupabaseCallbackPath(pathname: string): boolean {
	return ALLOWED_SUPABASE_CALLBACK_PATHS.has(normalizePathname(pathname));
}

export function shouldDetectSupabaseSessionInUrl(
	url: URL,
	params: SupabaseCallbackParams,
): boolean {
	if (!isAllowedSupabaseCallbackPath(url.pathname)) {
		return false;
	}
	if (!hasSupabaseSessionCallbackParams(params)) {
		return false;
	}
	if (typeof window === "undefined") {
		return true;
	}

	const fingerprint = buildCallbackFingerprint(params);
	if (!fingerprint) {
		return true;
	}
	if (readConsumedCallbackFingerprint() === fingerprint) {
		return false;
	}
	storeConsumedCallbackFingerprint(fingerprint);
	return true;
}

export function stripSupabaseAuthParamsFromSearch(search: string): string {
	const raw = String(search || "");
	if (!raw) {
		return "";
	}
	const normalized = raw.startsWith("?") ? raw.slice(1) : raw;
	const params = new URLSearchParams(normalized);
	const changed = removeSupabaseAuthParams(params);
	if (!changed) {
		return raw;
	}
	const next = params.toString();
	return next ? `?${next}` : "";
}

export function stripSupabaseAuthParamsFromHash(hash: string): string {
	const rawHash = String(hash || "");
	if (!rawHash) {
		return "";
	}
	const trimmed = rawHash.replace(/^#/, "");
	if (!trimmed) {
		return "";
	}

	if (trimmed.startsWith("/")) {
		const queryIndex = trimmed.indexOf("?");
		if (queryIndex < 0) {
			return rawHash;
		}
		const routePath = trimmed.slice(0, queryIndex);
		const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
		const changed = removeSupabaseAuthParams(params);
		if (!changed) {
			return rawHash;
		}
		const next = params.toString();
		return next ? `#${routePath}?${next}` : `#${routePath}`;
	}

	const params = new URLSearchParams(trimmed);
	const changed = removeSupabaseAuthParams(params);
	if (!changed) {
		return rawHash;
	}
	const next = params.toString();
	return next ? `#${next}` : "";
}

export function sanitizeSupabaseCallbackUrlInPlace(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	const nextSearch = stripSupabaseAuthParamsFromSearch(window.location.search);
	const nextHash = stripSupabaseAuthParamsFromHash(window.location.hash);
	if (
		nextSearch === window.location.search &&
		nextHash === window.location.hash
	) {
		return false;
	}

	const nextUrl = `${window.location.pathname}${nextSearch}${nextHash}`;
	window.history.replaceState(window.history.state, document.title, nextUrl);
	return true;
}
