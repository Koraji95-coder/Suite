import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailAuthLink } from "@/auth/emailAuthApi";

vi.mock("@/lib/logger", () => ({
	logger: {
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock("@/lib/appDiagnostics", () => ({
	recordAppDiagnostic: vi.fn(),
}));

const mockFetch = vi.fn();

describe("emailAuthApi", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("throws the static fallback message when the API returns a non-JSON error response", async () => {
		mockFetch.mockResolvedValue(
			new Response("Internal Server Error: stack trace exposed here", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			}),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signin"),
		).rejects.toThrow(
			"Unable to send email link right now. Please try again.",
		);
	});

	it("does not expose raw server text in the error when response is non-JSON", async () => {
		const rawServerText = "INTERNAL_DB_ERROR: connection refused at 127.0.0.1:5432";
		mockFetch.mockResolvedValue(
			new Response(rawServerText, {
				status: 503,
				headers: { "Content-Type": "text/html" },
			}),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signup"),
		).rejects.toSatisfy((err: unknown) => {
			if (!(err instanceof Error)) return false;
			return !err.message.includes(rawServerText);
		});
	});

	it("uses the JSON error field when the API returns a structured JSON error", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ error: "Email address is not allowed." }),
				{
					status: 422,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signin"),
		).rejects.toThrow("Email address is not allowed.");
	});

	it("resolves without error when the API returns a success response", async () => {
		mockFetch.mockResolvedValue(
			new Response(null, { status: 200 }),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signin"),
		).resolves.toBeUndefined();
	});
});
