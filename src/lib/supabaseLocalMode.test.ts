import { describe, expect, it } from "vitest";
import {
	buildLocalSupabaseActiveEntries,
	resolveDefaultLocalEmailMode,
	resolveLocalEmailConfig,
} from "../../scripts/lib/supabase-local-mode.mjs";

describe("supabase local mode helpers", () => {
	it("prefers gmail as the default local email mode when gmail creds exist", () => {
		expect(
			resolveDefaultLocalEmailMode({
				GMAIL_SMTP_USER: "suite@example.com",
				GMAIL_SMTP_APP_PASSWORD: "app-password",
			}),
		).toBe("gmail");
	});

	it("falls back to mailpit when gmail credentials are missing", () => {
		const config = resolveLocalEmailConfig({}, "gmail", { strict: false });
		expect(config.mode).toBe("mailpit");
		expect(config.warnings.length).toBeGreaterThan(0);
		expect(config.smtp.host).toBe("inbucket");
		expect(config.smtp.port).toBe("2500");
	});

	it("writes local target overrides that disable turnstile and switch auth to local", () => {
		const entries = Object.fromEntries(
			buildLocalSupabaseActiveEntries({
				apiUrl: "http://127.0.0.1:54321",
				anonKey: "anon-key",
				serviceRoleKey: "service-role-key",
				jwtSecret: "jwt-secret",
			}),
		);

		expect(entries.SUITE_SUPABASE_MODE).toBe("local");
		expect(entries.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
		expect(entries.AUTH_EMAIL_REQUIRE_TURNSTILE).toBe("false");
		expect(entries.VITE_TURNSTILE_SITE_KEY).toBe("");
		expect(entries.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key");
	});
});
