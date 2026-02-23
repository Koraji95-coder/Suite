/**
 * Request utilities with timeout and retry logic
 * Includes exponential backoff for polling and retries
 */

import {
	err,
	NetworkError,
	ok,
	type Result,
	TimeoutError,
} from "./errorHandling";
import { logger } from "./logger";

// ── Timeout Configuration ─────────────────────────────────────

export const TIMEOUT_PRESETS = {
	fast: 5000, // 5 seconds - for quick operations
	normal: 30000, // 30 seconds - default for most requests
	slow: 60000, // 1 minute - for complex operations
	verySlow: 300000, // 5 minutes - for very long operations
} as const;

export type TimeoutPreset = keyof typeof TIMEOUT_PRESETS;

export interface RequestOptions {
	timeout?: number | TimeoutPreset;
	retries?: number;
	retryDelay?: number;
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
}

/**
 * Fetch with automatic timeout
 */
export async function fetchWithTimeout(
	url: string,
	options: RequestOptions = {},
): Promise<Response> {
	const timeout =
		typeof options.timeout === "string"
			? TIMEOUT_PRESETS[options.timeout]
			: (options.timeout ?? TIMEOUT_PRESETS.normal);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			...options,
			method: options.method,
			headers: options.headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			throw new TimeoutError(url, timeout);
		}
		throw error;
	}
}

/**
 * Fetch with automatic retries and exponential backoff
 */
export async function fetchWithRetry(
	url: string,
	options: RequestOptions = {},
): Promise<Response> {
	const maxRetries = options.retries ?? 3;
	const baseDelay = options.retryDelay ?? 1000;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			logger.debug(
				`Fetch attempt ${attempt + 1}/${maxRetries + 1}`,
				"fetchWithRetry",
				{
					url,
				},
			);

			const response = await fetchWithTimeout(url, options);

			// Don't retry on client errors (4xx except 429)
			if (
				response.status >= 400 &&
				response.status < 500 &&
				response.status !== 429
			) {
				return response;
			}

			// Retry on server errors (5xx) or rate limiting (429)
			if (response.status >= 500 || response.status === 429) {
				if (attempt < maxRetries) {
					const delay = calculateBackoff(attempt, baseDelay);
					logger.warn(
						`Request failed with status ${response.status}, retrying in ${delay}ms`,
						"fetchWithRetry",
					);
					await sleep(delay);
					continue;
				}
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt < maxRetries) {
				const delay = calculateBackoff(attempt, baseDelay);
				logger.warn(
					`Request failed: ${lastError.message}, retrying in ${delay}ms`,
					"fetchWithRetry",
				);
				await sleep(delay);
			}
		}
	}

	throw lastError || new NetworkError("Request failed after retries");
}

// ── Exponential Backoff ───────────────────────────────────────

export interface BackoffOptions {
	initialDelay?: number; // milliseconds
	maxDelay?: number; // milliseconds
	multiplier?: number; // backoff multiplier
	jitter?: boolean; // add random jitter to prevent thundering herd
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
	attempt: number,
	initialDelay: number = 1000,
	options: BackoffOptions = {},
): number {
	const {
		maxDelay = 32000, // 32 seconds max
		multiplier = 2,
		jitter = true,
	} = options;

	// Calculate base delay: initialDelay * (multiplier ^ attempt)
	let delay = initialDelay * Math.pow(multiplier, attempt);

	// Cap at maxDelay
	delay = Math.min(delay, maxDelay);

	// Add jitter (±25% random variation)
	if (jitter) {
		const jitterAmount = delay * 0.25;
		delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
	}

	return Math.floor(delay);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Polling with Exponential Backoff ──────────────────────────

export interface PollingOptions<T> {
	interval?: number; // initial polling interval in ms
	maxAttempts?: number; // max number of polling attempts (0 = infinite)
	timeout?: number; // total timeout in ms (0 = no timeout)
	backoff?: boolean; // use exponential backoff
	condition?: (result: T) => boolean; // custom success condition
}

/**
 * Poll a function until it succeeds or times out
 */
export async function pollUntilSuccess<T>(
	fn: () => Promise<T>,
	options: PollingOptions<T> = {},
): Promise<Result<T, Error>> {
	const {
		interval = 1000,
		maxAttempts = 0,
		timeout = 0,
		backoff = true,
		condition,
	} = options;

	const startTime = Date.now();
	let attempt = 0;

	while (true) {
		// Check timeout
		if (timeout > 0 && Date.now() - startTime > timeout) {
			logger.warn("Polling timed out", "pollUntilSuccess");
			return err(new TimeoutError("Polling", timeout));
		}

		// Check max attempts
		if (maxAttempts > 0 && attempt >= maxAttempts) {
			logger.warn("Polling exceeded max attempts", "pollUntilSuccess");
			return err(new Error("Max polling attempts exceeded"));
		}

		try {
			const result = await fn();

			// Check custom condition or default to truthy
			if (condition ? condition(result) : result) {
				logger.debug(
					`Polling succeeded after ${attempt + 1} attempts`,
					"pollUntilSuccess",
				);
				return ok(result);
			}
		} catch (error) {
			logger.debug(
				`Polling attempt ${attempt + 1} failed`,
				"pollUntilSuccess",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		// Calculate delay with optional backoff
		const delay = backoff ? calculateBackoff(attempt, interval) : interval;
		logger.debug(`Polling again in ${delay}ms`, "pollUntilSuccess");
		await sleep(delay);
		attempt++;
	}
}

/**
 * Poll a URL endpoint until it responds successfully
 */
export async function pollEndpoint(
	url: string,
	options: PollingOptions<Response> & RequestOptions = {},
): Promise<Result<Response, Error>> {
	return pollUntilSuccess(
		async () => {
			const response = await fetchWithTimeout(url, options);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			return response;
		},
		{
			...options,
			condition: (response) => response.ok,
		},
	);
}
