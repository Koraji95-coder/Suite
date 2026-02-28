/**
 * Supabase configuration validation and graceful degradation utilities.
 *
 * When Supabase credentials are not configured, the app should continue
 * to function with reduced features rather than showing fatal errors.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

export type SupabaseError =
	| PostgrestError
	| {
			message: string;
			details: string | null;
			hint: string | null;
			code: string | null;
	  };

/**
 * Check if Supabase is properly configured with valid credentials.
 * Returns false if using placeholder/example values.
 */
export function isSupabaseConfigured(): boolean {
	const url = import.meta.env.VITE_SUPABASE_URL;
	const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

	// Check if env vars exist
	if (!url || !key) {
		return false;
	}

	// Check for placeholder/example values
	const isPlaceholderUrl =
		url.includes("example.supabase.co") ||
		url.includes("your-project") ||
		url === "https://example.supabase.co";

	const isPlaceholderKey =
		key === "public-anon-key-placeholder" ||
		key === "your-anon-key-here" ||
		key.length < 20;

	return !isPlaceholderUrl && !isPlaceholderKey;
}

/**
 * Safe wrapper for Supabase queries that gracefully handles missing configuration.
 * Returns null data and a descriptive error when Supabase is not configured.
 */
export async function safeSupabaseQuery<T>(
	queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
	context: string,
): Promise<{ data: T | null; error: SupabaseError | null }> {
	if (!isSupabaseConfigured()) {
		const error: SupabaseError = {
			message: "Supabase not configured",
			details:
				"Please create a .env file with valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. See .env.example for template.",
			hint: "Run: cp .env.example .env and fill in your Supabase credentials",
			code: "SUPABASE_NOT_CONFIGURED",
		};

		logger.debug(context, "Supabase query skipped (not configured)", {
			context,
		});

		return { data: null, error };
	}

	try {
		return await queryFn();
	} catch (err: unknown) {
		logger.error(context, "Supabase query failed", { error: err });
		return {
			data: null,
			error: {
				message: err instanceof Error ? err.message : "Unknown error",
				details: err instanceof Error ? err.message : String(err),
				hint: "",
				code: "QUERY_ERROR",
			},
		};
	}
}

/**
 * Get a user-friendly status message about Supabase configuration.
 */
export function getSupabaseStatus(): { configured: boolean; message: string } {
	if (isSupabaseConfigured()) {
		return {
			configured: true,
			message: "Supabase connected",
		};
	}

	const hasEnvVars = Boolean(
		import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
	);

	if (!hasEnvVars) {
		return {
			configured: false,
			message:
				"Missing Supabase credentials. Create a .env file from .env.example template.",
		};
	}

	return {
		configured: false,
		message:
			"Supabase credentials appear to be placeholders. Update your .env file with real values.",
	};
}
