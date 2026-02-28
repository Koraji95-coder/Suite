import { logger } from "../lib/logger";

type AuthPath = "/login" | "/reset-password";

export function resolveAuthRedirect(path: AuthPath): string | undefined {
	const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL;
	const browserOrigin =
		typeof window !== "undefined" ? window.location.origin : undefined;

	const browserRedirect = browserOrigin ? `${browserOrigin}${path}` : undefined;

	if (
		typeof configuredRedirect !== "string" ||
		configuredRedirect.trim().length === 0
	) {
		return browserRedirect;
	}

	const candidate = configuredRedirect.trim();

	try {
		const parsed = new URL(candidate);
		parsed.pathname = path;
		parsed.search = "";
		parsed.hash = "";

		if (import.meta.env.DEV && typeof window !== "undefined") {
			const configuredHost = parsed.host;
			const browserHost = window.location.host;

			if (configuredHost !== browserHost && browserRedirect) {
				logger.warn(
					"AuthRedirect",
					"Configured auth redirect host mismatches current host in dev; using browser origin",
					{ configuredHost, browserHost, path },
				);
				return browserRedirect;
			}
		}

		return parsed.toString();
	} catch (_error) {
		if (browserRedirect) return browserRedirect;
		return undefined;
	}
}
