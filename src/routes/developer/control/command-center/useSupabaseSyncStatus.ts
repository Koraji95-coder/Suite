import { useEffect, useState } from "react";
import { getSessionStorageApi } from "@/lib/browserStorage";
import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { supabase } from "@/supabase/client";

export type SupabaseSyncCheck = {
	level?: string;
	ok?: boolean;
	message?: string;
	output?: string;
};

export type SupabaseSyncRun = {
	kind?: string;
	ok?: boolean;
	pushReady?: boolean;
	dryRun?: boolean;
	summary?: string;
	pushReadinessSummary?: string;
	timestamp?: string;
	projectRef?: string | null;
	checks?: Record<string, SupabaseSyncCheck>;
};

export type SupabaseSyncStatusPayload = {
	ok: boolean;
	paths: {
		root: string;
		preflightPath: string;
		pushPath: string;
		logPath: string;
	};
	lastPreflight: SupabaseSyncRun | null;
	lastPush: SupabaseSyncRun | null;
	pushReadinessSummary?: string | null;
	logTail: string[];
};

const STATUS_CACHE_TTL_MS = 60_000;
const STATUS_CACHE_STORAGE_KEY = "suite:command-center:supabase-sync-status";

let cachedSupabaseSyncStatus: SupabaseSyncStatusPayload | null = null;
let cachedSupabaseSyncStatusAt = 0;

function readPersistedSupabaseSyncStatus(): {
	status: SupabaseSyncStatusPayload;
	updatedAt: number;
} | null {
	const storage = getSessionStorageApi();
	if (!storage) return null;
	try {
		const raw = storage.getItem(STATUS_CACHE_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			status?: SupabaseSyncStatusPayload;
			updatedAt?: number;
		};
		if (!parsed?.status || typeof parsed?.updatedAt !== "number") {
			return null;
		}
		if (Date.now() - parsed.updatedAt > STATUS_CACHE_TTL_MS) {
			storage.removeItem(STATUS_CACHE_STORAGE_KEY);
			return null;
		}
		return {
			status: parsed.status,
			updatedAt: parsed.updatedAt,
		};
	} catch {
		return null;
	}
}

function writePersistedSupabaseSyncStatus(
	status: SupabaseSyncStatusPayload,
	updatedAt: number,
) {
	const storage = getSessionStorageApi();
	if (!storage) return;
	try {
		storage.setItem(
			STATUS_CACHE_STORAGE_KEY,
			JSON.stringify({ status, updatedAt }),
		);
	} catch {
		/* noop */
	}
}

function readCachedSupabaseSyncStatus(): SupabaseSyncStatusPayload | null {
	if (cachedSupabaseSyncStatus) {
		if (Date.now() - cachedSupabaseSyncStatusAt > STATUS_CACHE_TTL_MS) {
			cachedSupabaseSyncStatus = null;
			cachedSupabaseSyncStatusAt = 0;
		} else {
			return cachedSupabaseSyncStatus;
		}
	}
	const persisted = readPersistedSupabaseSyncStatus();
	if (!persisted) {
		cachedSupabaseSyncStatus = null;
		cachedSupabaseSyncStatusAt = 0;
		return null;
	}
	cachedSupabaseSyncStatus = persisted.status;
	cachedSupabaseSyncStatusAt = persisted.updatedAt;
	return persisted.status;
}

function writeCachedSupabaseSyncStatus(nextStatus: SupabaseSyncStatusPayload) {
	cachedSupabaseSyncStatus = nextStatus;
	cachedSupabaseSyncStatusAt = Date.now();
	writePersistedSupabaseSyncStatus(nextStatus, cachedSupabaseSyncStatusAt);
}

export function useSupabaseSyncStatus(enabled: boolean) {
	const initialCachedStatus = enabled ? readCachedSupabaseSyncStatus() : null;
	const [status, setStatus] = useState<SupabaseSyncStatusPayload | null>(
		() => initialCachedStatus,
	);
	const [loading, setLoading] = useState(
		() => enabled && initialCachedStatus === null,
	);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		void refreshToken;
		if (!enabled) {
			setStatus(null);
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		const coldLoad =
			refreshToken === 0 && readCachedSupabaseSyncStatus() === null;
		setLoading(coldLoad);
		setRefreshing(!coldLoad);
		setError(null);

		const loadStatus = async () => {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				const headers = new Headers();
				if (session?.access_token) {
					headers.set("Authorization", `Bearer ${session.access_token}`);
				}

				const response = await fetchWithTimeout(
					"/api/command-center/supabase-sync-status",
					{
						method: "GET",
						headers,
						credentials: "include",
						timeoutMs: 12_000,
						requestName: "Supabase sync status",
						signal: controller.signal,
					},
				);
				if (!response.ok) {
					throw new Error(
						await parseResponseErrorMessage(
							response,
							`Supabase sync status failed (${response.status}).`,
						),
					);
				}

				const payload = (await response.json()) as SupabaseSyncStatusPayload;
				writeCachedSupabaseSyncStatus(payload);
				setStatus(payload);
			} catch (loadError) {
				if (controller.signal.aborted) {
					return;
				}
				setError(
					loadError instanceof Error
						? loadError.message
						: "Supabase sync status could not be loaded.",
				);
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
					setRefreshing(false);
				}
			}
		};

		void loadStatus();

		return () => {
			controller.abort();
		};
	}, [enabled, refreshToken]);

	return {
		status,
		loading,
		refreshing,
		error,
		refresh: () => setRefreshToken((current) => current + 1),
	};
}
