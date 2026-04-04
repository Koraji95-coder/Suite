#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv, readSetting } from "./lib/env-files.mjs";

const repoRoot = process.cwd();
const SUPABASE_AUTH_STORAGE_PREFIX = "suite-auth";

function normalizeSupabaseStorageScope(supabaseUrl) {
	const rawValue = String(supabaseUrl || "").trim();
	if (!rawValue) {
		return "default";
	}

	try {
		const parsed = new URL(rawValue);
		const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
		return `${parsed.origin}${normalizedPath}`;
	} catch {
		return rawValue;
	}
}

function createDeterministicHash(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildSupabaseAuthStorageKey(supabaseUrl) {
	const scope = normalizeSupabaseStorageScope(supabaseUrl);
	return `${SUPABASE_AUTH_STORAGE_PREFIX}:${createDeterministicHash(scope)}`;
}

function parseArgs(argv) {
	const options = {
		origins: [],
		outputPath: path.join("output", "playwright", "auth-state.json"),
		emailPrefix: "codex.playwright",
		displayName: "Playwright User",
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--origin" || arg === "-o") {
			const next = argv[i + 1];
			if (!next) throw new Error("Missing value for --origin");
			options.origins.push(next);
			i += 1;
			continue;
		}
		if (arg === "--out") {
			const next = argv[i + 1];
			if (!next) throw new Error("Missing value for --out");
			options.outputPath = next;
			i += 1;
			continue;
		}
		if (arg === "--email-prefix") {
			const next = argv[i + 1];
			if (!next) throw new Error("Missing value for --email-prefix");
			options.emailPrefix = next;
			i += 1;
			continue;
		}
		if (arg === "--display-name") {
			const next = argv[i + 1];
			if (!next) throw new Error("Missing value for --display-name");
			options.displayName = next;
			i += 1;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function printHelp() {
	console.log(
		[
			"Bootstrap Playwright auth storage state for protected Suite routes.",
			"",
			"Usage:",
			"  node scripts/bootstrap-playwright-auth-state.mjs [options]",
			"",
			"Options:",
			"  --origin, -o <url>      App origin to store session under (repeatable).",
			"                          Defaults: Playwright base URL origin(s) plus Vite dev defaults.",
			"  --out <path>            Output storage-state path.",
			"                          Default: output/playwright/auth-state.json",
			"  --email-prefix <prefix> Prefix for temp user email local-part.",
			"                          Default: codex.playwright",
			"  --display-name <name>   Display name stored in auth metadata.",
			"                          Default: Playwright User",
			"",
			"Required env (.env/.env.local or process env):",
			"  SUPABASE_URL",
			"  SUPABASE_SERVICE_ROLE_KEY",
			"  SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)",
		].join("\n"),
	);
}

function resolveDefaultOrigins() {
	const defaults = [];
	const seen = new Set();
	const addOrigin = (value) => {
		const trimmed = String(value || "")
			.trim()
			.replace(/\/+$/, "");
		if (!trimmed || seen.has(trimmed)) return;
		seen.add(trimmed);
		defaults.push(trimmed);
	};

	const playwrightBaseUrl = String(
		process.env.PLAYWRIGHT_BASE_URL || "",
	).trim();
	if (playwrightBaseUrl) {
		try {
			const parsed = new URL(playwrightBaseUrl);
			addOrigin(`${parsed.protocol}//${parsed.host}`);
		} catch {
			// Ignore invalid override and fall through to deterministic defaults.
		}
	}

	const playwrightPort = Number.parseInt(
		String(process.env.PLAYWRIGHT_PORT || "4173"),
		10,
	);
	const resolvedPlaywrightPort = Number.isFinite(playwrightPort)
		? playwrightPort
		: 4173;
	addOrigin(`http://localhost:${resolvedPlaywrightPort}`);
	addOrigin(`http://127.0.0.1:${resolvedPlaywrightPort}`);

	if (resolvedPlaywrightPort !== 5173) {
		addOrigin("http://localhost:5173");
		addOrigin("http://127.0.0.1:5173");
	}

	return defaults;
}

function normalizeOrigins(values) {
	const fallback = resolveDefaultOrigins();
	const source = values.length > 0 ? values : fallback;
	const seen = new Set();
	const out = [];
	for (const raw of source) {
		const value = raw.trim().replace(/\/+$/, "");
		if (!value) continue;
		let parsed;
		try {
			parsed = new URL(value);
		} catch {
			throw new Error(`Invalid --origin URL: ${raw}`);
		}
		if (!parsed.protocol.startsWith("http")) {
			throw new Error(`Origin must be http/https: ${raw}`);
		}
		const normalized = `${parsed.protocol}//${parsed.host}`;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	if (out.length === 0) {
		throw new Error("No valid origins resolved.");
	}
	return out;
}

async function requestJson(url, init, expected = [200]) {
	const response = await fetch(url, init);
	if (!expected.includes(response.status)) {
		const body = await response.text();
		throw new Error(
			`HTTP ${response.status} from ${url}: ${body.slice(0, 400)}`,
		);
	}
	return response.json();
}

function extractSession(payload) {
	if (payload && typeof payload === "object") {
		if (payload.session && typeof payload.session === "object") {
			return payload.session;
		}
		if (typeof payload.access_token === "string") {
			return payload;
		}
	}
	return null;
}

async function bootstrap() {
	const args = parseArgs(process.argv.slice(2));
	const dotEnv = loadRepoEnv(repoRoot);
	const origins = normalizeOrigins(args.origins);
	const displayName =
		String(args.displayName || "").trim() || "Playwright User";

	const supabaseUrl = readSetting(dotEnv, "SUPABASE_URL");
	const serviceRoleKey = readSetting(dotEnv, "SUPABASE_SERVICE_ROLE_KEY");
	const anonKey =
		readSetting(dotEnv, "SUPABASE_ANON_KEY") ||
		readSetting(dotEnv, "VITE_SUPABASE_ANON_KEY");

	if (!supabaseUrl) {
		throw new Error("SUPABASE_URL is required.");
	}
	if (!serviceRoleKey) {
		throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
	}
	if (!anonKey) {
		throw new Error("SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required.");
	}

	const baseUrl = supabaseUrl.replace(/\/+$/, "");
	const randomSuffix = `${Date.now()}${crypto.randomInt(10_000)}`;
	const safePrefix = args.emailPrefix
		.replace(/[^a-zA-Z0-9._-]/g, "")
		.toLowerCase();
	const email = `${safePrefix}.${randomSuffix}@example.com`;
	const password = `Tmp!${crypto.randomBytes(10).toString("hex")}`;

	const adminHeaders = {
		apikey: serviceRoleKey,
		Authorization: `Bearer ${serviceRoleKey}`,
		"Content-Type": "application/json",
	};

	await requestJson(
		`${baseUrl}/auth/v1/admin/users`,
		{
			method: "POST",
			headers: adminHeaders,
			body: JSON.stringify({
				email,
				password,
				email_confirm: true,
				user_metadata: {
					display_name: displayName,
					full_name: displayName,
					provisioned_by: "playwright-auth-bootstrap",
				},
			}),
		},
		[200, 201],
	);

	const linkEndpoint = new URL(`${baseUrl}/auth/v1/admin/generate_link`);
	linkEndpoint.searchParams.set("redirect_to", `${origins[0]}/login`);

	const linkResult = await requestJson(
		linkEndpoint.toString(),
		{
			method: "POST",
			headers: adminHeaders,
			body: JSON.stringify({
				type: "magiclink",
				email,
			}),
		},
		[200, 201],
	);

	const tokenHash = String(linkResult?.hashed_token || "").trim();
	const verifyType = String(
		linkResult?.verification_type || "magiclink",
	).trim();
	if (!tokenHash) {
		throw new Error(
			"Supabase generate_link response did not include hashed_token.",
		);
	}

	const verifyPayload = await requestJson(
		`${baseUrl}/auth/v1/verify`,
		{
			method: "POST",
			headers: {
				apikey: anonKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: verifyType,
				token_hash: tokenHash,
			}),
		},
		[200],
	);

	const session = extractSession(verifyPayload);
	if (!session) {
		throw new Error(
			"Unable to extract session payload from Supabase verify response.",
		);
	}

	const storageKey = buildSupabaseAuthStorageKey(supabaseUrl);
	const sessionJson = JSON.stringify(session);
	const state = {
		cookies: [],
		origins: origins.map((origin) => ({
			origin,
			localStorage: [{ name: storageKey, value: sessionJson }],
		})),
	};

	const outputPath = path.isAbsolute(args.outputPath)
		? args.outputPath
		: path.join(repoRoot, args.outputPath);
	const outputDir = path.dirname(outputPath);
	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(state, null, 2), "utf8");

	const metaPath = path.join(outputDir, "auth-state.meta.json");
	fs.writeFileSync(
		metaPath,
		JSON.stringify(
			{
				created_at: new Date().toISOString(),
				display_name: displayName,
				email,
				origins,
				storage_key: storageKey,
				notes: "Session token omitted from metadata. See auth-state.json.",
			},
			null,
			2,
		),
		"utf8",
	);

	console.log("Playwright auth state generated.");
	console.log(`- state: ${path.relative(repoRoot, outputPath)}`);
	console.log(`- meta:  ${path.relative(repoRoot, metaPath)}`);
	console.log(`- email: ${email}`);
	console.log(`- display name: ${displayName}`);
	console.log(`- origins: ${origins.join(", ")}`);
	console.log("");
	console.log("Use with Playwright CLI:");
	console.log(
		`npx --yes --package @playwright/cli playwright-cli state-load ${path.relative(repoRoot, outputPath)}`,
	);
}

bootstrap().catch((error) => {
	console.error(`bootstrap-playwright-auth-state failed: ${error.message}`);
	process.exit(1);
});
