import { logger } from "../lib/logger";

export type EmailAuthFlow = "signin" | "signup" | "reset";

type EmailLinkResponse = {
	ok?: boolean;
	message?: string;
	error?: string;
};

export async function requestEmailAuthLink(
	email: string,
	flow: EmailAuthFlow,
): Promise<void> {
	const response = await fetch("/api/auth/email-link", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, flow }),
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
