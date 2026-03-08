#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const envFilePath = path.join(repoRoot, ".env");

function printHelp() {
	console.log(
		[
			"Generate a one-time Supabase magic link without sending email.",
			"",
			"Usage:",
			"  node scripts/generate-auth-magiclink.mjs --email <address> [options]",
			"",
			"Options:",
			"  --email <address>       Required target user email.",
			"  --redirect <url>        Redirect URL after verify.",
			"                          Default: http://localhost:5173/login",
			"  --help, -h              Show this help.",
			"",
			"Required env (.env or process env):",
			"  SUPABASE_URL",
			"  SUPABASE_SERVICE_ROLE_KEY",
		].join("\n"),
	);
}

function parseArgs(argv) {
	const options = {
		email: "",
		redirect: "http://localhost:5173/login",
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		if (arg === "--email") {
			options.email = String(argv[i + 1] || "").trim();
			i += 1;
			continue;
		}
		if (arg === "--redirect") {
			options.redirect = String(argv[i + 1] || "").trim();
			i += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!options.email) {
		throw new Error("Missing required --email argument.");
	}

	return options;
}

function assertAbsoluteHttpUrl(rawValue, flagName) {
	const value = String(rawValue || "").trim();
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${flagName} must be an absolute URL. Received: ${rawValue}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`${flagName} must use http or https. Received: ${rawValue}`);
	}
	return parsed.toString();
}

function parseDotEnv(filePath) {
	if (!fs.existsSync(filePath)) return {};
	const out = {};
	for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const splitAt = line.indexOf("=");
		if (splitAt <= 0) continue;
		const key = line.slice(0, splitAt).trim();
		const value = line.slice(splitAt + 1).trim();
		if (!key) continue;
		out[key] = value;
	}
	return out;
}

function readSetting(dotEnv, key) {
	const fromProcess = String(process.env[key] || "").trim();
	if (fromProcess) return fromProcess;
	return String(dotEnv[key] || "").trim();
}

async function generateMagicLink() {
	const options = parseArgs(process.argv.slice(2));
	const redirectUrl = assertAbsoluteHttpUrl(options.redirect, "--redirect");
	const dotEnv = parseDotEnv(envFilePath);
	const supabaseUrl = readSetting(dotEnv, "SUPABASE_URL").replace(/\/+$/, "");
	const serviceRole = readSetting(dotEnv, "SUPABASE_SERVICE_ROLE_KEY");

	if (!supabaseUrl) {
		throw new Error("SUPABASE_URL is required.");
	}
	if (!serviceRole) {
		throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
	}

	const endpoint = new URL(`${supabaseUrl}/auth/v1/admin/generate_link`);
	endpoint.searchParams.set("redirect_to", redirectUrl);

	const response = await fetch(endpoint.toString(), {
		method: "POST",
		headers: {
			apikey: serviceRole,
			Authorization: `Bearer ${serviceRole}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			type: "magiclink",
			email: options.email,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Supabase admin generate_link failed (${response.status}): ${body.slice(0, 500)}`,
		);
	}

	const payload = await response.json();
	const actionLink = String(payload.action_link || "").trim();
	if (!actionLink) {
		throw new Error("Supabase response did not include action_link.");
	}

	console.log("Magic link generated.");
	console.log(`email: ${options.email}`);
	console.log(`redirect: ${redirectUrl}`);
	console.log("");
	console.log(actionLink);
	console.log("");

	try {
		const parsedActionLink = new URL(actionLink);
		const encodedRedirect = parsedActionLink.searchParams.get("redirect_to") || "";
		if (encodedRedirect) {
			const decodedRedirect = decodeURIComponent(encodedRedirect);
			console.log(`decoded_redirect_to: ${decodedRedirect}`);
			console.log("");
		}
	} catch {
		// best-effort diagnostics only
	}

	console.log(
		"This link is sensitive and one-time use. Open it in the same browser profile you use for Suite.",
	);
}

generateMagicLink().catch((error) => {
	console.error(`generate-auth-magiclink failed: ${error.message}`);
	process.exit(1);
});
