import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import type {
	AgentActivityItem,
	AgentReviewAction,
	AgentRunCreateRequest,
	AgentRunEvent,
	AgentRunEventStream,
	AgentRunEventStreamHandlers,
	AgentRunSnapshot,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
} from "./types";

export interface AgentBrokerContext {
	useBroker: boolean;
	brokerUrl: string;
	getSupabaseAccessToken: () => Promise<string | null>;
}

function brokerRequiredError(message: string) {
	return message;
}

export function parseRunEventBlock(block: string): AgentRunEvent | null {
	const lines = block.split("\n");
	let eventType = "message";
	let rawId = "";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (!line || line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		const field =
			separator >= 0 ? line.slice(0, separator).trim() : line.trim();
		const value =
			separator >= 0 ? line.slice(separator + 1).trimStart() : "";

		if (field === "event") {
			eventType = value || eventType;
			continue;
		}
		if (field === "id") {
			rawId = value;
			continue;
		}
		if (field === "data") {
			dataLines.push(value);
		}
	}

	if (dataLines.length === 0) return null;
	const dataText = dataLines.join("\n").trim();
	if (!dataText) return null;

	let parsed: Record<string, unknown> = {};
	try {
		const decoded = JSON.parse(dataText) as unknown;
		if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
			parsed = decoded as Record<string, unknown>;
		}
	} catch {
		parsed = {};
	}

	const payloadCandidate = parsed.payload;
	const payload =
		payloadCandidate &&
		typeof payloadCandidate === "object" &&
		!Array.isArray(payloadCandidate)
			? (payloadCandidate as Record<string, unknown>)
			: {};

	const numericIdFromPayload = Number(parsed.id ?? 0);
	const numericIdFromHeader = Number(rawId || 0);
	const numericId = Number.isFinite(numericIdFromPayload)
		? numericIdFromPayload
		: Number.isFinite(numericIdFromHeader)
			? numericIdFromHeader
			: 0;

	return {
		id: numericId > 0 ? numericId : 0,
		eventType: String(parsed.eventType ?? eventType ?? "message"),
		runId: String(parsed.runId ?? ""),
		stage: String(parsed.stage ?? ""),
		profileId: String(parsed.profileId ?? ""),
		requestId: String(parsed.requestId ?? ""),
		message: String(parsed.message ?? ""),
		payload,
		createdAt: String(parsed.createdAt ?? ""),
	};
}

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

export function subscribeBrokerRunEvents(
	context: AgentBrokerContext,
	runId: string,
	handlers: AgentRunEventStreamHandlers,
): AgentRunEventStream {
	const abortController = new AbortController();
	let closed = false;
	let closedNotified = false;

	const notifyClosed = () => {
		if (closedNotified) return;
		closedNotified = true;
		handlers.onClosed?.();
	};

	const close = () => {
		if (closed) return;
		closed = true;
		abortController.abort();
		notifyClosed();
	};

	if (!context.useBroker) {
		handlers.onError?.(
			"Agent orchestration event streaming requires broker transport mode (VITE_AGENT_TRANSPORT=backend).",
		);
		notifyClosed();
		return { close };
	}

	const normalizedRunId = String(runId || "").trim();
	if (!normalizedRunId) {
		handlers.onError?.("Run id is required to stream orchestration events.");
		notifyClosed();
		return { close };
	}

	void (async () => {
		try {
			const accessToken = await context.getSupabaseAccessToken();
			if (!accessToken) {
				handlers.onError?.(
					"Supabase session required for orchestration event streaming.",
				);
				return;
			}

			const lastEventId = Math.max(0, Number(handlers.lastEventId || 0));
			const search = new URLSearchParams();
			if (lastEventId > 0) {
				search.set("lastEventId", String(lastEventId));
			}
			const url = `${context.brokerUrl}/runs/${encodeURIComponent(normalizedRunId)}/events${
				search.toString() ? `?${search.toString()}` : ""
			}`;

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "text/event-stream",
				},
				credentials: "include",
				signal: abortController.signal,
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				handlers.onError?.(
					body.trim() ||
						`Unable to subscribe to orchestration events (status ${response.status}).`,
				);
				return;
			}

			if (!response.body) {
				handlers.onError?.(
					"Streaming transport unavailable in this browser environment.",
				);
				return;
			}

			handlers.onOpen?.();

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (!closed) {
				const read = await reader.read();
				if (read.done) break;
				buffer += decoder
					.decode(read.value, { stream: true })
					.replace(/\r\n/g, "\n")
					.replace(/\r/g, "\n");

				let separatorIndex = buffer.indexOf("\n\n");
				while (separatorIndex !== -1) {
					const block = buffer.slice(0, separatorIndex).trim();
					buffer = buffer.slice(separatorIndex + 2);
					separatorIndex = buffer.indexOf("\n\n");

					if (!block) continue;
					const event = parseRunEventBlock(block);
					if (event) {
						handlers.onEvent(event);
					}
				}
			}
		} catch (error) {
			if (abortController.signal.aborted) return;
			handlers.onError?.(
				mapFetchErrorMessage(
					error,
					"Orchestration event stream disconnected unexpectedly.",
				),
			);
		} finally {
			notifyClosed();
		}
	})();

	return { close };
}
