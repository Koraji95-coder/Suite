import { supabase } from "@/supabase/client";

export type PasskeyStartResponse = {
	ok?: boolean;
	method?: "passkey";
	mode?: "redirect";
	provider?: string;
	provider_label?: string;
	redirect_url?: string;
	message?: string;
	error?: string;
	code?: string;
	next_step?: string;
};

export type PasskeyCallbackCompletePayload = {
	state: string;
	status: "success" | "failed";
	intent?: string;
	email?: string;
	error?: string;
	signature?: string;
	timestamp?: string | number;
};

export type PasskeyCallbackCompleteResponse = {
	ok?: boolean;
	completed?: boolean;
	intent?: string;
	status?: string;
	message?: string;
	error?: string;
	code?: string;
	session_mode?: string;
	resume_url?: string;
	redirect_to?: string;
};

type PasskeyStartPayload = {
	redirectTo?: string;
};

async function parsePasskeyError(
	response: Response,
	fallbackMessage: string,
): Promise<string> {
	try {
		const payload = (await response.json()) as PasskeyStartResponse;
		if (typeof payload.error === "string" && payload.error.trim().length > 0) {
			return payload.error.trim();
		}
	} catch (_error) {
		// Ignore JSON parse errors and use fallback.
	}
	return fallbackMessage;
}

function buildPayload(redirectTo?: string): PasskeyStartPayload {
	const payload: PasskeyStartPayload = {};
	if (redirectTo && redirectTo.trim().length > 0) {
		payload.redirectTo = redirectTo.trim();
	}
	return payload;
}

export async function startPasskeySignIn(
	redirectTo?: string,
): Promise<PasskeyStartResponse> {
	const response = await fetch("/api/auth/passkey/sign-in", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildPayload(redirectTo)),
	});

	if (!response.ok) {
		const message = await parsePasskeyError(
			response,
			"Unable to start passkey sign-in.",
		);
		throw new Error(message);
	}

	return (await response.json()) as PasskeyStartResponse;
}

export async function startPasskeyEnrollment(
	redirectTo?: string,
): Promise<PasskeyStartResponse> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session?.access_token) {
		throw new Error("You must be signed in to enroll a passkey.");
	}

	const response = await fetch("/api/auth/passkey/enroll", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.access_token}`,
		},
		body: JSON.stringify(buildPayload(redirectTo)),
	});

	if (!response.ok) {
		const message = await parsePasskeyError(
			response,
			"Unable to start passkey enrollment.",
		);
		throw new Error(message);
	}

	return (await response.json()) as PasskeyStartResponse;
}

export async function completePasskeyCallback(
	payload: PasskeyCallbackCompletePayload,
): Promise<PasskeyCallbackCompleteResponse> {
	const response = await fetch("/api/auth/passkey/callback/complete", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const message = await parsePasskeyError(
			response,
			"Unable to complete passkey callback.",
		);
		throw new Error(message);
	}

	return (await response.json()) as PasskeyCallbackCompleteResponse;
}
