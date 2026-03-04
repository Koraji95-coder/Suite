import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { supabase } from "@/supabase/client";

export type PasskeyStartResponse = {
	ok?: boolean;
	method?: "passkey";
	mode?: "redirect" | "webauthn";
	provider?: string;
	provider_label?: string;
	state?: string;
	state_expires_at?: string;
	public_key?:
		| PublicKeyCredentialRequestOptionsJSON
		| PublicKeyCredentialCreationOptionsJSON;
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
	passkey?: {
		id?: string;
		credential_id?: string;
		friendly_name?: string | null;
		device_type?: string | null;
		created_at?: string;
	};
};

type PasskeyStartPayload = {
	redirectTo?: string;
};

type PasskeyVerifyPayload = {
	state: string;
	credential: RegistrationResponseJSON | AuthenticationResponseJSON;
	redirectTo?: string;
	friendlyName?: string;
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

export async function completePasskeySignInVerification(
	payload: PasskeyVerifyPayload,
): Promise<PasskeyCallbackCompleteResponse> {
	const response = await fetch("/api/auth/passkey/auth/verify", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			state: payload.state,
			credential: payload.credential,
			redirectTo: payload.redirectTo,
		}),
	});

	if (!response.ok) {
		const message = await parsePasskeyError(
			response,
			"Unable to verify passkey sign-in.",
		);
		throw new Error(message);
	}

	return (await response.json()) as PasskeyCallbackCompleteResponse;
}

export async function completePasskeyEnrollmentVerification(
	payload: PasskeyVerifyPayload,
): Promise<PasskeyCallbackCompleteResponse> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session?.access_token) {
		throw new Error("You must be signed in to complete passkey enrollment.");
	}

	const response = await fetch("/api/auth/passkey/register/verify", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.access_token}`,
		},
		body: JSON.stringify({
			state: payload.state,
			credential: payload.credential,
			friendlyName: payload.friendlyName,
		}),
	});

	if (!response.ok) {
		const message = await parsePasskeyError(
			response,
			"Unable to verify passkey enrollment.",
		);
		throw new Error(message);
	}

	return (await response.json()) as PasskeyCallbackCompleteResponse;
}
