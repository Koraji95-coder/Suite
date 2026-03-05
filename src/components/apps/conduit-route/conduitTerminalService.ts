import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	TerminalScanRequest,
	TerminalScanResponse,
} from "./conduitTerminalTypes";

class ConduitTerminalService {
	private baseUrl: string;
	private apiKey: string;
	private missingAuthWarningShown = false;

	constructor() {
		this.baseUrl =
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000";
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for terminal scan auth",
					"ConduitTerminalService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (err) {
			logger.error(
				"Unexpected error while reading Supabase session for terminal scan auth",
				"ConduitTerminalService",
				err,
			);
			return null;
		}
	}

	private async getHeaders(): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
			return headers;
		}

		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
			return headers;
		}

		if (!this.missingAuthWarningShown) {
			this.missingAuthWarningShown = true;
			logger.warn(
				"No bearer token or API key available for conduit terminal scan auth.",
				"ConduitTerminalService",
			);
		}

		return headers;
	}

	private async parseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const payload = (await response.json()) as {
				error?: string;
				message?: string;
			} | null;
			const candidate = payload?.error || payload?.message;
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim();
			}
		} catch {
			// Ignore parse failure and keep fallback.
		}
		return fallback;
	}

	async scanTerminalStrips(
		request: TerminalScanRequest = {},
	): Promise<TerminalScanResponse> {
		try {
			const headers = await this.getHeaders();
			const response = await fetch(
				`${this.baseUrl}/api/conduit-route/terminal-scan`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						selectionOnly: request.selectionOnly ?? false,
						includeModelspace: request.includeModelspace ?? true,
						maxEntities: request.maxEntities ?? 50000,
					}),
				},
			);

			const payload = (await response
				.json()
				.catch(() => null)) as TerminalScanResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: payload?.code || "REQUEST_FAILED",
					message:
						payload?.message ||
						(await this.parseErrorMessage(
							response,
							`Terminal scan failed (${response.status})`,
						)),
				};
			}

			if (payload && typeof payload.success === "boolean") {
				return payload;
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Terminal scan returned an unexpected payload.",
			};
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Terminal scan request failed";
			logger.error(
				"Terminal scan request failed",
				"ConduitTerminalService",
				err,
			);
			return {
				success: false,
				code: "NETWORK_ERROR",
				message,
			};
		}
	}
}

export const conduitTerminalService = new ConduitTerminalService();
