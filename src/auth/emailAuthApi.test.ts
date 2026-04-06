import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailAuthLink } from "@/auth/emailAuthApi";

vi.mock("@/lib/logger", () => ({
	logger: {
		warn: vi.fn(),
	},
}));

vi.mock("@/auth/authRedirect", () => ({
	resolveAuthRedirect: (path: string) => path,
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

	it("uses a static message when the error response is not JSON", async () => {
		mockFetch.mockResolvedValue(
			new Response("Internal server error: stack trace details", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			}),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signin"),
		).rejects.toThrow("Unable to send email link right now. Please try again.");
	});

	it("uses the JSON error field when the error response is JSON", async () => {
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid email address." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
		);

		await expect(
			requestEmailAuthLink("bad-email", "signin"),
		).rejects.toThrow("Invalid email address.");
	});

	it("resolves without error on a successful response", async () => {
		mockFetch.mockResolvedValue(
			new Response(null, { status: 200 }),
		);

		await expect(
			requestEmailAuthLink("user@example.com", "signup"),
		).resolves.toBeUndefined();
	});
});
