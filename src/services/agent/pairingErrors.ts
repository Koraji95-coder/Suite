import { parseResponseErrorMessage } from "@/lib/fetchWithTimeout";
import { AGENT_SESSION_RETRY_AFTER_MAX_SECONDS } from "./runtime";
import type { AgentBrokerPairingSessionErrorDetails } from "./pairingSession";
import type {
	AgentBrokerErrorDetails,
	AgentPairingThrottleSource,
} from "./types";

export async function readBrokerError(
	response: Response,
	fallback: string,
): Promise<string> {
	return parseResponseErrorMessage(response, fallback);
}

export function parsePositiveInteger(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(0, Math.trunc(value));
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value.trim(), 10);
		if (Number.isFinite(parsed)) {
			return Math.max(0, parsed);
		}
	}
	return 0;
}

export function parseRetryAfterSeconds(response: Response): number {
	const fromHeader = parsePositiveInteger(response.headers.get("Retry-After"));
	return Math.min(AGENT_SESSION_RETRY_AFTER_MAX_SECONDS, fromHeader);
}

export async function readSessionBrokerError(
	response: Response,
): Promise<AgentBrokerPairingSessionErrorDetails> {
	let code = "";
	let message = "";
	let payloadRetryAfter = 0;
	let retryable = false;

	try {
		const payload = (await response.clone().json()) as {
			code?: string;
			error?: string;
			message?: string;
			retry_after_seconds?: number | string;
			meta?: {
				retryable?: boolean;
			};
		} | null;
		code = String(payload?.code || "").trim();
		message = String(payload?.error || payload?.message || "").trim();
		payloadRetryAfter = parsePositiveInteger(payload?.retry_after_seconds);
		retryable = Boolean(payload?.meta?.retryable);
	} catch {
		// Ignore parse issues and fallback to response text.
	}

	if (!message) {
		message = await readBrokerError(
			response,
			`Agent session request failed (${response.status}).`,
		);
	}
	if (!message) {
		message = `Agent session request failed (${response.status}).`;
	}

	const retryAfterSeconds = Math.min(
		AGENT_SESSION_RETRY_AFTER_MAX_SECONDS,
		Math.max(parseRetryAfterSeconds(response), payloadRetryAfter),
	);

	return {
		code,
		message,
		retryAfterSeconds,
		retryable,
	};
}

export function normalizePairingThrottleSource(
	responseStatus: number,
	message: string,
	reason: string,
	payloadSource: string,
): AgentPairingThrottleSource {
	const explicit = payloadSource.trim().toLowerCase();
	if (
		explicit === "local-abuse" ||
		explicit === "supabase" ||
		explicit === "none"
	) {
		return explicit;
	}
	if (responseStatus !== 429) {
		return "none";
	}
	const sourceText = `${reason} ${message}`.toLowerCase();
	if (
		sourceText.includes("supabase") ||
		sourceText.includes("smtp") ||
		sourceText.includes("email rate limit")
	) {
		return "supabase";
	}
	return "local-abuse";
}

export async function readPairingBrokerError(
	response: Response,
	fallback: string,
): Promise<AgentBrokerErrorDetails> {
	const defaultMessage = await readBrokerError(response, fallback);
	const retryFromHeader = parsePositiveInteger(
		response.headers.get("Retry-After"),
	);

	let payloadMessage = "";
	let payloadReason = "";
	let payloadSource = "";
	let payloadRetryAfter = 0;

	try {
		const payload = (await response.clone().json()) as {
			error?: string;
			message?: string;
			reason?: string;
			retry_after_seconds?: number | string;
			throttle_source?: string;
		} | null;
		payloadMessage = String(payload?.error || payload?.message || "").trim();
		payloadReason = String(payload?.reason || "")
			.trim()
			.toLowerCase();
		payloadSource = String(payload?.throttle_source || "").trim();
		payloadRetryAfter = parsePositiveInteger(payload?.retry_after_seconds);
	} catch {
		// Ignore parse errors; fallback message handling already covers this.
	}

	const retryAfterSeconds =
		retryFromHeader > 0 ? retryFromHeader : payloadRetryAfter;
	const messageCandidate = payloadMessage || defaultMessage || fallback;
	const throttleSource = normalizePairingThrottleSource(
		response.status,
		messageCandidate,
		payloadReason,
		payloadSource,
	);

	let message = messageCandidate;
	if (response.status === 429 && retryAfterSeconds > 0) {
		if (throttleSource === "supabase") {
			message = `Email provider rate limit is active. Retry in ${retryAfterSeconds} seconds.`;
		} else {
			message = `Too many verification requests. Retry in ${retryAfterSeconds} seconds.`;
		}
		if (payloadReason) {
			message = `${message} (${payloadReason})`;
		}
	}

	return {
		message,
		status: response.status,
		retryAfterSeconds,
		reason: payloadReason,
		throttleSource,
	};
}
