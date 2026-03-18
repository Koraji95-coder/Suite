import { mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import type {
	AgentRunEventStream,
	AgentRunEventStreamHandlers,
} from "./types";
import { type AgentBrokerContext } from "./orchestrationContracts";
import { parseRunEventBlock } from "./orchestrationParser";

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
