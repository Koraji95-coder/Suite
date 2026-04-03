import { supabase } from "@/supabase/client";

export type LocalStorageApi = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface ProjectScopedCacheEntry<T> {
	expiresAt: number;
	value: T;
}

const AUTH_USER_ID_CACHE_TTL_MS = 2_000;

let cachedCurrentSupabaseUserId: string | null | undefined;
let cachedCurrentSupabaseUserIdExpiresAt = 0;
let currentSupabaseUserIdSubscriptionInitialized = false;

function normalizeProjectCacheKey(projectId: string) {
	return String(projectId ?? "").trim().toLowerCase();
}

export function getLocalStorageApi(): LocalStorageApi | null {
	if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
		return null;
	}
	const candidate = globalThis.localStorage;
	if (
		!candidate ||
		typeof candidate.getItem !== "function" ||
		typeof candidate.setItem !== "function" ||
		typeof candidate.removeItem !== "function"
	) {
		return null;
	}
	return candidate;
}

export async function getCurrentSupabaseUserId(): Promise<string | null> {
	if (
		!currentSupabaseUserIdSubscriptionInitialized &&
		typeof supabase.auth.onAuthStateChange === "function"
	) {
		currentSupabaseUserIdSubscriptionInitialized = true;
		supabase.auth.onAuthStateChange((_event, session) => {
			cachedCurrentSupabaseUserId = session?.user?.id ?? null;
			cachedCurrentSupabaseUserIdExpiresAt =
				Date.now() + AUTH_USER_ID_CACHE_TTL_MS;
		});
	}

	const now = Date.now();
	if (
		cachedCurrentSupabaseUserId !== undefined &&
		cachedCurrentSupabaseUserIdExpiresAt > now
	) {
		return cachedCurrentSupabaseUserId;
	}

	if (typeof supabase.auth.getSession === "function") {
		const {
			data: { session },
			error: sessionError,
		} = await supabase.auth.getSession();
		if (sessionError) {
			throw sessionError;
		}
		const sessionUserId = session?.user?.id ?? null;
		if (sessionUserId) {
			cachedCurrentSupabaseUserId = sessionUserId;
			cachedCurrentSupabaseUserIdExpiresAt = now + AUTH_USER_ID_CACHE_TTL_MS;
			return sessionUserId;
		}
	}

	if (typeof supabase.auth.getUser === "function") {
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();
		if (userError) {
			throw userError;
		}
		cachedCurrentSupabaseUserId = user?.id ?? null;
		cachedCurrentSupabaseUserIdExpiresAt = Date.now() + AUTH_USER_ID_CACHE_TTL_MS;
		return cachedCurrentSupabaseUserId;
	}

	cachedCurrentSupabaseUserId = null;
	cachedCurrentSupabaseUserIdExpiresAt = Date.now() + AUTH_USER_ID_CACHE_TTL_MS;
	return null;
}

export function createProjectScopedFetchCache<T>(ttlMs = 2_000) {
	const cache = new Map<string, ProjectScopedCacheEntry<T>>();
	const inFlight = new Map<string, Promise<T>>();

	const read = (projectId: string) => {
		const key = normalizeProjectCacheKey(projectId);
		if (!key) {
			return null;
		}
		const cached = cache.get(key);
		if (!cached) {
			return null;
		}
		if (cached.expiresAt <= Date.now()) {
			cache.delete(key);
			return null;
		}
		return cached.value;
	};

	return {
		read,
		readInFlight(projectId: string) {
			const key = normalizeProjectCacheKey(projectId);
			return key ? inFlight.get(key) ?? null : null;
		},
		write(projectId: string, value: T) {
			const key = normalizeProjectCacheKey(projectId);
			if (!key) {
				return value;
			}
			cache.set(key, {
				expiresAt: Date.now() + ttlMs,
				value,
			});
			return value;
		},
		writeInFlight(projectId: string, value: Promise<T>) {
			const key = normalizeProjectCacheKey(projectId);
			if (key) {
				inFlight.set(key, value);
			}
			return value;
		},
		clear(projectId: string) {
			const key = normalizeProjectCacheKey(projectId);
			if (!key) {
				return;
			}
			cache.delete(key);
			inFlight.delete(key);
		},
		clearInFlight(projectId: string) {
			const key = normalizeProjectCacheKey(projectId);
			if (!key) {
				return;
			}
			inFlight.delete(key);
		},
		clearAll() {
			cache.clear();
			inFlight.clear();
		},
	};
}
