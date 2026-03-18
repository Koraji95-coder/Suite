import {
	fetchWithTimeout,
	isFetchRequestError,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logSecurityEvent } from "../securityEventService";
import type { AgentResponse, AgentSendOptions, AgentTask } from "./types";
import type { AgentRequestTransportContext } from "./requestTransportContracts";
import { formatAgentGatewayFailureMessage } from "./requestTransportErrors";

export interface ParsedDirectStreamPayloadEvent {
	done: boolean;
	delta: string;
	model: string;
	error: string;
}

export function parseDirectStreamPayloadEvent(
	payloadValue: string,
): ParsedDirectStreamPayloadEvent | null {
	const trimmed = payloadValue.trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed === "[DONE]") {
		return {
			done: true,
			delta: "",
			model: "",
			error: "",
		};
	}

	try {
		const decoded = JSON.parse(trimmed) as {
			delta?: string;
			response?: string;
			model?: string;
			error?: string;
		} | null;
		if (!decoded || typeof decoded !== "object") {
			return null;
		}
		return {
			done: false,
			delta:
				typeof decoded.delta === "string"
					? decoded.delta
					: typeof decoded.response === "string"
						? decoded.response
						: "",
			model:
				typeof decoded.model === "string" ? decoded.model.trim() : "",
			error:
				typeof decoded.error === "string" ? decoded.error.trim() : "",
		};
	} catch {
		return {
			done: false,
			delta: trimmed,
			model: "",
			error: "",
		};
	}
}

export async function makeDirectChatStreamRequest(
	context: AgentRequestTransportContext,
	args: {
		task: AgentTask;
		profileId: string;
		modelCandidates: string[];
		headers: Record<string, string>;
		startTime: number;
		options?: AgentSendOptions;
	},
): Promise<AgentResponse> {
	const { task, profileId, modelCandidates, headers, startTime, options } =
		args;
	const connectTimeoutMs = context.resolveDirectConnectTimeoutMs(task.timeout);
	const streamMaxMs = context.resolveDirectStreamMaxMs();
	const model = modelCandidates[0] || "";
	const chatMessage =
		typeof task.params?.message === "string" && task.params.message.trim()
			? task.params.message
			: JSON.stringify(task);
	const payload: Record<string, unknown> = {
		message: chatMessage,
		profile_id: profileId,
		stream: true,
	};
	if (model) {
		payload.model = model;
	}

	const abortController = new AbortController();
	context.setActiveDirectChatCancelledByUser(false);
	context.setActiveDirectChatAbortController(abortController);
	let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	let streamTimedOut = false;
	let streamedResponse = "";
	let streamModel = model;
	let streamError = "";
	let streamDone = false;

	const applyStreamPayload = (payloadValue: string) => {
		const parsed = parseDirectStreamPayloadEvent(payloadValue);
		if (!parsed) {
			return;
		}
		if (parsed.done) {
			streamDone = true;
			return;
		}
		if (parsed.model) {
			streamModel = parsed.model;
		}
		if (parsed.error) {
			streamError = parsed.error;
		}
		if (parsed.delta) {
			streamedResponse += parsed.delta;
			options?.onStreamUpdate?.(streamedResponse);
		}
	};

	try {
		const response = await fetchWithTimeout(`${context.baseUrl}/webhook`, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			timeoutMs: connectTimeoutMs,
			signal: abortController.signal,
			requestName: "Agent gateway webhook connect",
		});

		if (!response.ok) {
			const rawDetails = await parseResponseErrorMessage(
				response,
				`Agent request failed (${response.status})`,
			);
			const failureMessage = formatAgentGatewayFailureMessage(
				response.status,
				rawDetails,
			);
			if (response.status === 401 || response.status === 403) {
				const responseBody = await response.text().catch(() => "");
				const mentionsSecret = /secret/i.test(responseBody);

				if (mentionsSecret) {
					await logSecurityEvent(
						"agent_webhook_secret_rejected",
						"Agent rejected webhook secret; check VITE_AGENT_WEBHOOK_SECRET and gateway secret configuration.",
					);
					throw new Error(
						"Webhook secret rejected by gateway. Verify VITE_AGENT_WEBHOOK_SECRET matches the gateway configuration.",
					);
				}

				await context.unpair();
				await logSecurityEvent(
					"agent_request_unauthorized",
					"Agent request returned unauthorized; pairing was revoked.",
				);
			}
			throw new Error(failureMessage);
		}

		const contentType = String(response.headers.get("content-type") || "")
			.trim()
			.toLowerCase();
		if (!contentType.includes("text/event-stream") || !response.body) {
			let data: Record<string, unknown>;
			try {
				data = (await response.json()) as Record<string, unknown>;
			} catch {
				const text = await response.text().catch(() => "");
				data = {
					model: streamModel || model || "",
					response: text,
				};
			}
			return {
				success: true,
				data,
				executionTime: Date.now() - startTime,
			};
		}

		streamTimeoutHandle = setTimeout(() => {
			streamTimedOut = true;
			abortController.abort();
		}, streamMaxMs);

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const read = await reader.read();
			if (read.done) break;

			buffer += decoder
				.decode(read.value, { stream: true })
				.replace(/\r\n/g, "\n")
				.replace(/\r/g, "\n");

			let separatorIndex = buffer.indexOf("\n\n");
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				separatorIndex = buffer.indexOf("\n\n");

				if (!block.trim()) continue;
				for (const line of block.split("\n")) {
					if (!line || line.startsWith(":")) continue;
					if (!line.startsWith("data:")) continue;
					applyStreamPayload(line.slice(5).trimStart());
				}
			}
		}

		const trailing = decoder.decode().trim();
		if (trailing) {
			for (const line of trailing.split("\n")) {
				if (!line || line.startsWith(":")) continue;
				if (!line.startsWith("data:")) continue;
				applyStreamPayload(line.slice(5).trimStart());
			}
		}

		const executionTime = Date.now() - startTime;
		if (streamError && !streamedResponse.trim()) {
			return {
				success: false,
				error: streamError,
				executionTime,
			};
		}

		if (streamError && streamedResponse.trim()) {
			return {
				success: true,
				data: {
					model: streamModel || model || "",
					response: streamedResponse,
					incomplete: true,
					finish_reason: "error",
					warning: streamError,
				},
				executionTime,
			};
		}

		if (!streamDone && !streamedResponse.trim()) {
			return {
				success: false,
				error: "Agent stream ended before returning a response.",
				executionTime,
			};
		}

		return {
			success: true,
			data: {
				model: streamModel || model || "",
				response: streamedResponse,
			},
			executionTime,
		};
	} catch (error) {
		const executionTime = Date.now() - startTime;
		if (isFetchRequestError(error) && error.kind === "aborted") {
			if (streamTimedOut) {
				if (streamedResponse.trim()) {
					return {
						success: true,
						data: {
							model: streamModel || model || "",
							response: streamedResponse,
							incomplete: true,
							finish_reason: "timeout",
							warning: `Stream exceeded ${Math.round(streamMaxMs / 1000)} seconds and was stopped.`,
						},
						executionTime,
					};
				}
				return {
					success: false,
					error: `Agent stream timed out after ${Math.round(streamMaxMs / 1000)} seconds.`,
					executionTime,
				};
			}

			if (context.getActiveDirectChatCancelledByUser()) {
				if (streamedResponse.trim()) {
					return {
						success: true,
						data: {
							model: streamModel || model || "",
							response: streamedResponse,
							incomplete: true,
							finish_reason: "cancelled",
							warning: "Request cancelled by user.",
						},
						executionTime,
					};
				}
				return {
					success: false,
					error: "Request cancelled before the agent produced a response.",
					executionTime,
				};
			}
		}
		return {
			success: false,
			error: mapFetchErrorMessage(error, "Unknown error"),
			executionTime,
		};
	} finally {
		if (streamTimeoutHandle) {
			clearTimeout(streamTimeoutHandle);
		}
		if (context.getActiveDirectChatAbortController() === abortController) {
			context.setActiveDirectChatAbortController(null);
			context.setActiveDirectChatCancelledByUser(false);
		}
	}
}
