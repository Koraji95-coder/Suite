import { getLocalStorageApi } from "@/lib/browserStorage";

const SUPABASE_AUTH_STORAGE_PREFIX = "suite-auth";

export const SUPABASE_LEGACY_AUTH_STORAGE_KEY = SUPABASE_AUTH_STORAGE_PREFIX;

function normalizeSupabaseStorageScope(supabaseUrl: string): string {
	const rawValue = String(supabaseUrl || "").trim();
	if (!rawValue) {
		return "default";
	}

	try {
		const parsed = new URL(rawValue);
		const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.origin}${normalizedPath}`;
	} catch {
		return rawValue;
	}
}

function createDeterministicHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSupabaseAuthStorageKey(supabaseUrl: string): string {
	const scope = normalizeSupabaseStorageScope(supabaseUrl);
	return `${SUPABASE_AUTH_STORAGE_PREFIX}:${createDeterministicHash(scope)}`;
}

export function cleanupLegacySupabaseAuthStorage(storageKey: string): void {
	if (storageKey === SUPABASE_LEGACY_AUTH_STORAGE_KEY) {
		return;
	}

	const storage = getLocalStorageApi();
	if (!storage) return;

	try {
		storage.removeItem(SUPABASE_LEGACY_AUTH_STORAGE_KEY);
	} catch {
		// Ignore localStorage failures and keep auth initialization non-fatal.
	}
}
