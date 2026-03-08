import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorCode,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { afterEach, describe, expect, it, vi } from "vitest";

function abortError(): Error {
	const error = new Error("aborted");
	error.name = "AbortError";
	return error;
}

describe("fetchWithTimeout", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("parses JSON response errors", async () => {
		const response = new Response(JSON.stringify({ message: "invalid input" }), {
			headers: { "content-type": "application/json" },
			status: 400,
		});

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"invalid input",
		);
	});

	it("maps HTTP failures with throwOnHttpError enabled", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "backend unavailable" }), {
				status: 503,
				headers: { "content-type": "application/json" },
			}),
		);

		await expect(
			fetchWithTimeout("https://suite.local/test", {
				throwOnHttpError: true,
				requestName: "Test request",
			}),
		).rejects.toMatchObject({
			kind: "http",
			status: 503,
			message: "backend unavailable",
		});
	});

	it("throws timeout error when request exceeds timeout", async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
			return new Promise((_resolve, reject) => {
				const signal = init?.signal as AbortSignal | undefined;
				if (signal?.aborted) {
					reject(abortError());
					return;
				}
				signal?.addEventListener(
					"abort",
					() => {
						reject(abortError());
					},
					{ once: true },
				);
			}) as Promise<Response>;
		});

		const pending = fetchWithTimeout("https://suite.local/slow", {
			timeoutMs: 25,
			requestName: "Slow request",
		});

		const assertion = expect(pending).rejects.toMatchObject({
			kind: "timeout",
			timeoutMs: 25,
		});
		await vi.advanceTimersByTimeAsync(30);
		await assertion;
	});

	it("maps network errors to normalized code and message", async () => {
		const error = new FetchRequestError({
			kind: "network",
			message: "Network path failed",
		});
		expect(mapFetchErrorCode(error)).toBe("NETWORK_ERROR");
		expect(mapFetchErrorMessage(error, "fallback")).toBe("Network path failed");
	});
});
