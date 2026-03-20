import {
	buildSupabaseAuthStorageKey,
	cleanupLegacySupabaseAuthStorage,
	SUPABASE_LEGACY_AUTH_STORAGE_KEY,
} from "@/supabase/authStorage";
import { beforeEach, describe, expect, it } from "vitest";

describe("authStorage", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("builds a stable storage key for the same Supabase project URL", () => {
		const hostedKey = buildSupabaseAuthStorageKey(
			"https://pexuedwhofspygsplwop.supabase.co/",
		);
		const sameHostedKey = buildSupabaseAuthStorageKey(
			"https://pexuedwhofspygsplwop.supabase.co",
		);
		const localKey = buildSupabaseAuthStorageKey("http://127.0.0.1:54321");

		expect(hostedKey).toBe(sameHostedKey);
		expect(hostedKey).not.toBe(localKey);
	});

	it("removes the legacy shared auth key once env-scoped storage is in use", () => {
		const localKey = buildSupabaseAuthStorageKey("http://127.0.0.1:54321");
		window.localStorage.setItem(SUPABASE_LEGACY_AUTH_STORAGE_KEY, "legacy");
		window.localStorage.setItem(localKey, "local-session");

		cleanupLegacySupabaseAuthStorage(localKey);

		expect(window.localStorage.getItem(SUPABASE_LEGACY_AUTH_STORAGE_KEY)).toBe(
			null,
		);
		expect(window.localStorage.getItem(localKey)).toBe("local-session");
	});
});
