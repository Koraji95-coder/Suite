import * as appDiagnostics from "@/lib/appDiagnostics";
import {
	FetchRequestError,
	fetchWithTimeout,
	isFetchRequestError,
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

function makeSlowFetch(): ReturnType<typeof vi.spyOn> {
	return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
		return new Promise((_resolve, reject) => {
			const signal = init?.signal as AbortSignal | undefined;
			if (signal?.aborted) {
				reject(abortError());
				return;
			}
			signal?.addEventListener("abort", () => reject(abortError()), {
				once: true,
			});
		}) as Promise<Response>;
	});
}

describe("FetchRequestError", () => {
	it("sets all constructor fields correctly", () => {
		const cause = new Error("original");
		const err = new FetchRequestError({
			kind: "timeout",
			message: "timed out",
			status: undefined,
			timeoutMs: 5000,
			cause,
		});

		expect(err.name).toBe("FetchRequestError");
		expect(err.kind).toBe("timeout");
		expect(err.message).toBe("timed out");
		expect(err.timeoutMs).toBe(5000);
		expect(err.status).toBeUndefined();
		expect(err.cause).toBe(cause);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(FetchRequestError);
	});

	it("sets status for http errors", () => {
		const err = new FetchRequestError({
			kind: "http",
			message: "Not found",
			status: 404,
		});

		expect(err.kind).toBe("http");
		expect(err.status).toBe(404);
		expect(err.timeoutMs).toBeUndefined();
	});
});

describe("isFetchRequestError", () => {
	it("returns true for FetchRequestError instances", () => {
		const err = new FetchRequestError({ kind: "network", message: "fail" });
		expect(isFetchRequestError(err)).toBe(true);
	});

	it("returns false for a plain Error", () => {
		expect(isFetchRequestError(new Error("plain"))).toBe(false);
	});

	it("returns false for non-error values", () => {
		expect(isFetchRequestError(null)).toBe(false);
		expect(isFetchRequestError(undefined)).toBe(false);
		expect(isFetchRequestError("string")).toBe(false);
		expect(isFetchRequestError(42)).toBe(false);
	});
});

describe("mapFetchErrorCode", () => {
	it("returns TIMEOUT for timeout kind", () => {
		const err = new FetchRequestError({ kind: "timeout", message: "t/o" });
		expect(mapFetchErrorCode(err)).toBe("TIMEOUT");
	});

	it("returns NETWORK_ERROR for network kind", () => {
		const err = new FetchRequestError({ kind: "network", message: "net" });
		expect(mapFetchErrorCode(err)).toBe("NETWORK_ERROR");
	});

	it("returns HTTP_ERROR for http kind", () => {
		const err = new FetchRequestError({ kind: "http", message: "http" });
		expect(mapFetchErrorCode(err)).toBe("HTTP_ERROR");
	});

	it("returns REQUEST_ABORTED for aborted kind", () => {
		const err = new FetchRequestError({ kind: "aborted", message: "abort" });
		expect(mapFetchErrorCode(err)).toBe("REQUEST_ABORTED");
	});

	it("returns default fallback for unknown kind", () => {
		const err = new FetchRequestError({ kind: "unknown", message: "???" });
		expect(mapFetchErrorCode(err)).toBe("NETWORK_ERROR");
	});

	it("returns custom fallback for unknown kind", () => {
		const err = new FetchRequestError({ kind: "unknown", message: "???" });
		expect(mapFetchErrorCode(err, "CUSTOM_CODE")).toBe("CUSTOM_CODE");
	});

	it("returns fallback code for non-FetchRequestError", () => {
		expect(mapFetchErrorCode(new Error("plain"))).toBe("NETWORK_ERROR");
		expect(mapFetchErrorCode(null, "CUSTOM_FALLBACK")).toBe("CUSTOM_FALLBACK");
	});
});

describe("mapFetchErrorMessage", () => {
	it("returns error.message for FetchRequestError", () => {
		const err = new FetchRequestError({ kind: "network", message: "net fail" });
		expect(mapFetchErrorMessage(err, "fallback")).toBe("net fail");
	});

	it("returns error.message for a plain Error with a message", () => {
		expect(mapFetchErrorMessage(new Error("plain error"), "fallback")).toBe(
			"plain error",
		);
	});

	it("returns fallback for an Error with an empty message", () => {
		const err = new Error("");
		expect(mapFetchErrorMessage(err, "fallback")).toBe("fallback");
	});

	it("returns fallback for non-error values", () => {
		expect(mapFetchErrorMessage(null, "fallback")).toBe("fallback");
		expect(mapFetchErrorMessage(undefined, "fallback")).toBe("fallback");
		expect(mapFetchErrorMessage(42, "fallback")).toBe("fallback");
	});
});

describe("parseResponseErrorMessage", () => {
	it("returns the message field from a JSON response", async () => {
		const response = new Response(JSON.stringify({ message: "invalid input" }), {
			headers: { "content-type": "application/json" },
			status: 400,
		});

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"invalid input",
		);
	});

	it("returns the error field from a JSON response", async () => {
		const response = new Response(
			JSON.stringify({ error: "backend unavailable" }),
			{ headers: { "content-type": "application/json" }, status: 503 },
		);

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"backend unavailable",
		);
	});

	it("returns the detail field from a JSON response", async () => {
		const response = new Response(JSON.stringify({ detail: "not found" }), {
			headers: { "content-type": "application/json" },
			status: 404,
		});

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"not found",
		);
	});

	it("returns plain text when content type is not JSON", async () => {
		const response = new Response("Service unavailable", {
			headers: { "content-type": "text/plain" },
			status: 503,
		});

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"Service unavailable",
		);
	});

	it("returns the fallback when the body is empty", async () => {
		const response = new Response("", { status: 500 });

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"fallback",
		);
	});

	it("returns the fallback when JSON parsing fails", async () => {
		const response = new Response("{broken json", {
			headers: { "content-type": "application/json" },
			status: 400,
		});

		await expect(parseResponseErrorMessage(response, "fallback")).resolves.toBe(
			"fallback",
		);
	});
});

describe("fetchWithTimeout", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns the response when the request succeeds", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("ok", { status: 200 }),
		);

		const response = await fetchWithTimeout("https://suite.local/health");

		expect(response.status).toBe(200);
	});

	it("does not throw on HTTP errors when throwOnHttpError is false (default)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("Not Found", { status: 404 }),
		);

		const response = await fetchWithTimeout("https://suite.local/missing");

		expect(response.status).toBe(404);
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
		makeSlowFetch();

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

	it("timeout message includes request name and timeout duration", async () => {
		vi.useFakeTimers();
		makeSlowFetch();

		const pending = fetchWithTimeout("https://suite.local/slow", {
			timeoutMs: 100,
			requestName: "Load project",
		});

		const assertion = expect(pending).rejects.toThrow(
			"Load project timed out after 100ms",
		);
		await vi.advanceTimersByTimeAsync(110);
		await assertion;
	});

	it("throws a network error when fetch rejects with TypeError", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(
			new TypeError("Failed to fetch"),
		);

		await expect(
			fetchWithTimeout("https://suite.local/api", { requestName: "API call" }),
		).rejects.toMatchObject({
			kind: "network",
			message: expect.stringContaining("network error"),
		});
	});

	it("throws an aborted error when the upstream signal is already aborted", async () => {
		makeSlowFetch();

		const controller = new AbortController();
		controller.abort();

		await expect(
			fetchWithTimeout("https://suite.local/api", {
				signal: controller.signal,
				requestName: "Cancelled request",
			}),
		).rejects.toMatchObject({
			kind: "aborted",
		});
	});

	it("throws an aborted error when the upstream signal fires mid-request", async () => {
		makeSlowFetch();

		const controller = new AbortController();
		const pending = fetchWithTimeout("https://suite.local/api", {
			signal: controller.signal,
			requestName: "Cancelled request",
		});

		controller.abort();

		await expect(pending).rejects.toMatchObject({
			kind: "aborted",
			message: expect.stringContaining("cancelled"),
		});
	});

	it("wraps an unexpected Error as an unknown kind", async () => {
		const weirdError = new Error("something strange");
		weirdError.name = "WeirdError";
		vi.spyOn(globalThis, "fetch").mockRejectedValue(weirdError);

		await expect(
			fetchWithTimeout("https://suite.local/api"),
		).rejects.toMatchObject({
			kind: "unknown",
			message: "something strange",
		});
	});

	it("wraps a non-Error rejection as an unknown kind with fallback message", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue("string rejection");

		await expect(
			fetchWithTimeout("https://suite.local/api", {
				requestName: "My request",
			}),
		).rejects.toMatchObject({
			kind: "unknown",
			message: "My request failed unexpectedly.",
		});
	});

	it("records a diagnostic on timeout", async () => {
		vi.useFakeTimers();
		makeSlowFetch();
		const spy = vi.spyOn(appDiagnostics, "recordAppDiagnostic");

		const pending = fetchWithTimeout("https://suite.local/slow", {
			timeoutMs: 50,
			requestName: "Diagnose me",
		});

		const assertion = expect(pending).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(60);
		await assertion;

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "fetch",
				severity: "error",
				title: "Diagnose me timed out",
			}),
		);
	});

	it("does not record a diagnostic in silent mode on timeout", async () => {
		vi.useFakeTimers();
		makeSlowFetch();
		const spy = vi.spyOn(appDiagnostics, "recordAppDiagnostic");

		const pending = fetchWithTimeout("https://suite.local/slow", {
			timeoutMs: 50,
			requestName: "Silent request",
			diagnosticsMode: "silent",
		});

		const assertion = expect(pending).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(60);
		await assertion;

		expect(spy).not.toHaveBeenCalled();
	});

	it("records a warning-level diagnostic for 4xx HTTP errors when throwOnHttpError is true", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ message: "bad request" }), {
				status: 400,
				headers: { "content-type": "application/json" },
			}),
		);
		const spy = vi.spyOn(appDiagnostics, "recordAppDiagnostic");

		await expect(
			fetchWithTimeout("https://suite.local/api", {
				throwOnHttpError: true,
				requestName: "Bad request",
			}),
		).rejects.toThrow();

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "fetch",
				severity: "warning",
				title: "Bad request HTTP 400",
			}),
		);
	});

	it("records an error-level diagnostic for 5xx HTTP errors when throwOnHttpError is true", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ message: "server error" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			}),
		);
		const spy = vi.spyOn(appDiagnostics, "recordAppDiagnostic");

		await expect(
			fetchWithTimeout("https://suite.local/api", {
				throwOnHttpError: true,
				requestName: "Server error",
			}),
		).rejects.toThrow();

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "fetch",
				severity: "error",
				title: "Server error HTTP 500",
			}),
		);
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
