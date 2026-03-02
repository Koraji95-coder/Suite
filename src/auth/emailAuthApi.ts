import { logger } from "../lib/logger";
import { resolveAuthRedirect } from "./authRedirect";

export type EmailAuthFlow = "signin" | "signup";

export type EmailAuthRequestOptions = {
	captchaToken?: string;
	honeypot?: string;
};

type EmailLinkResponse = {
	ok?: boolean;
	message?: string;
	error?: string;
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

	const response = await fetch("/api/auth/email-link", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (response.ok) {
		return;
	}

	let message = "Unable to send email link right now. Please try again.";
	try {
		const payload = (await response.json()) as EmailLinkResponse;
		if (typeof payload.error === "string" && payload.error.trim().length > 0) {
			message = payload.error.trim();
		}
	} catch (error) {
		logger.warn(
			"Email auth API response was not JSON; using generic error.",
			"emailAuthApi",
			{ error },
		);
	}

	throw new Error(message);
}
