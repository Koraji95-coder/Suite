import {
	hasSupabaseSessionCallbackParams,
	isAllowedSupabaseCallbackPath,
	sanitizeSupabaseCallbackUrlInPlace,
	shouldDetectSupabaseSessionInUrl,
	stripSupabaseAuthParamsFromHash,
	stripSupabaseAuthParamsFromSearch,
} from "@/auth/supabaseCallback";
import { beforeEach, describe, expect, it } from "vitest";

const VALID_PARAMS = {
	access_token: "access-token",
	refresh_token: "refresh-token",
	token_type: "bearer",
	expires_in: "3600",
	expires_at: "1773000000",
};

describe("supabaseCallback", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.history.replaceState({}, "", "/login");
	});

	it("accepts only known callback paths", () => {
		expect(isAllowedSupabaseCallbackPath("/login")).toBe(true);
		expect(isAllowedSupabaseCallbackPath("/signup")).toBe(true);
		expect(isAllowedSupabaseCallbackPath("/agent/pairing-callback")).toBe(true);
		expect(isAllowedSupabaseCallbackPath("/app/agent/pairing-callback")).toBe(
			true,
		);
		expect(isAllowedSupabaseCallbackPath("/app/agent")).toBe(false);
	});

	it("requires canonical Supabase session params", () => {
		expect(hasSupabaseSessionCallbackParams(VALID_PARAMS)).toBe(true);
		expect(
			hasSupabaseSessionCallbackParams({
				access_token: "access-token",
				refresh_token: "refresh-token",
				token_type: "bearer",
			}),
		).toBe(false);
	});

	it("suppresses duplicate callback detection in the same tab", () => {
		const url = new URL("http://localhost:5173/login");
		expect(shouldDetectSupabaseSessionInUrl(url, VALID_PARAMS)).toBe(true);
		expect(shouldDetectSupabaseSessionInUrl(url, VALID_PARAMS)).toBe(false);
	});

	it("removes Supabase auth params from search and keeps app params", () => {
		const stripped = stripSupabaseAuthParamsFromSearch(
			"?agent_action=pair&access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&agent_challenge=xyz",
		);
		expect(stripped).toBe("?agent_action=pair&agent_challenge=xyz");
	});

	it("removes Supabase auth params from hash route payload and keeps pairing params", () => {
		const stripped = stripSupabaseAuthParamsFromHash(
			"#/login?access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&agent_action=pair&agent_challenge=xyz",
		);
		expect(stripped).toBe("#/login?agent_action=pair&agent_challenge=xyz");
	});

	it("sanitizes current URL in place", () => {
		window.history.replaceState(
			{},
			"",
			"/agent/pairing-callback?agent_action=pair&access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer#agent_challenge=xyz&access_token=abc",
		);

		const changed = sanitizeSupabaseCallbackUrlInPlace();

		expect(changed).toBe(true);
		expect(window.location.pathname).toBe("/agent/pairing-callback");
		expect(window.location.search).toBe("?agent_action=pair");
		expect(window.location.hash).toBe("#agent_challenge=xyz");
	});
});
