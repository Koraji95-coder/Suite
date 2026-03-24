import { beforeAll, describe, expect, it } from "vitest";

let buildLocalSupabaseActiveEntries: (options: {
	apiUrl: string;
	anonKey: string;
	serviceRoleKey?: string;
	jwtSecret?: string;
	adminEmail?: string;
	adminEmails?: string;
}) => Array<[string, string]>;
let resolveDefaultLocalEmailMode: (
	envMap: Record<string, string | undefined>,
) => string;
let resolveLocalEmailConfig: (
	envMap: Record<string, string | undefined>,
	requestedMode?: string,
	options?: { strict?: boolean; useLocalOverrides?: boolean },
) => {
	mode: string;
	smtp: {
		host: string;
		port: string;
		user: string;
		pass: string;
		adminEmail: string;
		senderName: string;
	};
	warnings: string[];
};

beforeAll(async () => {
	// @ts-ignore - local script helper is authored as JS and exercised directly in tests.
	const module = await import("../../scripts/lib/supabase-local-mode.mjs");
	buildLocalSupabaseActiveEntries = module.buildLocalSupabaseActiveEntries;
	resolveDefaultLocalEmailMode = module.resolveDefaultLocalEmailMode;
	resolveLocalEmailConfig = module.resolveLocalEmailConfig;
});

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

	it("normalizes spaced gmail app passwords before writing local smtp config", () => {
		const config = resolveLocalEmailConfig(
			{
				GMAIL_SMTP_USER: "suite@example.com",
				GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop",
			},
			"gmail",
			{ strict: true },
		);

		expect(config.mode).toBe("gmail");
		expect(config.smtp.pass).toBe("abcdefghijklmnop");
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
