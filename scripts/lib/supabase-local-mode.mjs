#!/usr/bin/env node

export const ACTIVE_LOCAL_SUPABASE_KEYS = new Set([
	"SUITE_SUPABASE_MODE",
	"VITE_SUPABASE_URL",
	"VITE_SUPABASE_ANON_KEY",
	"VITE_TURNSTILE_SITE_KEY",
	"SUPABASE_URL",
	"SUPABASE_ANON_KEY",
	"SUPABASE_SERVICE_ROLE_KEY",
	"SUPABASE_JWT_SECRET",
	"AUTH_EMAIL_TURNSTILE_SECRET",
	"AUTH_EMAIL_REQUIRE_TURNSTILE",
	"VITE_DEV_ADMIN_SOURCE",
	"VITE_DEV_ADMIN_EMAIL",
	"VITE_DEV_ADMIN_EMAILS",
]);

export const LOCAL_SUPABASE_SMTP_KEYS = new Set([
	"SUITE_SUPABASE_LOCAL_EMAIL_MODE",
	"SUPABASE_LOCAL_SMTP_HOST",
	"SUPABASE_LOCAL_SMTP_PORT",
	"SUPABASE_LOCAL_SMTP_USER",
	"SUPABASE_LOCAL_SMTP_PASS",
	"SUPABASE_LOCAL_SMTP_ADMIN_EMAIL",
	"SUPABASE_LOCAL_SMTP_SENDER_NAME",
]);

export function normalizeLocalEmailMode(value, fallback = "") {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "gmail" || normalized === "mailpit") {
		return normalized;
	}
	return fallback;
}

export function readFirstValue(envMap, keys = []) {
	for (const key of keys) {
		const value = String(envMap?.[key] || "").trim();
		if (value) return value;
	}
	return "";
}

export function buildMailpitSmtpValues() {
	return {
		host: "inbucket",
		port: "2500",
		user: "",
		pass: "",
		adminEmail: "admin@email.com",
		senderName: "Suite",
	};
}

export function buildGmailSmtpValues(
	envMap,
	{ useLocalOverrides = true } = {},
) {
	const localValue = (key) =>
		useLocalOverrides ? String(envMap?.[key] || "").trim() : "";

	const user =
		localValue("SUPABASE_LOCAL_SMTP_USER") ||
		readFirstValue(envMap, ["SUPABASE_SMTP_USER", "GMAIL_SMTP_USER"]);
	const pass =
		localValue("SUPABASE_LOCAL_SMTP_PASS") ||
		readFirstValue(envMap, ["SUPABASE_SMTP_PASS", "GMAIL_SMTP_APP_PASSWORD"]);
	const adminEmail =
		localValue("SUPABASE_LOCAL_SMTP_ADMIN_EMAIL") ||
		readFirstValue(envMap, [
			"SUPABASE_SMTP_SENDER_EMAIL",
			"SUPABASE_SMTP_USER",
			"GMAIL_SMTP_USER",
		]) ||
		user;

	return {
		host:
			localValue("SUPABASE_LOCAL_SMTP_HOST") ||
			readFirstValue(envMap, ["SUPABASE_SMTP_HOST"]) ||
			"smtp.gmail.com",
		port:
			localValue("SUPABASE_LOCAL_SMTP_PORT") ||
			readFirstValue(envMap, ["SUPABASE_SMTP_PORT"]) ||
			"465",
		user,
		pass,
		adminEmail,
		senderName:
			localValue("SUPABASE_LOCAL_SMTP_SENDER_NAME") ||
			readFirstValue(envMap, ["SUPABASE_SMTP_SENDER_NAME"]) ||
			"Suite",
	};
}

export function hasUsableGmailSmtpCredentials(envMap) {
	const smtp = buildGmailSmtpValues(envMap, { useLocalOverrides: false });
	return Boolean(
		smtp.host &&
			smtp.port &&
			smtp.user &&
			smtp.pass &&
			smtp.adminEmail &&
			smtp.senderName,
	);
}

export function resolveDefaultLocalEmailMode(envMap) {
	return hasUsableGmailSmtpCredentials(envMap) ? "gmail" : "mailpit";
}

export function resolveLocalEmailConfig(
	envMap,
	requestedMode = "",
	{ strict = false, useLocalOverrides = true } = {},
) {
	const currentMode =
		normalizeLocalEmailMode(requestedMode) ||
		normalizeLocalEmailMode(envMap?.SUITE_SUPABASE_LOCAL_EMAIL_MODE) ||
		resolveDefaultLocalEmailMode(envMap);

	if (currentMode !== "gmail") {
		return {
			mode: "mailpit",
			smtp: buildMailpitSmtpValues(),
			warnings: [],
		};
	}

	const smtp = buildGmailSmtpValues(envMap, { useLocalOverrides });
	const missing = [];
	if (!smtp.user) missing.push("SUPABASE_SMTP_USER or GMAIL_SMTP_USER");
	if (!smtp.pass) {
		missing.push("SUPABASE_SMTP_PASS or GMAIL_SMTP_APP_PASSWORD");
	}

	if (missing.length > 0) {
		const message = `Local Gmail SMTP requires ${missing.join(", ")}.`;
		if (strict) {
			throw new Error(message);
		}
		return {
			mode: "mailpit",
			smtp: buildMailpitSmtpValues(),
			warnings: [message, "Falling back to Mailpit for local auth email delivery."],
		};
	}

	return {
		mode: "gmail",
		smtp,
		warnings: [],
	};
}

export function buildLocalSmtpEntries(config) {
	return [
		["SUITE_SUPABASE_LOCAL_EMAIL_MODE", config.mode],
		["SUPABASE_LOCAL_SMTP_HOST", config.smtp.host],
		["SUPABASE_LOCAL_SMTP_PORT", config.smtp.port],
		["SUPABASE_LOCAL_SMTP_USER", config.smtp.user],
		["SUPABASE_LOCAL_SMTP_PASS", config.smtp.pass],
		["SUPABASE_LOCAL_SMTP_ADMIN_EMAIL", config.smtp.adminEmail],
		["SUPABASE_LOCAL_SMTP_SENDER_NAME", config.smtp.senderName],
	];
}

export function buildLocalSupabaseActiveEntries({
	apiUrl,
	anonKey,
	serviceRoleKey = "",
	jwtSecret = "",
	adminEmail = "",
	adminEmails = "",
}) {
	const entries = [
		["SUITE_SUPABASE_MODE", "local"],
		["VITE_SUPABASE_URL", apiUrl],
		["VITE_SUPABASE_ANON_KEY", anonKey],
		["VITE_TURNSTILE_SITE_KEY", ""],
		["SUPABASE_URL", apiUrl],
		["SUPABASE_ANON_KEY", anonKey],
		["VITE_DEV_ADMIN_SOURCE", "hybrid"],
		["AUTH_EMAIL_TURNSTILE_SECRET", ""],
		["AUTH_EMAIL_REQUIRE_TURNSTILE", "false"],
	];

	if (serviceRoleKey) {
		entries.push(["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey]);
	}
	if (jwtSecret) {
		entries.push(["SUPABASE_JWT_SECRET", jwtSecret]);
	}
	if (adminEmail) {
		entries.push(["VITE_DEV_ADMIN_EMAIL", adminEmail]);
	}
	if (adminEmails) {
		entries.push(["VITE_DEV_ADMIN_EMAILS", adminEmails]);
	}

	return entries;
}

export function collectPreservedLocalEntries(existingLocalEnv, keysToExclude) {
	return Object.entries(existingLocalEnv || {})
		.filter(([key]) => !keysToExclude.has(key))
		.sort(([left], [right]) => left.localeCompare(right));
}
