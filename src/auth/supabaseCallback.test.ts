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
		expect(isAllowedSupabaseCallbackPath("/app/home")).toBe(false);
		expect(isAllowedSupabaseCallbackPath("/app/legacy-route")).toBe(false);
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
			"?flow=signup&access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&context=verify",
		);
		expect(stripped).toBe("?flow=signup&context=verify");
	});

	it("removes Supabase auth params from hash route payload and keeps app params", () => {
		const stripped = stripSupabaseAuthParamsFromHash(
			"#/login?access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&flow=signup&context=verify",
		);
		expect(stripped).toBe("#/login?flow=signup&context=verify");
	});

	it("sanitizes current URL in place", () => {
		window.history.replaceState(
			{},
			"",
			"/login?flow=signup&access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer#context=verify&access_token=abc",
		);

		const changed = sanitizeSupabaseCallbackUrlInPlace();

		expect(changed).toBe(true);
		expect(window.location.pathname).toBe("/login");
		expect(window.location.search).toBe("?flow=signup");
		expect(window.location.hash).toBe("#context=verify");
	});
});
