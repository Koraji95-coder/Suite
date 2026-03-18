import {
	fetchWithTimeout,
	mapFetchErrorMessage,
} from "@/lib/fetchWithTimeout";
import type {
	AgentRunCreateRequest,
	AgentRunSnapshot,
} from "./types";
import {
	brokerRequiredError,
	type AgentBrokerContext,
} from "./orchestrationContracts";

export async function createBrokerOrchestrationRun(
	context: AgentBrokerContext,
	input: AgentRunCreateRequest,
): Promise<{
	success: boolean;
	runId?: string;
	status?: string;
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			error: brokerRequiredError(
				"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}

	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			error: "Supabase session required for orchestration runs.",
		};
	}

	try {
		const response = await fetchWithTimeout(`${context.brokerUrl}/runs`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			credentials: "include",
			body: JSON.stringify({
				objective: input.objective,
				profiles: input.profiles,
				synthesisProfile: input.synthesisProfile,
				context: input.context ?? {},
				timeoutMs: input.timeoutMs,
			}),
			timeoutMs: 20_000,
			requestName: "Agent orchestration run create request",
		});

		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		if (!response.ok) {
			return {
				success: false,
				requestId: String(data.requestId || ""),
				error:
					String(data.error || "").trim() ||
					"Unable to create orchestration run.",
			};
		}

		return {
			success: Boolean(data.success),
			runId: String(data.runId || ""),
			status: String(data.status || ""),
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unable to create orchestration run."),
		};
	}
}

export async function getBrokerOrchestrationRun(
	context: AgentBrokerContext,
	runId: string,
): Promise<{
	success: boolean;
	run?: AgentRunSnapshot;
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			error: brokerRequiredError(
				"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			error: "Supabase session required for orchestration runs.",
		};
	}

	try {
		const response = await fetchWithTimeout(
			`${context.brokerUrl}/runs/${encodeURIComponent(runId)}`,
			{
				method: "GET",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 20_000,
				requestName: "Agent orchestration run get request",
			},
		);

		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		if (!response.ok) {
			return {
				success: false,
				requestId: String(data.requestId || ""),
				error:
					String(data.error || "").trim() ||
					"Unable to fetch orchestration run.",
			};
		}

		return {
			success: Boolean(data.success),
			run: (data.run || undefined) as AgentRunSnapshot | undefined,
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unable to fetch orchestration run."),
		};
	}
}

export async function cancelBrokerOrchestrationRun(
	context: AgentBrokerContext,
	runId: string,
): Promise<{
	success: boolean;
	status?: string;
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			error: brokerRequiredError(
				"Agent orchestration runs require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			error: "Supabase session required for orchestration runs.",
		};
	}

	try {
		const response = await fetchWithTimeout(
			`${context.brokerUrl}/runs/${encodeURIComponent(runId)}/cancel`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 20_000,
				requestName: "Agent orchestration run cancel request",
			},
		);

		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		if (!response.ok) {
			return {
				success: false,
				requestId: String(data.requestId || ""),
				error:
					String(data.error || "").trim() ||
					"Unable to cancel orchestration run.",
			};
		}

		return {
			success: Boolean(data.success),
			status: String(data.status || ""),
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unable to cancel orchestration run."),
		};
	}
}
