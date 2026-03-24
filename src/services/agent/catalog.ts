import {
	AGENT_PROFILE_IDS,
	type AgentProfileId,
} from "@/components/agent/agentProfiles";
import { fetchWithTimeout, mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type { AgentProfileCatalogItem } from "./types";

export interface AgentCatalogContext {
	useBroker: boolean;
	baseUrl: string;
	brokerUrl: string;
	getSupabaseAccessToken: () => Promise<string | null>;
	setLastHealthError: (message: string | null) => void;
}

const lastHealthLogByEndpoint = new Map<string, boolean>();

function logHealthState(endpoint: string, isHealthy: boolean) {
	const previous = lastHealthLogByEndpoint.get(endpoint);
	if (previous === isHealthy) {
		return;
	}
	lastHealthLogByEndpoint.set(endpoint, isHealthy);
	if (previous === undefined && isHealthy) {
		return;
	}
	if (isHealthy) {
		logger.debug("Agent health check recovered.", "AgentService");
		return;
	}
	logger.warn("Agent health check is unavailable.", "AgentService");
}

export async function healthCheckAgent(
	context: AgentCatalogContext,
	timeoutMs: number,
) {
	const healthEndpoint = context.useBroker
		? context.brokerUrl
		: context.baseUrl;
	try {
		if (context.useBroker) {
			const accessToken = await context.getSupabaseAccessToken();
			if (!accessToken) {
				context.setLastHealthError(
					"Supabase session required for brokered agent access.",
				);
				return false;
			}

			const response = await fetchWithTimeout(`${context.brokerUrl}/health`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				timeoutMs,
				requestName: "Agent broker health check",
				diagnosticsMode: "silent",
			});

			const isHealthy = response.ok;
			context.setLastHealthError(
				isHealthy ? null : `Gateway responded with status ${response.status}`,
			);
			logHealthState(healthEndpoint, isHealthy);
			return isHealthy;
		}

		const response = await fetchWithTimeout(`${context.baseUrl}/health`, {
			method: "GET",
			timeoutMs,
			requestName: "Agent gateway health check",
			diagnosticsMode: "silent",
		});
		const isHealthy = response.ok;
		context.setLastHealthError(
			isHealthy ? null : `Gateway responded with status ${response.status}`,
		);
		logHealthState(healthEndpoint, isHealthy);
		return isHealthy;
	} catch (error) {
		const message = mapFetchErrorMessage(error, "Unknown connection error");
		context.setLastHealthError(message);
		logger.warn(
			`Agent health check unavailable at ${healthEndpoint}: ${message}`,
			"AgentService",
		);
		return false;
	}
}

export async function fetchAgentProfileCatalog(
	context: Pick<
		AgentCatalogContext,
		"useBroker" | "brokerUrl" | "getSupabaseAccessToken"
	>,
): Promise<{
	success: boolean;
	profiles: AgentProfileCatalogItem[];
	error?: string;
}> {
	if (!context.useBroker) {
		return { success: false, profiles: [] };
	}

	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			profiles: [],
			error: "Supabase session required for brokered profile routing metadata.",
		};
	}

	try {
		const response = await fetchWithTimeout(`${context.brokerUrl}/profiles`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			credentials: "include",
			timeoutMs: 15_000,
			requestName: "Agent broker profile catalog request",
		});

		const payload = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		if (!response.ok) {
			return {
				success: false,
				profiles: [],
				error:
					String(payload.error || "").trim() ||
					"Unable to load agent profile metadata.",
			};
		}

		const profiles: AgentProfileCatalogItem[] = Array.isArray(payload.profiles)
			? payload.profiles.reduce<AgentProfileCatalogItem[]>((acc, entry) => {
					if (!entry || typeof entry !== "object") return acc;
					const record = entry as Record<string, unknown>;
					const id = String(record.id || "")
						.trim()
						.toLowerCase();
					if (!id || !AGENT_PROFILE_IDS.includes(id as AgentProfileId)) {
						return acc;
					}
					acc.push({
						id: id as AgentProfileId,
						name: String(record.name || "").trim(),
						tagline: String(record.tagline || "").trim(),
						focus: String(record.focus || "").trim(),
						memory_namespace: String(record.memory_namespace || "").trim(),
						model_primary: String(record.model_primary || "").trim(),
						model_fallbacks: [],
					});
					return acc;
				}, [])
			: [];

		return { success: true, profiles };
	} catch (error) {
		return {
			success: false,
			profiles: [],
			error: mapFetchErrorMessage(
				error,
				"Unable to load agent profile metadata.",
			),
		};
	}
}
