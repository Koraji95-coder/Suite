import { logger } from "../lib/logger";

type AuthPath = "/login" | "/reset-password";

function normalizeOrigin(value: string): string | null {
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.origin;
	} catch (_error) {
		return null;
	}
}

function getAllowedAuthOrigins(browserOrigin?: string): Set<string> {
	const allowed = new Set<string>();
	const raw = import.meta.env.VITE_AUTH_ALLOWED_ORIGINS ?? "";

	for (const entry of raw.split(",")) {
		const normalized = normalizeOrigin(entry.trim());
		if (normalized) {
			allowed.add(normalized);
		}
	}

	if (browserOrigin) {
		const normalizedBrowserOrigin = normalizeOrigin(browserOrigin);
		if (normalizedBrowserOrigin) {
			allowed.add(normalizedBrowserOrigin);
		}
	}

	return allowed;
}

export function resolveAuthRedirect(path: AuthPath): string | undefined {
	const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL;
	const browserOrigin =
		typeof window !== "undefined" ? window.location.origin : undefined;
	const allowedOrigins = getAllowedAuthOrigins(browserOrigin);

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
		const configuredOrigin = parsed.origin;

		if (allowedOrigins.size > 0 && !allowedOrigins.has(configuredOrigin)) {
			logger.warn(
				"AuthRedirect",
				"Configured auth redirect origin is outside allowed origins; using browser origin.",
				{ configuredOrigin, allowedOrigins: Array.from(allowedOrigins), path },
			);
			return browserRedirect;
		}

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
