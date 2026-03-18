import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import type {
	AgentActivityItem,
	AgentReviewAction,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
} from "./types";
import {
	brokerRequiredError,
	type AgentBrokerContext,
} from "./orchestrationContracts";

export async function listBrokerAgentTasks(
	context: AgentBrokerContext,
	filters?: {
		status?: AgentTaskStatus | AgentTaskStatus[];
		priority?: AgentTaskPriority;
		assigneeProfile?: string;
		runId?: string;
		limit?: number;
	},
): Promise<{
	success: boolean;
	tasks: AgentTaskItem[];
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			tasks: [],
			error: brokerRequiredError(
				"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			tasks: [],
			error: "Supabase session required for agent task workflows.",
		};
	}

	try {
		const search = new URLSearchParams();
		if (filters?.status) {
			const values = Array.isArray(filters.status)
				? filters.status
				: [filters.status];
			const normalized = values
				.map((value) => String(value || "").trim())
				.filter(Boolean);
			if (normalized.length) {
				search.set("status", normalized.join(","));
			}
		}
		if (filters?.priority) {
			search.set("priority", String(filters.priority));
		}
		if (filters?.assigneeProfile) {
			search.set("assigneeProfile", String(filters.assigneeProfile).trim());
		}
		if (filters?.runId) {
			search.set("runId", String(filters.runId).trim());
		}
		if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
			search.set("limit", String(Math.max(1, Math.trunc(filters.limit))));
		}
		const url = `${context.brokerUrl}/tasks${search.toString() ? `?${search.toString()}` : ""}`;

		const response = await fetchWithTimeout(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${accessToken}` },
			credentials: "include",
			timeoutMs: 20_000,
			requestName: "Agent task list request",
		});
		if (!response.ok) {
			const message =
				response.status === 429
					? "Agent task queue is temporarily rate-limited. Please wait and retry."
					: await parseResponseErrorMessage(
							response,
							"Unable to list agent tasks.",
						);
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			return {
				success: false,
				tasks: [],
				requestId: String(data.requestId || ""),
				error: message,
			};
		}
		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const tasks = Array.isArray(data.tasks) ? (data.tasks as AgentTaskItem[]) : [];
		return {
			success: Boolean(data.success),
			tasks,
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			tasks: [],
			error: mapFetchErrorMessage(error, "Unable to list agent tasks."),
		};
	}
}

export async function getBrokerAgentTask(
	context: AgentBrokerContext,
	taskId: string,
): Promise<{
	success: boolean;
	task?: AgentTaskItem;
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			error: brokerRequiredError(
				"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			error: "Supabase session required for agent task workflows.",
		};
	}

	try {
		const response = await fetchWithTimeout(
			`${context.brokerUrl}/tasks/${encodeURIComponent(taskId)}`,
			{
				method: "GET",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 20_000,
				requestName: "Agent task detail request",
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
					String(data.error || "").trim() || "Unable to fetch agent task.",
			};
		}
		return {
			success: Boolean(data.success),
			task: (data.task || undefined) as AgentTaskItem | undefined,
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unable to fetch agent task."),
		};
	}
}

export async function reviewBrokerAgentTask(
	context: AgentBrokerContext,
	taskId: string,
	action: AgentReviewAction,
	note?: string,
): Promise<{
	success: boolean;
	task?: AgentTaskItem;
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			error: brokerRequiredError(
				"Agent task workflows require broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			error: "Supabase session required for agent task workflows.",
		};
	}

	try {
		const response = await fetchWithTimeout(
			`${context.brokerUrl}/tasks/${encodeURIComponent(taskId)}/review`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				body: JSON.stringify({
					action,
					note: String(note || "").trim(),
				}),
				timeoutMs: 20_000,
				requestName: "Agent task review request",
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
					String(data.error || "").trim() || "Unable to review agent task.",
			};
		}
		return {
			success: Boolean(data.success),
			task: (data.task || undefined) as AgentTaskItem | undefined,
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unable to review agent task."),
		};
	}
}

export async function getBrokerAgentActivity(
	context: AgentBrokerContext,
	options?: {
		runId?: string;
		limit?: number;
	},
): Promise<{
	success: boolean;
	activity: AgentActivityItem[];
	requestId?: string;
	error?: string;
}> {
	if (!context.useBroker) {
		return {
			success: false,
			activity: [],
			error: brokerRequiredError(
				"Agent activity requires broker transport mode (VITE_AGENT_TRANSPORT=backend).",
			),
		};
	}
	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		return {
			success: false,
			activity: [],
			error: "Supabase session required for agent activity.",
		};
	}

	try {
		const search = new URLSearchParams();
		if (options?.runId) {
			search.set("runId", String(options.runId).trim());
		}
		if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
			search.set("limit", String(Math.max(1, Math.trunc(options.limit))));
		}
		const url = `${context.brokerUrl}/activity${search.toString() ? `?${search.toString()}` : ""}`;
		const response = await fetchWithTimeout(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${accessToken}` },
			credentials: "include",
			timeoutMs: 20_000,
			requestName: "Agent activity request",
		});
		if (!response.ok) {
			const message =
				response.status === 429
					? "Agent activity feed is temporarily rate-limited. Please wait and retry."
					: await parseResponseErrorMessage(response, "Unable to load activity.");
			const data = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			return {
				success: false,
				activity: [],
				requestId: String(data.requestId || ""),
				error: message,
			};
		}
		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const activity = Array.isArray(data.activity)
			? (data.activity as AgentActivityItem[])
			: [];
		return {
			success: Boolean(data.success),
			activity,
			requestId: String(data.requestId || ""),
		};
	} catch (error) {
		return {
			success: false,
			activity: [],
			error: mapFetchErrorMessage(error, "Unable to load activity."),
		};
	}
}
