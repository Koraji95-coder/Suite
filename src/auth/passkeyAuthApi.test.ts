import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completePasskeySignInVerification } from "@/auth/passkeyAuthApi";

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getSession: vi.fn(async () => ({
				data: { session: null },
				error: null,
			})),
		},
	},
}));

const mockFetch = vi.fn();

describe("passkeyAuthApi", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("includes next-step guidance when passkey sign-in verification fails", async () => {
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					error: "Passkey credential was not recognized by this Suite environment.",
					next_step:
						"If you reset local Supabase or switched environments, sign in with an email link and enroll this passkey again from Settings.",
				}),
				{
					status: 401,
					headers: {
						"Content-Type": "application/json",
					},
				},
			),
		);

		await expect(
			completePasskeySignInVerification({
				state: "state-1",
				credential: { id: "credential-1" } as AuthenticationResponseJSON,
				redirectTo: "/login",
			}),
		).rejects.toThrow(
			"Passkey credential was not recognized by this Suite environment. If you reset local Supabase or switched environments, sign in with an email link and enroll this passkey again from Settings.",
		);
	});
});
