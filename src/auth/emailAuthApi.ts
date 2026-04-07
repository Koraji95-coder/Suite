import { logger } from "../lib/logger";
import { fetchWithTimeout, mapFetchErrorMessage } from "../lib/fetchWithTimeout";
import { resolveAuthRedirect } from "./authRedirect";

export type EmailAuthFlow = "signin" | "signup";

export type EmailAuthRequestOptions = {
	captchaToken?: string;
	honeypot?: string;
};

type EmailLinkRequestPayload = {
	email: string;
	flow: EmailAuthFlow;
	redirectTo?: string;
	captchaToken?: string;
	[key: string]: string | undefined;
};

function getAuthRedirectForFlow(flow: EmailAuthFlow): string | undefined {
	if (flow === "signin" || flow === "signup") {
		return resolveAuthRedirect("/login");
	}
	return undefined;
}

export async function requestEmailAuthLink(
	email: string,
	flow: EmailAuthFlow,
	options: EmailAuthRequestOptions = {},
): Promise<void> {
	const payload: EmailLinkRequestPayload = {
		email,
		flow,
	};

	const redirectTo = getAuthRedirectForFlow(flow);
	if (redirectTo) {
		payload.redirectTo = redirectTo;
	}

	const captchaToken = options.captchaToken?.trim();
	if (captchaToken) {
		payload.captchaToken = captchaToken;
	}

	const honeypotField =
		(import.meta.env.VITE_AUTH_HONEYPOT_FIELD || "company").trim() || "company";
	if (typeof options.honeypot === "string") {
		payload[honeypotField] = options.honeypot;
	}

	try {
		const response = await fetchWithTimeout("/api/auth/email-link", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(payload),
			timeoutMs: 20_000,
			requestName: "Email auth request",
		});

		if (response.ok) {
			return;
		}

		logger.warn(
			"Email auth API returned non-OK response; using generic error.",
			"emailAuthApi",
			{ status: response.status },
		);
		throw new Error("Unable to send email link right now. Please try again.");
	} catch (error) {
		const fallback = "Unable to send email link right now. Please try again.";
		throw new Error(mapFetchErrorMessage(error, fallback));
	}
}
