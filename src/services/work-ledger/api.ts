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
	try {
		const payload = (await response.json()) as unknown;
		if (payload && typeof payload === "object") {
			const value = String(
				(payload as Record<string, unknown>).error ||
					(payload as Record<string, unknown>).message ||
					"",
			).trim();
			const codeValue = String(
				(payload as Record<string, unknown>).code || "",
			).trim();
			if (value) {
				return {
					message: value,
					code: codeValue || `HTTP_${response.status}`,
				};
			}
		}
	} catch {
		// No-op; fallback to raw response text.
	}
	const text = await response.text().catch(() => "");
	return {
		message: text || `HTTP ${response.status}`,
		code: `HTTP_${response.status}`,
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
	const response = await fetch(path, {
		...init,
		headers,
		credentials: "include",
	});
	if (!response.ok) {
		const parsed = await parseApiError(response);
		throw new WorkLedgerApiError(parsed.message, response.status, parsed.code);
	}
	return (await response.json()) as unknown;
}
