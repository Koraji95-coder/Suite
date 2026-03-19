import {
	fetchWithTimeout,
	parseResponseErrorMessage,
	FetchRequestError,
	mapFetchErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";

let warnedMissingUser = false;

export class WorkLedgerApiError extends Error {
	status: number;
	code: string;

	constructor(message: string, status: number, code: string) {
		super(message);
		this.name = "WorkLedgerApiError";
		this.status = status;
		this.code = code;
	}
}

export async function getCurrentUserId(): Promise<string | null> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		if (!warnedMissingUser) {
			logger.warn("WorkLedgerService", "Missing authenticated user", { error });
			warnedMissingUser = true;
		}
		return null;
	}
	warnedMissingUser = false;
	return user.id;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
	try {
		const {
			data: { session },
			error,
		} = await supabase.auth.getSession();
		if (error || !session?.access_token) return null;
		return String(session.access_token);
	} catch {
		return null;
	}
}

async function parseApiError(
	response: Response,
): Promise<{ message: string; code: string }> {
	const message = await parseResponseErrorMessage(
		response,
		`HTTP ${response.status}`,
	);
	let codeValue = `HTTP_${response.status}`;
	try {
		const payload = (await response.clone().json()) as unknown;
		if (payload && typeof payload === "object") {
			const candidate = String(
				(payload as Record<string, unknown>).code || "",
			).trim();
			if (candidate) {
				codeValue = candidate;
			}
		}
	} catch {
		// Ignore JSON parse issues and fall back to the HTTP status code.
	}
	return {
		message,
		code: codeValue,
	};
}

export async function requestWorkLedgerApi(
	path: string,
	init: RequestInit = {},
): Promise<unknown> {
	const accessToken = await getSupabaseAccessToken();
	const headers = new Headers(init.headers || {});
	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}
	try {
		const response = await fetchWithTimeout(path, {
			...init,
			headers,
			credentials: "include",
			timeoutMs: 20_000,
			requestName: "Work Ledger API request",
		});
		if (!response.ok) {
			const parsed = await parseApiError(response);
			throw new WorkLedgerApiError(
				parsed.message,
				response.status,
				parsed.code,
			);
		}
		return (await response.json()) as unknown;
	} catch (error) {
		if (error instanceof WorkLedgerApiError) {
			throw error;
		}
		if (error instanceof FetchRequestError) {
			throw new WorkLedgerApiError(
				mapFetchErrorMessage(error, "Work Ledger API request failed."),
				0,
				error.kind === "timeout" ? "TIMEOUT" : "NETWORK_ERROR",
			);
		}
		if (error instanceof Error) {
			throw new WorkLedgerApiError(
				error.message || "Work Ledger API request failed.",
				0,
				"NETWORK_ERROR",
			);
		}
		throw new WorkLedgerApiError(
			"Work Ledger API request failed.",
			0,
			"NETWORK_ERROR",
		);
	}
}
