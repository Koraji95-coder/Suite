import { useEffect, useState } from "react";
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
	logTail: string[];
};

export function useSupabaseSyncStatus(enabled: boolean) {
	const [status, setStatus] = useState<SupabaseSyncStatusPayload | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		if (!enabled) {
			setStatus(null);
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
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
		error,
		refresh: () => setRefreshToken((current) => current + 1),
	};
}
