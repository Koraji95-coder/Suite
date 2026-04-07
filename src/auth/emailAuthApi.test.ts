import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailAuthLink } from "@/auth/emailAuthApi";

vi.mock("@/auth/authRedirect", () => ({
	resolveAuthRedirect: vi.fn((path: string) => `http://localhost${path}`),
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		warn: vi.fn(),
	},
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

	it("resolves successfully on an OK response", async () => {
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
		await expect(
			requestEmailAuthLink("dev@company.example", "signin"),
		).resolves.toBeUndefined();
	});

	it("throws a static error message on non-OK JSON response with error field", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ error: "Internal Server Error: stack trace here" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		await expect(
			requestEmailAuthLink("dev@company.example", "signin"),
		).rejects.toThrow(
			"Unable to send email link right now. Please try again.",
		);
	});

	it("throws a static error message on non-OK response with raw text body", async () => {
		mockFetch.mockResolvedValue(
			new Response("Traceback (most recent call last):\n  File ...", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			}),
		);
		await expect(
			requestEmailAuthLink("dev@company.example", "signin"),
		).rejects.toThrow(
			"Unable to send email link right now. Please try again.",
		);
	});

	it("throws a static error message on 400 response with structured error", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ message: "Rate limit exceeded" }),
				{
					status: 429,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		await expect(
			requestEmailAuthLink("dev@company.example", "signup"),
		).rejects.toThrow(
			"Unable to send email link right now. Please try again.",
		);
	});
});
