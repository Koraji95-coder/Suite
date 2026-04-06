import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchRequestError } from "@/lib/fetchWithTimeout";
import type { ProjectStandardsTicketResponse } from "./backendService";
import {
	STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE,
	standardsCheckerCompanionService,
} from "./companionService";

// Partially mock fetchWithTimeout — keep the real FetchRequestError class so
// that instanceof checks in companionService.ts work correctly.
const mockFetchWithTimeout = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetchWithTimeout", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/fetchWithTimeout")>();
	return {
		...actual,
		fetchWithTimeout: mockFetchWithTimeout,
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(): ProjectStandardsTicketResponse {
	return {
		ok: true,
		ticket: "test-ticket-abc",
		requestId: "req-test-001",
		action: "run-review",
		issuedAt: 1_000_000_000,
		expiresAt: 1_000_000_180,
		ttlSeconds: 180,
		projectId: "PROJ-00001",
	};
}

type MockBody = Record<string, unknown> | null;

/**
 * Build a minimal mock Response whose json/text can be controlled per test.
 * `clone()` is called at least twice: once by requestJson for the initial
 * parse, and once again by parseResponseErrorMessage for error extraction.
 * Each call returns a fresh copy so exhausted-reader errors are avoided.
 */
function makeResponse(opts: {
	ok: boolean;
	status?: number;
	body?: MockBody;
	/** When true the json() call rejects, exercising the .catch(() => null) path. */
	jsonThrows?: boolean;
	contentType?: string;
}): Response {
	const status = opts.status ?? (opts.ok ? 200 : 500);
	const contentType = opts.contentType ?? "";

	const makeJsonFn = () =>
		opts.jsonThrows
			? () => Promise.reject(new SyntaxError("Unexpected token"))
			: () => Promise.resolve(opts.body ?? null);

	return {
		ok: opts.ok,
		status,
		headers: {
			get: (key: string) =>
				key.toLowerCase() === "content-type" ? contentType : null,
		},
		// Each call to clone() returns a fresh object so multiple callers
		// (requestJson and parseResponseErrorMessage) each get an unread reader.
		clone: () => ({
			json: makeJsonFn(),
			text: () => Promise.resolve(""),
		}),
	} as unknown as Response;
}

const TEST_TICKET = makeTicket();
const TEST_ARGS = {
	projectId: "PROJ-00001",
	projectRootPath: "C:\\Users\\Dev\\MyProject",
	cadFamilyId: null as string | null,
	standardsCategory: "NEC" as const,
	selectedStandardIds: ["jic"],
};

afterEach(() => {
	mockFetchWithTimeout.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("standardsCheckerCompanionService.runReview", () => {
	it("returns the parsed response when fetch succeeds with valid JSON", async () => {
		const reviewData = {
			results: [],
			summary: {},
			dwsPaths: [],
			inspectedDrawings: [],
			layerAlerts: [],
		};
		mockFetchWithTimeout.mockResolvedValue(
			makeResponse({
				ok: true,
				body: { success: true, message: "ok", data: reviewData },
			}),
		);

		const result = await standardsCheckerCompanionService.runReview(
			TEST_TICKET,
			TEST_ARGS,
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(reviewData);
	});

	it("returns the error envelope when response is not-ok but carries a valid success field", async () => {
		mockFetchWithTimeout.mockResolvedValue(
			makeResponse({
				ok: false,
				status: 422,
				body: {
					success: false,
					message: "Review target not found.",
					code: "NOT_FOUND",
				},
			}),
		);

		const result = await standardsCheckerCompanionService.runReview(
			TEST_TICKET,
			TEST_ARGS,
		);

		expect(result.success).toBe(false);
		expect(result.message).toBe("Review target not found.");
	});

	it("throws with the unavailable message when response is not-ok and JSON parse fails (.catch(() => null) path)", async () => {
		// jsonThrows=true exercises the .catch(() => null) guard so that parsed
		// becomes null; the service then falls through to parseResponseErrorMessage
		// which returns the fallback because the response body is empty.
		mockFetchWithTimeout.mockResolvedValue(
			makeResponse({ ok: false, status: 503, jsonThrows: true }),
		);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow(STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE);
	});

	it("throws 'empty response' when response is ok but JSON parse fails (.catch(() => null) path)", async () => {
		// jsonThrows=true on an ok response exercises the !parsed branch that
		// throws the empty-response sentinel.
		mockFetchWithTimeout.mockResolvedValue(
			makeResponse({ ok: true, jsonThrows: true }),
		);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow("Runtime Control returned an empty response.");
	});

	it("re-wraps a network FetchRequestError as a plain Error with the original message", async () => {
		const networkError = new FetchRequestError({
			kind: "network",
			message: "Request failed due to a network error. Check backend connectivity and retry.",
		});
		mockFetchWithTimeout.mockRejectedValue(networkError);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow(networkError.message);
	});

	it("re-wraps a timeout FetchRequestError as a plain Error with the original message", async () => {
		const timeoutError = new FetchRequestError({
			kind: "timeout",
			message: "Request timed out after 120000ms. The server may still be processing.",
			timeoutMs: 120_000,
		});
		mockFetchWithTimeout.mockRejectedValue(timeoutError);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow(timeoutError.message);
	});

	it("re-wraps an aborted FetchRequestError as a plain Error with the original message", async () => {
		const abortedError = new FetchRequestError({
			kind: "aborted",
			message: "Request was cancelled before completion.",
		});
		mockFetchWithTimeout.mockRejectedValue(abortedError);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow(abortedError.message);
	});

	it("re-throws a http FetchRequestError without wrapping it in a plain Error", async () => {
		const httpError = new FetchRequestError({
			kind: "http",
			message: "HTTP 500 Internal Server Error.",
			status: 500,
		});
		mockFetchWithTimeout.mockRejectedValue(httpError);

		// The service re-throws the original FetchRequestError for http kind, so
		// the rejected value must be the exact same error object.
		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow(httpError);
	});

	it("re-throws non-FetchRequestError errors without wrapping", async () => {
		const unexpectedError = new Error("Unexpected internal error.");
		mockFetchWithTimeout.mockRejectedValue(unexpectedError);

		await expect(
			standardsCheckerCompanionService.runReview(TEST_TICKET, TEST_ARGS),
		).rejects.toThrow("Unexpected internal error.");
	});
});
