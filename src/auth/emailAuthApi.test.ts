import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailAuthLink } from "@/auth/emailAuthApi";

vi.mock("@/auth/authRedirect", () => ({
	resolveAuthRedirect: vi.fn(() => undefined),
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

	it("resolves when the server returns a 2xx response", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					ok: true,
					message: "If the email is eligible, a link has been sent.",
				}),
				{ status: 202 },
			),
		);

		await expect(
			requestEmailAuthLink("dev@example.com", "signin"),
		).resolves.toBeUndefined();
	});

	it("throws static fallback message when the server returns a non-JSON error body", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				"Internal Server Error\nTraceback (most recent call last):\n  File ...",
				{
					status: 500,
					headers: { "Content-Type": "text/plain" },
				},
			),
		);

		await expect(
			requestEmailAuthLink("dev@example.com", "signin"),
		).rejects.toThrow("Unable to send email link right now. Please try again.");
	});

	it("throws static fallback message when the server returns an empty non-JSON body", async () => {
		mockFetch.mockResolvedValue(
			new Response("", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			}),
		);

		await expect(
			requestEmailAuthLink("dev@example.com", "signin"),
		).rejects.toThrow("Unable to send email link right now. Please try again.");
	});

	it("uses server-provided JSON error field when present", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ error: "Enter a valid email address." }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		await expect(
			requestEmailAuthLink("bad-email", "signin"),
		).rejects.toThrow("Enter a valid email address.");
	});

	it("uses server-provided JSON message field when error field is absent", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({ message: "Invalid flow. Use signin or signup." }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		await expect(
			requestEmailAuthLink("dev@example.com", "signin"),
		).rejects.toThrow("Invalid flow. Use signin or signup.");
	});

	it("falls back to static message when server JSON contains no error or message", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ ok: false }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
		);

		await expect(
			requestEmailAuthLink("dev@example.com", "signin"),
		).rejects.toThrow("Unable to send email link right now. Please try again.");
	});
});
