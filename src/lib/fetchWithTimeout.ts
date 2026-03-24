import { recordAppDiagnostic } from "@/lib/appDiagnostics";

export type FetchErrorKind =
	| "timeout"
	| "network"
	| "http"
	| "aborted"
	| "unknown";

export class FetchRequestError extends Error {
	readonly kind: FetchErrorKind;
	readonly status?: number;
	readonly timeoutMs?: number;
	readonly cause?: unknown;

	constructor(args: {
		kind: FetchErrorKind;
		message: string;
		status?: number;
		timeoutMs?: number;
		cause?: unknown;
	}) {
		super(args.message);
		this.name = "FetchRequestError";
		this.kind = args.kind;
		this.status = args.status;
		this.timeoutMs = args.timeoutMs;
		this.cause = args.cause;
	}
}

export type FetchDiagnosticsMode = "default" | "silent";

export type FetchWithTimeoutInit = RequestInit & {
	timeoutMs?: number;
	requestName?: string;
	throwOnHttpError?: boolean;
	diagnosticsMode?: FetchDiagnosticsMode;
};

const DEFAULT_TIMEOUT_MS = 30_000;

function describeRequestTarget(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.toString();
	}
	if (typeof Request !== "undefined" && input instanceof Request) {
		return input.url;
	}
	return "unknown-request";
}

function timeoutMessage(requestName: string, timeoutMs: number): string {
	return (
		`${requestName} timed out after ${timeoutMs}ms. ` +
		"The server may still be processing; check connectivity and retry."
	);
}

export async function parseResponseErrorMessage(
	response: Response,
	fallback: string,
): Promise<string> {
	try {
		const contentType = response.headers.get("content-type") || "";
		const clone = response.clone();
		if (contentType.includes("application/json")) {
			const payload = (await clone.json()) as {
				error?: string;
				message?: string;
				detail?: string;
			} | null;
			const candidate = payload?.error || payload?.message || payload?.detail;
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim();
			}
		}
		const text = await clone.text();
		if (text.trim().length > 0) {
			return text.trim();
		}
	} catch {
		// Ignore parse errors and use fallback.
	}
	return fallback;
}

export function isFetchRequestError(
	error: unknown,
): error is FetchRequestError {
	return error instanceof FetchRequestError;
}

export function mapFetchErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof FetchRequestError) {
		return error.message;
	}
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
}

export function mapFetchErrorCode(
	error: unknown,
	fallbackCode = "NETWORK_ERROR",
): string {
	if (!(error instanceof FetchRequestError)) {
		return fallbackCode;
	}
	switch (error.kind) {
		case "timeout":
			return "TIMEOUT";
		case "network":
			return "NETWORK_ERROR";
		case "http":
			return "HTTP_ERROR";
		case "aborted":
			return "REQUEST_ABORTED";
		default:
			return fallbackCode;
	}
}

export async function fetchWithTimeout(
	input: RequestInfo | URL,
	init: FetchWithTimeoutInit = {},
): Promise<Response> {
	const {
		timeoutMs: timeoutMsRaw = DEFAULT_TIMEOUT_MS,
		requestName = "Request",
		throwOnHttpError = false,
		diagnosticsMode = "default",
		signal: upstreamSignal,
		...requestInit
	} = init;
	const timeoutMs = Number.isFinite(timeoutMsRaw)
		? Math.max(1, Math.trunc(timeoutMsRaw))
		: DEFAULT_TIMEOUT_MS;
	const shouldRecordDiagnostics = diagnosticsMode !== "silent";

	const controller = new AbortController();
	let timedOut = false;
	const timeoutHandle = globalThis.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	const abortFromUpstream = () => controller.abort();
	if (upstreamSignal) {
		if (upstreamSignal.aborted) {
			controller.abort();
		} else {
			upstreamSignal.addEventListener("abort", abortFromUpstream, {
				once: true,
			});
		}
	}

	try {
		const response = await fetch(input, {
			...requestInit,
			signal: controller.signal,
		});
		if (!throwOnHttpError || response.ok) {
			return response;
		}
		const fallback = `${requestName} failed (${response.status})`;
		const message = await parseResponseErrorMessage(response, fallback);
		if (shouldRecordDiagnostics) {
			recordAppDiagnostic({
				source: "fetch",
				severity: response.status >= 500 ? "error" : "warning",
				title: `${requestName} HTTP ${response.status}`,
				message,
				context: describeRequestTarget(input),
			});
		}
		throw new FetchRequestError({
			kind: "http",
			message,
			status: response.status,
		});
	} catch (error: unknown) {
		if (error instanceof FetchRequestError) {
			throw error;
		}
		if (error instanceof Error && error.name === "AbortError") {
			if (timedOut) {
				if (shouldRecordDiagnostics) {
					recordAppDiagnostic({
						source: "fetch",
						severity: "error",
						title: `${requestName} timed out`,
						message: timeoutMessage(requestName, timeoutMs),
						context: describeRequestTarget(input),
					});
				}
				throw new FetchRequestError({
					kind: "timeout",
					message: timeoutMessage(requestName, timeoutMs),
					timeoutMs,
					cause: error,
				});
			}
			if (upstreamSignal?.aborted) {
				throw new FetchRequestError({
					kind: "aborted",
					message: `${requestName} was cancelled before completion.`,
					cause: error,
				});
			}
			throw new FetchRequestError({
				kind: "aborted",
				message: `${requestName} was interrupted before completion.`,
				cause: error,
			});
		}
		if (error instanceof TypeError) {
			if (shouldRecordDiagnostics) {
				recordAppDiagnostic({
					source: "fetch",
					severity: "error",
					title: `${requestName} network error`,
					message: `${requestName} failed due to a network error. Check backend connectivity and retry.`,
					context: describeRequestTarget(input),
					details: error.message,
				});
			}
			throw new FetchRequestError({
				kind: "network",
				message: `${requestName} failed due to a network error. Check backend connectivity and retry.`,
				cause: error,
			});
		}
		if (error instanceof Error) {
			if (shouldRecordDiagnostics) {
				recordAppDiagnostic({
					source: "fetch",
					severity: "error",
					title: `${requestName} failed`,
					message: error.message || `${requestName} failed unexpectedly.`,
					context: describeRequestTarget(input),
				});
			}
			throw new FetchRequestError({
				kind: "unknown",
				message: error.message || `${requestName} failed unexpectedly.`,
				cause: error,
			});
		}
		throw new FetchRequestError({
			kind: "unknown",
			message: `${requestName} failed unexpectedly.`,
			cause: error,
		});
	} finally {
		globalThis.clearTimeout(timeoutHandle);
		if (upstreamSignal) {
			upstreamSignal.removeEventListener("abort", abortFromUpstream);
		}
	}
}
