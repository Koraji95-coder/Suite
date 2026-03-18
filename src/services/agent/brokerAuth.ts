import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured } from "@/supabase/utils";
import {
	SUPABASE_SESSION_LOOKUP_TIMEOUT_MS,
	type AgentServiceRuntimeState,
} from "./runtime";

export interface AgentBrokerConfigStatus {
	ok: boolean;
	missing: string[];
	warnings?: string[];
	require_webhook_secret?: boolean;
}

export async function getSupabaseAccessToken(
	_runtime: AgentServiceRuntimeState,
): Promise<string | null> {
	if (!isSupabaseConfigured()) {
		logger.warn(
			"Supabase not configured; agent broker requires auth.",
			"AgentService",
		);
		return null;
	}

	try {
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
		const sessionResult = await Promise.race([
			supabase.auth.getSession().then((value) => ({
				timedOut: false as const,
				value,
			})),
			new Promise<{ timedOut: true }>((resolve) => {
				timeoutHandle = setTimeout(
					() => resolve({ timedOut: true }),
					SUPABASE_SESSION_LOOKUP_TIMEOUT_MS,
				);
			}),
		]);
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
		if (sessionResult.timedOut) {
			logger.warn("Supabase session lookup timed out", "AgentService", {
				timeoutMs: SUPABASE_SESSION_LOOKUP_TIMEOUT_MS,
			});
			return null;
		}
		const {
			data: { session },
			error,
		} = sessionResult.value;
		if (error) {
			logger.warn("Failed to fetch Supabase session", "AgentService", {
				error,
			});
			return null;
		}
		return session?.access_token ?? null;
	} catch (error) {
		logger.warn("Supabase session lookup failed", "AgentService", { error });
		return null;
	}
}

export async function getBrokerConfig(
	runtime: AgentServiceRuntimeState,
): Promise<AgentBrokerConfigStatus | null> {
	if (!runtime.useBroker) return null;

	const accessToken = await getSupabaseAccessToken(runtime);
	if (!accessToken) {
		return {
			ok: false,
			missing: ["Supabase session required"],
			warnings: [],
		};
	}

	try {
		const response = await fetchWithTimeout(`${runtime.brokerUrl}/config`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			credentials: "include",
			timeoutMs: 15_000,
			requestName: "Agent broker config request",
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			logger.warn("Broker config request failed", "AgentService", {
				status: response.status,
				body,
			});
			return {
				ok: false,
				missing: ["Agent broker unavailable"],
				warnings: [],
			};
		}

		return (await response.json()) as AgentBrokerConfigStatus;
	} catch (error) {
		logger.warn("Broker config lookup failed", "AgentService", { error });
		return {
			ok: false,
			missing: ["Agent broker unavailable"],
			warnings: [],
		};
	}
}
