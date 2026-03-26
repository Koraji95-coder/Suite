#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadRepoEnv } from "./lib/env-files.mjs";

const DEFAULT_PROFILE_MODELS = {
	koro: "qwen3:14b",
	devstral: "devstral-small-2:latest",
	sentinel: "gemma3:12b",
	forge: "qwen2.5-coder:14b",
	draftsmith: "joshuaokolo/C3Dv0:latest",
	gridsage: "ALIENTELLIGENCE/electricalengineerv2:latest",
};

function envString(env, key, fallback = "") {
	return String(env?.[key] || fallback).trim();
}

function envFlag(env, key, fallback = false) {
	const value = envString(env, key, fallback ? "true" : "false");
	return /^(1|true|yes|on)$/i.test(value);
}

function envInt(env, key, fallback) {
	const rawValue = envString(env, key, String(fallback));
	const parsed = Number.parseInt(rawValue, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function csvList(value) {
	return String(value || "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function nowIso(now = Date.now()) {
	return new Date(now).toISOString();
}

function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}

function createJsonResponse(res, statusCode, payload, headers = {}) {
	const body = JSON.stringify(payload);
	res.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		...headers,
	});
	res.end(body);
}

function createErrorPayload(message, extras = {}) {
	return {
		error: String(message || "Request failed."),
		...extras,
	};
}

function parseBoolish(value, fallback = false) {
	if (typeof value === "boolean") return value;
	const normalized = String(value || "").trim();
	if (!normalized) return fallback;
	return /^(1|true|yes|on)$/i.test(normalized);
}

function normalizeSuitePasskeyIntent(rawValue) {
	const normalized = String(rawValue || "").trim().toLowerCase();
	if (["sign-in", "signin", "sign_in"].includes(normalized)) {
		return "sign-in";
	}
	if (["enroll", "enrollment"].includes(normalized)) {
		return "enroll";
	}
	return "";
}

function normalizeSuitePasskeyStatus(rawValue) {
	const normalized = String(rawValue || "").trim().toLowerCase();
	if (["success", "ok"].includes(normalized)) {
		return "success";
	}
	if (["failed", "failure", "error"].includes(normalized)) {
		return "failed";
	}
	return "";
}

function isValidSuitePasskeyState(state) {
	return /^[A-Za-z0-9_-]{20,200}$/.test(String(state || "").trim());
}

function sanitizeSuitePasskeyField(rawValue, maxChars) {
	const normalized = String(rawValue || "")
		.replaceAll("\r", " ")
		.replaceAll("\n", " ")
		.trim();
	return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}

function isValidEmailLike(value) {
	const normalized = String(value || "").trim();
	if (!normalized || /\s/.test(normalized)) return false;
	const atIndex = normalized.indexOf("@");
	if (atIndex <= 0 || atIndex + 1 >= normalized.length) return false;
	return normalized.slice(atIndex + 1).includes(".");
}

function resolveNonEmptyEnv(env, keys) {
	for (const key of keys) {
		const value = envString(env, key);
		if (value) return value;
	}
	return "";
}

function normalizeUrlOrigin(candidate) {
	try {
		const parsed = new URL(candidate);
		if (!["http:", "https:"].includes(parsed.protocol)) return "";
		return parsed.origin;
	} catch {
		return "";
	}
}

function decodeBase64Url(value) {
	if (!value) return null;
	const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
	try {
		return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
	} catch {
		return null;
	}
}

function jsonClaimAsInt(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value.trim(), 10);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function jsonClaimAsString(value) {
	if (typeof value !== "string") return "";
	return value.trim();
}

function claimAudienceMatches(claims, expectedAudience) {
	if (!expectedAudience) return true;
	const audience = claims?.aud;
	if (typeof audience === "string") {
		return audience.trim() === expectedAudience;
	}
	if (Array.isArray(audience)) {
		return audience.some((entry) => typeof entry === "string" && entry.trim() === expectedAudience);
	}
	return false;
}

function createRedirectResponse(res, location) {
	res.writeHead(302, {
		Location: location,
		"Cache-Control": "no-store",
	});
	res.end();
}

function splitBufferBlocks(buffer, separatorPattern) {
	const blocks = [];
	let remaining = buffer;
	let match = remaining.match(separatorPattern);
	while (match && typeof match.index === "number") {
		const index = match.index;
		blocks.push(remaining.slice(0, index));
		remaining = remaining.slice(index + match[0].length);
		match = remaining.match(separatorPattern);
	}
	return { blocks, remaining };
}

function sha256(value) {
	return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function buildProfileCatalog(env) {
	return Object.fromEntries(
		Object.entries(DEFAULT_PROFILE_MODELS).map(([profileId, fallbackModel]) => {
			const key = `AGENT_MODEL_${profileId.toUpperCase()}_PRIMARY`;
			const value = envString(env, key, fallbackModel);
			return [
				profileId,
				{
					id: profileId,
					model: value || fallbackModel,
				},
			];
		}),
	);
}

function resolveProviderConfig(env) {
	const providerMode = envString(env, "SUITE_AGENT_PROVIDER_MODE", "local")
		.toLowerCase()
		.trim();
	const explicitProvider =
		envString(env, "ZEROCLAW_PROVIDER") ||
		envString(env, "ZEROCLAW_MODEL_PROVIDER") ||
		envString(env, "MODEL_PROVIDER") ||
		envString(env, "PROVIDER");
	const openRouterApiKey = envString(env, "OPENROUTER_API_KEY");
	const openAiApiKey = envString(env, "OPENAI_API_KEY");

	let selectedProvider = explicitProvider.toLowerCase();
	if (!["local", "auto", "config"].includes(providerMode)) {
		selectedProvider = selectedProvider || "ollama";
	} else if (providerMode === "local") {
		selectedProvider = "ollama";
	} else if (providerMode === "auto") {
		if (!selectedProvider) {
			selectedProvider = openRouterApiKey ? "openrouter" : "ollama";
		}
	}

	if (!selectedProvider) {
		selectedProvider = openAiApiKey ? "openai" : openRouterApiKey ? "openrouter" : "ollama";
	}

	let providerId = selectedProvider;
	let baseUrl = "";
	let apiKey = "";

	if (/^custom:/i.test(selectedProvider)) {
		providerId = "custom";
		baseUrl = selectedProvider.slice("custom:".length).trim();
		apiKey =
			envString(env, "MODEL_API_KEY") ||
			envString(env, "ZEROCLAW_API_KEY") ||
			envString(env, "OPENAI_API_KEY") ||
			envString(env, "OPENROUTER_API_KEY");
	} else if (/^https?:\/\//i.test(selectedProvider)) {
		providerId = "custom";
		baseUrl = selectedProvider;
		apiKey =
			envString(env, "MODEL_API_KEY") ||
			envString(env, "ZEROCLAW_API_KEY") ||
			envString(env, "OPENAI_API_KEY") ||
			envString(env, "OPENROUTER_API_KEY");
	} else if (selectedProvider === "openrouter") {
		baseUrl = envString(env, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
		apiKey = openRouterApiKey;
	} else if (selectedProvider === "openai") {
		baseUrl = envString(env, "OPENAI_BASE_URL", "https://api.openai.com/v1");
		apiKey = openAiApiKey;
	} else {
		providerId = "ollama";
		baseUrl =
			envString(env, "OLLAMA_BASE_URL") ||
			envString(env, "OLLAMA_HOST") ||
			"http://127.0.0.1:11434";
	}

	const defaultModel =
		envString(env, "ZEROCLAW_MODEL") ||
		envString(env, "MODEL") ||
		envString(env, "SUITE_LOCAL_AGENT_MODEL") ||
		DEFAULT_PROFILE_MODELS.devstral;

	return {
		mode: providerMode,
		providerId,
		baseUrl: baseUrl.replace(/\/+$/, ""),
		apiKey,
		defaultModel,
		openRouterSiteUrl: envString(env, "OPENROUTER_HTTP_REFERER"),
		openRouterSiteName: envString(env, "OPENROUTER_TITLE", "Suite"),
	};
}

function resolvePasskeyBridgeConfig(env) {
	const callbackAllowedOrigins = csvList(
		resolveNonEmptyEnv(env, [
			"ZC_SUITE_CALLBACK_ALLOWED_ORIGINS",
			"SUITE_CALLBACK_ALLOWED_ORIGINS",
			"AUTH_ALLOWED_REDIRECT_ORIGINS",
		]) || "http://localhost:5173,http://127.0.0.1:5173",
	)
		.map((entry) => normalizeUrlOrigin(entry))
		.filter(Boolean);

	return {
		callbackAllowedOrigins,
		callbackSigningSecret: resolveNonEmptyEnv(env, [
			"ZC_SUITE_PASSKEY_CALLBACK_SIGNING_SECRET",
			"AUTH_PASSKEY_CALLBACK_SIGNING_SECRET",
			"SUITE_PASSKEY_CALLBACK_SIGNING_SECRET",
		]),
		providerJwtSecret: resolveNonEmptyEnv(env, [
			"ZC_SUITE_PASSKEY_PROVIDER_JWT_SECRET",
			"SUITE_PASSKEY_PROVIDER_JWT_SECRET",
			"AUTH_PASSKEY_EXTERNAL_PROVIDER_JWT_SECRET",
		]),
		providerJwtIssuer: resolveNonEmptyEnv(env, [
			"ZC_SUITE_PASSKEY_PROVIDER_JWT_ISSUER",
			"SUITE_PASSKEY_PROVIDER_JWT_ISSUER",
			"AUTH_PASSKEY_EXTERNAL_PROVIDER_JWT_ISSUER",
		]),
		providerJwtAudience: resolveNonEmptyEnv(env, [
			"ZC_SUITE_PASSKEY_PROVIDER_JWT_AUDIENCE",
			"SUITE_PASSKEY_PROVIDER_JWT_AUDIENCE",
			"AUTH_PASSKEY_EXTERNAL_PROVIDER_JWT_AUDIENCE",
		]),
		providerJwtRequireExp: parseBoolish(
			resolveNonEmptyEnv(env, [
				"ZC_SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_EXP",
				"SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_EXP",
			]),
			true,
		),
		providerJwtRequireState: parseBoolish(
			resolveNonEmptyEnv(env, [
				"ZC_SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_STATE",
				"SUITE_PASSKEY_PROVIDER_JWT_REQUIRE_STATE",
			]),
			true,
		),
		providerJwtClockSkewSeconds: clamp(
			envInt(env, "ZC_SUITE_PASSKEY_PROVIDER_JWT_CLOCK_SKEW_SECONDS", 60),
			0,
			3600,
		),
		providerJwtRequired: parseBoolish(
			resolveNonEmptyEnv(env, [
				"ZC_SUITE_PASSKEY_PROVIDER_JWT_REQUIRED",
				"SUITE_PASSKEY_PROVIDER_JWT_REQUIRED",
			]),
			false,
		),
	};
}

function resolveGatewayConfig({ repoRoot, env }) {
	const host = envString(env, "AGENT_GATEWAY_HOST", "127.0.0.1");
	const port = envInt(env, "AGENT_GATEWAY_PORT", 3000);
	const pairingRequired = envFlag(env, "SUITE_GATEWAY_REQUIRE_PAIRING", true);
	const requireWebhookSecret =
		envFlag(env, "AGENT_REQUIRE_WEBHOOK_SECRET", false) ||
		envFlag(env, "VITE_AGENT_REQUIRE_WEBHOOK_SECRET", false);
	const webhookSecret =
		envString(env, "AGENT_WEBHOOK_SECRET") || envString(env, "VITE_AGENT_WEBHOOK_SECRET");
	const stateRoot =
		envString(env, "SUITE_GATEWAY_STATE_DIR") ||
		path.join(env.LOCALAPPDATA || env.TEMP || os.tmpdir(), "Suite", "agent-gateway");
	const stateFilePath = path.join(stateRoot, "state.json");
	return {
		repoRoot,
		host,
		port,
		pairingRequired,
		requireWebhookSecret,
		webhookSecret,
		corsOrigins: csvList(
			envString(env, "ZEROCLAW_GATEWAY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
		),
		pairingCodeTtlSeconds: clamp(envInt(env, "SUITE_GATEWAY_PAIRING_CODE_TTL_SECONDS", 900), 60, 86_400),
		tokenTtlSeconds: clamp(envInt(env, "SUITE_GATEWAY_TOKEN_TTL_SECONDS", 2_592_000), 300, 31_536_000),
		streamMaxSeconds: clamp(envInt(env, "ZEROCLAW_GATEWAY_STREAM_MAX_SECS", 1200), 30, 7200),
		stateFilePath,
		profileCatalog: buildProfileCatalog(env),
		provider: resolveProviderConfig(env),
		passkeyBridge: resolvePasskeyBridgeConfig(env),
	};
}

function loadGatewayState(stateFilePath) {
	try {
		if (!fs.existsSync(stateFilePath)) {
			return {
				version: 1,
				pairingCode: "",
				pairingCodeExpiresAt: 0,
				issuedTokens: [],
			};
		}
		const raw = JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
		if (!raw || typeof raw !== "object") {
			throw new Error("State file must contain an object.");
		}
		return {
			version: 1,
			pairingCode: String(raw.pairingCode || "").trim(),
			pairingCodeExpiresAt: Number(raw.pairingCodeExpiresAt || 0),
			issuedTokens: Array.isArray(raw.issuedTokens)
				? raw.issuedTokens
						.filter((entry) => entry && typeof entry === "object")
						.map((entry) => ({
							id: String(entry.id || "").trim(),
							tokenHash: String(entry.tokenHash || "").trim(),
							createdAt: Number(entry.createdAt || 0),
							expiresAt: Number(entry.expiresAt || 0),
						}))
				: [],
		};
	} catch {
		return {
			version: 1,
			pairingCode: "",
			pairingCodeExpiresAt: 0,
			issuedTokens: [],
		};
	}
}

function persistGatewayState(stateFilePath, state) {
	fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
	fs.writeFileSync(
		stateFilePath,
		JSON.stringify(
			{
				version: 1,
				pairingCode: state.pairingCode,
				pairingCodeExpiresAt: state.pairingCodeExpiresAt,
				issuedTokens: state.issuedTokens,
			},
			null,
			2,
		),
		"utf8",
	);
}

function pruneExpiredState(state, now) {
	state.issuedTokens = state.issuedTokens.filter((entry) => Number(entry.expiresAt || 0) > now);
	if (Number(state.pairingCodeExpiresAt || 0) <= now) {
		state.pairingCode = "";
		state.pairingCodeExpiresAt = 0;
	}
}

function issuePairingCode(state, config, now = Date.now()) {
	const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
	state.pairingCode = code;
	state.pairingCodeExpiresAt = now + config.pairingCodeTtlSeconds * 1000;
	return {
		pairing_code: code,
		expires_at: nowIso(state.pairingCodeExpiresAt),
	};
}

function issueGatewayToken(state, config, now = Date.now()) {
	const token = `suite_gtw_${crypto.randomBytes(24).toString("hex")}`;
	const expiresAt = now + config.tokenTtlSeconds * 1000;
	state.issuedTokens.push({
		id: crypto.randomUUID(),
		tokenHash: sha256(token),
		createdAt: now,
		expiresAt,
	});
	return {
		token,
		expires_at: nowIso(expiresAt),
	};
}

function extractBearerToken(request) {
	const header = String(request.headers.authorization || "").trim();
	if (!header || !/^bearer\s+/i.test(header)) return "";
	return header.replace(/^bearer\s+/i, "").trim();
}

function isTokenAuthorized(state, token, now = Date.now()) {
	if (!token) return false;
	const tokenHash = sha256(token);
	return state.issuedTokens.some(
		(entry) => entry.tokenHash === tokenHash && Number(entry.expiresAt || 0) > now,
	);
}

function revokeGatewayToken(state, token) {
	const tokenHash = sha256(token);
	const before = state.issuedTokens.length;
	state.issuedTokens = state.issuedTokens.filter((entry) => entry.tokenHash !== tokenHash);
	return before !== state.issuedTokens.length;
}

function isOriginAllowed(config, origin) {
	if (!origin) return false;
	if (config.corsOrigins.includes("*")) return true;
	return config.corsOrigins.includes(origin);
}

function applyCorsHeaders(request, response, config) {
	const origin = String(request.headers.origin || "").trim();
	if (!origin) return;
	if (!isOriginAllowed(config, origin)) return;
	response.setHeader("Access-Control-Allow-Origin", config.corsOrigins.includes("*") ? "*" : origin);
	response.setHeader("Vary", "Origin");
	response.setHeader(
		"Access-Control-Allow-Headers",
		"Authorization, Content-Type, X-Pairing-Code, X-Webhook-Secret, X-Idempotency-Key, X-Request-ID",
	);
	response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

async function readJsonRequestBody(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}
	const rawBody = Buffer.concat(chunks).toString("utf8");
	if (!rawBody.trim()) return {};
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new Error("Expected JSON payload");
	}
}

function validateWebhookSecret(request, config) {
	if (!config.requireWebhookSecret) return { ok: true };
	if (!config.webhookSecret) {
		return {
			ok: false,
			status: 503,
			payload: createErrorPayload("Agent webhook secret is required but not configured."),
		};
	}
	const provided = String(request.headers["x-webhook-secret"] || "").trim();
	if (!provided || provided !== config.webhookSecret) {
		return {
			ok: false,
			status: 401,
			payload: createErrorPayload("Webhook secret rejected by gateway."),
		};
	}
	return { ok: true };
}

function requireAuthorizedToken(request, response, config, state) {
	if (!config.pairingRequired) {
		return { ok: true, token: "" };
	}
	const token = extractBearerToken(request);
	if (!isTokenAuthorized(state, token)) {
		createJsonResponse(
			response,
			401,
			createErrorPayload(
				"Unauthorized — pair first via POST /pair, then send Authorization: Bearer <token>",
			),
		);
		return { ok: false, token: "" };
	}
	return { ok: true, token };
}

function resolveRequestedModel(config, profileId, requestedModel) {
	const explicit = String(requestedModel || "").trim();
	if (explicit) return explicit;
	const normalizedProfile = String(profileId || "").trim().toLowerCase();
	const profileModel = config.profileCatalog?.[normalizedProfile]?.model;
	return String(profileModel || config.provider.defaultModel || "").trim();
}

function buildSuitePasskeySignaturePayload(state, intent, status, email, error, timestamp) {
	return `${state}\n${intent}\n${status}\n${email}\n${error}\n${timestamp}`;
}

function computeSuitePasskeySignature(secret, payload) {
	return crypto.createHmac("sha256", String(secret || "")).update(payload, "utf8").digest("hex");
}

function validateSuiteReturnTo(rawValue, config) {
	let parsed;
	try {
		parsed = new URL(String(rawValue || "").trim());
	} catch {
		return { ok: false, reason: "suite_return_to must be absolute URL" };
	}
	if (!["http:", "https:"].includes(parsed.protocol)) {
		return { ok: false, reason: "suite_return_to must use http or https" };
	}
	if (!parsed.hostname) {
		return { ok: false, reason: "suite_return_to host is missing" };
	}
	const allowedOrigins = config.passkeyBridge.callbackAllowedOrigins;
	if (
		allowedOrigins.length > 0 &&
		!allowedOrigins.some((entry) => entry === parsed.origin)
	) {
		return { ok: false, reason: "suite_return_to origin is not allowed" };
	}
	return { ok: true, url: parsed };
}

function verifySuiteProviderJwt(token, expectedState, expectedIntent, config) {
	const parts = String(token || "").split(".");
	if (parts.length !== 3) {
		return { ok: false, reason: "provider token has invalid format" };
	}
	const [headerBase64, payloadBase64, signatureBase64] = parts;
	const headerBytes = decodeBase64Url(headerBase64);
	const payloadBytes = decodeBase64Url(payloadBase64);
	const signatureBytes = decodeBase64Url(signatureBase64);
	if (!headerBytes) return { ok: false, reason: "provider token header is invalid" };
	if (!payloadBytes) return { ok: false, reason: "provider token payload is invalid" };
	if (!signatureBytes) return { ok: false, reason: "provider token signature is invalid" };

	let header;
	let payload;
	try {
		header = JSON.parse(headerBytes.toString("utf8"));
	} catch {
		return { ok: false, reason: "provider token header is not JSON" };
	}
	try {
		payload = JSON.parse(payloadBytes.toString("utf8"));
	} catch {
		return { ok: false, reason: "provider token payload is not JSON" };
	}
	if (jsonClaimAsString(header?.alg) !== "HS256") {
		return { ok: false, reason: "provider token alg must be HS256" };
	}
	if (!config.passkeyBridge.providerJwtSecret) {
		return { ok: false, reason: "provider JWT secret is not configured" };
	}
	const signingInput = `${headerBase64}.${payloadBase64}`;
	const expectedSignature = crypto
		.createHmac("sha256", config.passkeyBridge.providerJwtSecret)
		.update(signingInput, "utf8")
		.digest();
	if (
		expectedSignature.length !== signatureBytes.length ||
		!crypto.timingSafeEqual(expectedSignature, signatureBytes)
	) {
		return { ok: false, reason: "provider token signature verification failed" };
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const clockSkewSeconds = config.passkeyBridge.providerJwtClockSkewSeconds;
	const expiration = jsonClaimAsInt(payload?.exp);
	const notBefore = jsonClaimAsInt(payload?.nbf);
	const issuedAt = jsonClaimAsInt(payload?.iat);
	if (config.passkeyBridge.providerJwtRequireExp && expiration == null) {
		return { ok: false, reason: "provider token exp claim is required" };
	}
	if (expiration != null && nowSeconds > expiration + clockSkewSeconds) {
		return { ok: false, reason: "provider token is expired" };
	}
	if (notBefore != null && nowSeconds + clockSkewSeconds < notBefore) {
		return { ok: false, reason: "provider token is not active yet" };
	}
	if (issuedAt != null && issuedAt > nowSeconds + clockSkewSeconds) {
		return { ok: false, reason: "provider token iat claim is in the future" };
	}
	if (
		config.passkeyBridge.providerJwtIssuer &&
		jsonClaimAsString(payload?.iss) !== config.passkeyBridge.providerJwtIssuer
	) {
		return { ok: false, reason: "provider token issuer mismatch" };
	}
	if (
		config.passkeyBridge.providerJwtAudience &&
		!claimAudienceMatches(payload, config.passkeyBridge.providerJwtAudience)
	) {
		return { ok: false, reason: "provider token audience mismatch" };
	}
	const stateClaim = jsonClaimAsString(payload?.suite_state) || jsonClaimAsString(payload?.state);
	if (config.passkeyBridge.providerJwtRequireState) {
		if (!stateClaim) {
			return { ok: false, reason: "provider token state claim is required" };
		}
		if (stateClaim !== expectedState) {
			return { ok: false, reason: "provider token state mismatch" };
		}
	}
	const intentClaimRaw =
		jsonClaimAsString(payload?.suite_intent) ||
		jsonClaimAsString(payload?.intent) ||
		jsonClaimAsString(payload?.passkey_intent);
	const intentClaim = normalizeSuitePasskeyIntent(intentClaimRaw);
	if (intentClaimRaw && !intentClaim) {
		return { ok: false, reason: "provider token intent is invalid" };
	}
	if (intentClaim && intentClaim !== expectedIntent) {
		return { ok: false, reason: "provider token intent mismatch" };
	}
	const statusRaw =
		jsonClaimAsString(payload?.passkey_status) || jsonClaimAsString(payload?.status);
	const status = normalizeSuitePasskeyStatus(statusRaw);
	if (statusRaw && !status) {
		return { ok: false, reason: "provider token status is invalid" };
	}
	const email = (
		jsonClaimAsString(payload?.passkey_email) ||
		jsonClaimAsString(payload?.email) ||
		jsonClaimAsString(payload?.preferred_username) ||
		jsonClaimAsString(payload?.upn)
	).toLowerCase();
	const error =
		jsonClaimAsString(payload?.passkey_error) || jsonClaimAsString(payload?.error);
	return {
		ok: true,
		claims: {
			intent: intentClaim,
			status,
			email,
			error,
		},
	};
}

function normalizeModelListPayload(payload) {
	const ids = [];
	if (payload && typeof payload === "object") {
		const candidateLists = [];
		if (Array.isArray(payload.models)) candidateLists.push(payload.models);
		if (Array.isArray(payload.data)) candidateLists.push(payload.data);
		for (const list of candidateLists) {
			for (const entry of list) {
				if (!entry || typeof entry !== "object") continue;
				const id = String(entry.id || entry.name || entry.model || "").trim();
				if (id) ids.push(id);
			}
		}
	}
	return Array.from(new Set(ids));
}

function extractResponseText(payload) {
	if (!payload || typeof payload !== "object") {
		return typeof payload === "string" ? payload : "";
	}
	if (typeof payload.response === "string") return payload.response;
	if (typeof payload.output_text === "string") return payload.output_text;
	if (Array.isArray(payload.output_text)) {
		return payload.output_text
			.map((entry) => (typeof entry === "string" ? entry : ""))
			.filter(Boolean)
			.join("");
	}
	if (Array.isArray(payload.choices) && payload.choices[0]) {
		const choice = payload.choices[0];
		if (choice?.message?.content) {
			if (typeof choice.message.content === "string") return choice.message.content;
			if (Array.isArray(choice.message.content)) {
				return choice.message.content
					.map((part) => {
						if (typeof part === "string") return part;
						if (part && typeof part.text === "string") return part.text;
						if (part && typeof part.value === "string") return part.value;
						return "";
					})
					.filter(Boolean)
					.join("");
			}
		}
	}
	if (Array.isArray(payload.content)) {
		return payload.content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part.text === "string") return part.text;
				return "";
			})
			.filter(Boolean)
			.join("");
	}
	return "";
}

function extractStreamDelta(payload) {
	if (!payload || typeof payload !== "object") return "";
	if (typeof payload.delta === "string") return payload.delta;
	if (Array.isArray(payload.choices) && payload.choices[0]) {
		const delta = payload.choices[0]?.delta;
		if (typeof delta?.content === "string") return delta.content;
		if (Array.isArray(delta?.content)) {
			return delta.content
				.map((entry) => {
					if (typeof entry === "string") return entry;
					if (entry && typeof entry.text === "string") return entry.text;
					return "";
				})
				.filter(Boolean)
				.join("");
		}
	}
	return "";
}

function createProviderHeaders(config) {
	const headers = {
		"Content-Type": "application/json",
	};
	if (config.provider.providerId === "openrouter" && config.provider.apiKey) {
		headers.Authorization = `Bearer ${config.provider.apiKey}`;
		if (config.provider.openRouterSiteUrl) {
			headers["HTTP-Referer"] = config.provider.openRouterSiteUrl;
		}
		if (config.provider.openRouterSiteName) {
			headers["X-Title"] = config.provider.openRouterSiteName;
		}
	} else if (
		config.provider.providerId !== "ollama" &&
		config.provider.apiKey
	) {
		headers.Authorization = `Bearer ${config.provider.apiKey}`;
	}
	return headers;
}

async function listProviderModels(fetchImpl, config) {
	if (config.provider.providerId === "ollama") {
		const response = await fetchImpl(`${config.provider.baseUrl}/api/tags`, {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new Error(`Model list request failed (${response.status})`);
		}
		const payload = await response.json();
		const models = Array.isArray(payload.models)
			? payload.models
					.map((entry) => String(entry?.name || "").trim())
					.filter(Boolean)
			: [];
		return Array.from(new Set(models));
	}

	const response = await fetchImpl(`${config.provider.baseUrl}/models`, {
		method: "GET",
		headers: createProviderHeaders(config),
	});
	if (!response.ok) {
		throw new Error(`Model list request failed (${response.status})`);
	}
	const payload = await response.json();
	return normalizeModelListPayload(payload);
}

async function requestProviderResponse(fetchImpl, config, { message, model, stream }) {
	if (config.provider.providerId === "ollama") {
		const response = await fetchImpl(`${config.provider.baseUrl}/api/generate`, {
			method: "POST",
			headers: createProviderHeaders(config),
			body: JSON.stringify({
				model,
				prompt: message,
				stream: Boolean(stream),
			}),
		});
		return response;
	}

	const response = await fetchImpl(`${config.provider.baseUrl}/chat/completions`, {
		method: "POST",
		headers: createProviderHeaders(config),
		body: JSON.stringify({
			model,
			stream: Boolean(stream),
			messages: [
				{
					role: "user",
					content: message,
				},
			],
		}),
	});
	return response;
}

function createSseHeaders() {
	return {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-store",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	};
}

function writeSseEvent(response, payload) {
	response.write(`data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`);
}

async function pipeOllamaStream(upstream, response, requestedModel) {
	const reader = upstream.body?.getReader();
	if (!reader) {
		writeSseEvent(response, { error: "Gateway stream unavailable.", model: requestedModel });
		writeSseEvent(response, "[DONE]");
		response.end();
		return;
	}

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		buffer += decoder.decode(chunk.value, { stream: true });
		const parts = buffer.split(/\r?\n/);
		buffer = parts.pop() || "";
		for (const line of parts) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const payload = JSON.parse(trimmed);
				const delta = String(payload.response || "");
				if (delta) {
					writeSseEvent(response, {
						delta,
						model: String(payload.model || requestedModel || ""),
					});
				}
				if (payload.done) {
					writeSseEvent(response, "[DONE]");
					response.end();
					return;
				}
			} catch {
				// Ignore malformed provider fragments and continue.
			}
		}
	}

	if (buffer.trim()) {
		try {
			const payload = JSON.parse(buffer.trim());
			const delta = String(payload.response || "");
			if (delta) {
				writeSseEvent(response, {
					delta,
					model: String(payload.model || requestedModel || ""),
				});
			}
		} catch {
			// ignore trailing noise
		}
	}
	writeSseEvent(response, "[DONE]");
	response.end();
}

async function pipeOpenAiCompatibleStream(upstream, response, requestedModel) {
	const reader = upstream.body?.getReader();
	if (!reader) {
		writeSseEvent(response, { error: "Gateway stream unavailable.", model: requestedModel });
		writeSseEvent(response, "[DONE]");
		response.end();
		return;
	}

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
		const split = splitBufferBlocks(buffer, /\n\n/);
		buffer = split.remaining;
		for (const block of split.blocks) {
			for (const line of block.split("\n")) {
				if (!line.startsWith("data:")) continue;
				const payloadValue = line.slice(5).trimStart();
				if (!payloadValue) continue;
				if (payloadValue === "[DONE]") {
					writeSseEvent(response, "[DONE]");
					response.end();
					return;
				}
				try {
					const payload = JSON.parse(payloadValue);
					const delta = extractStreamDelta(payload);
					if (delta) {
						writeSseEvent(response, {
							delta,
							model: String(payload.model || requestedModel || ""),
						});
					}
				} catch {
					// Ignore malformed provider fragments and continue.
				}
			}
		}
	}

	writeSseEvent(response, "[DONE]");
	response.end();
}

async function createSuiteAgentGatewayServer({
	repoRoot,
	env = { ...loadRepoEnv(repoRoot), ...process.env },
	fetchImpl = fetch,
	logger = console,
} = {}) {
	const config = resolveGatewayConfig({ repoRoot, env });
	const state = loadGatewayState(config.stateFilePath);
	pruneExpiredState(state, Date.now());
	persistGatewayState(config.stateFilePath, state);

	function saveState() {
		pruneExpiredState(state, Date.now());
		persistGatewayState(config.stateFilePath, state);
	}

	function ensureLivePairingCode() {
		if (!config.pairingRequired) {
			return null;
		}
		const now = Date.now();
		pruneExpiredState(state, now);
		if (state.pairingCode && Number(state.pairingCodeExpiresAt || 0) > now) {
			return {
				pairing_code: state.pairingCode,
				expires_at: nowIso(state.pairingCodeExpiresAt),
			};
		}
		const payload = issuePairingCode(state, config, now);
		saveState();
		return payload;
	}

	const initialPairingCode = ensureLivePairingCode();

	const server = http.createServer(async (request, response) => {
		applyCorsHeaders(request, response, config);
		if (request.method === "OPTIONS") {
			response.writeHead(204);
			response.end();
			return;
		}

		const url = new URL(request.url || "/", `http://${config.host}:${config.port}`);
		pruneExpiredState(state, Date.now());
		saveState();

		try {
			if (request.method === "GET" && url.pathname === "/health") {
				const healthy = !config.requireWebhookSecret || Boolean(config.webhookSecret);
				createJsonResponse(
					response,
					healthy ? 200 : 503,
					{
						ok: healthy,
						source: "suite-agent-gateway",
						checkedAt: nowIso(),
						pairing_required: config.pairingRequired,
						active_tokens: state.issuedTokens.length,
						pairing_code_available: Boolean(state.pairingCode),
						pairing_code_expires_at:
							state.pairingCodeExpiresAt > Date.now()
								? nowIso(state.pairingCodeExpiresAt)
								: null,
						provider: {
							mode: config.provider.mode,
							id: config.provider.providerId,
							base_url: config.provider.baseUrl,
						},
						warnings:
							config.requireWebhookSecret && !config.webhookSecret
								? ["AGENT_WEBHOOK_SECRET is required but not configured."]
								: [],
					},
				);
				return;
			}

			if (request.method === "GET" && url.pathname === "/suite/passkey/callback") {
				const intent = normalizeSuitePasskeyIntent(url.searchParams.get("suite_intent"));
				if (!intent) {
					createJsonResponse(
						response,
						400,
						createErrorPayload(
							"Invalid or missing suite_intent. Expected sign-in or enroll.",
						),
					);
					return;
				}

				const stateToken = sanitizeSuitePasskeyField(
					url.searchParams.get("suite_state"),
					200,
				);
				if (!isValidSuitePasskeyState(stateToken)) {
					createJsonResponse(
						response,
						400,
						createErrorPayload("Invalid or missing suite_state."),
					);
					return;
				}

				const suiteReturnToRaw = String(url.searchParams.get("suite_return_to") || "").trim();
				if (!suiteReturnToRaw) {
					createJsonResponse(
						response,
						400,
						createErrorPayload("Missing suite_return_to redirect URL."),
					);
					return;
				}

				const suiteReturnTo = validateSuiteReturnTo(suiteReturnToRaw, config);
				if (!suiteReturnTo.ok) {
					createJsonResponse(response, 400, createErrorPayload(suiteReturnTo.reason));
					return;
				}

				const claimsRequired =
					parseBoolish(url.searchParams.get("suite_claims_required")) ||
					config.passkeyBridge.providerJwtRequired;
				const providerToken = sanitizeSuitePasskeyField(
					url.searchParams.get("provider_token") ||
						url.searchParams.get("passkey_token") ||
						url.searchParams.get("id_token") ||
						url.searchParams.get("jwt"),
					4096,
				);
				let verifiedClaims = null;
				if (!providerToken) {
					if (claimsRequired) {
						createJsonResponse(
							response,
							400,
							createErrorPayload("Missing provider JWT claims token."),
						);
						return;
					}
				} else {
					const verified = verifySuiteProviderJwt(
						providerToken,
						stateToken,
						intent,
						config,
					);
					if (!verified.ok) {
						createJsonResponse(
							response,
							401,
							createErrorPayload("Provider JWT validation failed.", {
								reason: verified.reason,
							}),
						);
						return;
					}
					verifiedClaims = verified.claims;
				}

				let status = verifiedClaims?.status;
				if (!status) {
					const statusRaw =
						url.searchParams.get("passkey_status") ||
						url.searchParams.get("status") ||
						"success";
					status = normalizeSuitePasskeyStatus(statusRaw) || "failed";
				}

				let email = verifiedClaims?.email
					? sanitizeSuitePasskeyField(verifiedClaims.email.toLowerCase(), 254)
					: sanitizeSuitePasskeyField(
							(
								url.searchParams.get("passkey_email") || url.searchParams.get("email") || ""
							).toLowerCase(),
							254,
						);
				let error =
					verifiedClaims?.error
						? sanitizeSuitePasskeyField(verifiedClaims.error, 250)
						: sanitizeSuitePasskeyField(
								url.searchParams.get("passkey_error") || url.searchParams.get("error"),
								250,
							);

				if (intent === "sign-in" && status === "success" && !isValidEmailLike(email)) {
					status = "failed";
					email = "";
					if (!error) {
						error = "Passkey sign-in callback did not include a valid email.";
					}
				}
				if (status === "success") {
					error = "";
				} else if (!error) {
					error = "Passkey verification was not completed.";
				}

				const signatureRequired = parseBoolish(
					url.searchParams.get("suite_callback_sig_required"),
				);
				let callbackSignature = "";
				let callbackTimestamp = "";
				if (signatureRequired) {
					if (!config.passkeyBridge.callbackSigningSecret) {
						createJsonResponse(
							response,
							500,
							createErrorPayload(
								"Signed callback required but signing secret is not configured.",
							),
						);
						return;
					}
					const timestamp = Math.floor(Date.now() / 1000);
					const payload = buildSuitePasskeySignaturePayload(
						stateToken,
						intent,
						status,
						email,
						error,
						timestamp,
					);
					callbackSignature = computeSuitePasskeySignature(
						config.passkeyBridge.callbackSigningSecret,
						payload,
					);
					callbackTimestamp = String(timestamp);
				}

				suiteReturnTo.url.searchParams.set("passkey_state", stateToken);
				suiteReturnTo.url.searchParams.set("passkey_intent", intent);
				suiteReturnTo.url.searchParams.set("passkey_status", status);
				if (email) {
					suiteReturnTo.url.searchParams.set("passkey_email", email);
				} else {
					suiteReturnTo.url.searchParams.delete("passkey_email");
				}
				if (error) {
					suiteReturnTo.url.searchParams.set("passkey_error", error);
				} else {
					suiteReturnTo.url.searchParams.delete("passkey_error");
				}
				if (callbackSignature && callbackTimestamp) {
					suiteReturnTo.url.searchParams.set("passkey_signature", callbackSignature);
					suiteReturnTo.url.searchParams.set("passkey_timestamp", callbackTimestamp);
				}

				logger.info?.(
					`Suite passkey callback prepared (intent=${intent}, status=${status}, signed=${signatureRequired})`,
				);
				createRedirectResponse(response, suiteReturnTo.url.toString());
				return;
			}

			if (request.method === "POST" && url.pathname === "/pairing-code") {
				const secretCheck = validateWebhookSecret(request, config);
				if (!secretCheck.ok) {
					createJsonResponse(response, secretCheck.status, secretCheck.payload);
					return;
				}
				if (!config.pairingRequired) {
					createJsonResponse(response, 409, createErrorPayload("Pairing is disabled for this gateway."));
					return;
				}
				const payload = issuePairingCode(state, config, Date.now());
				saveState();
				logger.warn?.(
					`Suite gateway issued pairing code ${payload.pairing_code} (expires ${payload.expires_at}).`,
				);
				createJsonResponse(response, 200, payload);
				return;
			}

			if (request.method === "POST" && url.pathname === "/pair") {
				if (!config.pairingRequired) {
					createJsonResponse(response, 409, createErrorPayload("Pairing is disabled for this gateway."));
					return;
				}
				const pairingCode = String(request.headers["x-pairing-code"] || "").trim();
				if (!pairingCode) {
					createJsonResponse(response, 400, createErrorPayload("X-Pairing-Code header is required."));
					return;
				}
				if (
					!state.pairingCode ||
					state.pairingCode !== pairingCode ||
					Number(state.pairingCodeExpiresAt || 0) <= Date.now()
				) {
					createJsonResponse(
						response,
						401,
						createErrorPayload("Invalid or expired pairing code."),
					);
					return;
				}
				const tokenPayload = issueGatewayToken(state, config, Date.now());
				state.pairingCode = "";
				state.pairingCodeExpiresAt = 0;
				saveState();
				createJsonResponse(response, 200, {
					token: tokenPayload.token,
					token_type: "Bearer",
					paired: true,
					expires_at: tokenPayload.expires_at,
				});
				return;
			}

			if (request.method === "POST" && url.pathname === "/unpair") {
				const auth = requireAuthorizedToken(request, response, config, state);
				if (!auth.ok) return;
				const revoked = revokeGatewayToken(state, auth.token);
				const nextPairingCode = config.pairingRequired
					? issuePairingCode(state, config, Date.now())
					: null;
				saveState();
				createJsonResponse(response, 200, {
					revoked,
					paired: false,
					pairing_code: nextPairingCode?.pairing_code || null,
					pairing_code_expires_at: nextPairingCode?.expires_at || null,
				});
				return;
			}

			if (request.method === "GET" && url.pathname === "/v1/models") {
				const auth = requireAuthorizedToken(request, response, config, state);
				if (!auth.ok) return;
				try {
					const models = await listProviderModels(fetchImpl, config);
					createJsonResponse(response, 200, {
						object: "list",
						data: models.map((model) => ({
							id: model,
							object: "model",
							owned_by: config.provider.providerId,
						})),
					});
				} catch (error) {
					createJsonResponse(
						response,
						502,
						createErrorPayload(String(error?.message || error || "Unable to list models.")),
					);
				}
				return;
			}

			if (request.method === "POST" && url.pathname === "/webhook") {
				const secretCheck = validateWebhookSecret(request, config);
				if (!secretCheck.ok) {
					createJsonResponse(response, secretCheck.status, secretCheck.payload);
					return;
				}
				const auth = requireAuthorizedToken(request, response, config, state);
				if (!auth.ok) return;

				let payload;
				try {
					payload = await readJsonRequestBody(request);
				} catch (error) {
					createJsonResponse(response, 400, createErrorPayload(String(error?.message || "Expected JSON payload")));
					return;
				}

				const messageRaw = payload?.message;
				const profileId = String(payload?.profile_id || payload?.profileId || "").trim().toLowerCase();
				const model = resolveRequestedModel(config, profileId, payload?.model);
				const stream = Boolean(payload?.stream);
				const message =
					typeof messageRaw === "string"
						? messageRaw
						: messageRaw == null
							? ""
							: JSON.stringify(messageRaw);
				if (!message.trim()) {
					createJsonResponse(response, 400, createErrorPayload('Use POST /webhook with a JSON body: {"message":"..."}'));
					return;
				}
				if (!model) {
					createJsonResponse(response, 503, createErrorPayload("No agent model is configured for this request."));
					return;
				}

				try {
					const upstream = await requestProviderResponse(fetchImpl, config, {
						message,
						model,
						stream,
					});

					if (!upstream.ok) {
						const errorText = await upstream.text().catch(() => "");
						createJsonResponse(
							response,
							upstream.status || 502,
							createErrorPayload(errorText || `LLM request failed: upstream ${upstream.status}`),
						);
						return;
					}

					if (stream) {
						response.writeHead(200, createSseHeaders());
						if (config.provider.providerId === "ollama") {
							await pipeOllamaStream(upstream, response, model);
							return;
						}
						await pipeOpenAiCompatibleStream(upstream, response, model);
						return;
					}

					const upstreamPayload = await upstream.json().catch(() => ({}));
					const responseText = extractResponseText(upstreamPayload);
					createJsonResponse(response, 200, {
						model: String(upstreamPayload?.model || model || ""),
						response: responseText,
					});
				} catch (error) {
					createJsonResponse(
						response,
						502,
						createErrorPayload(String(error?.message || error || "Upstream request failed.")),
					);
				}
				return;
			}

			createJsonResponse(response, 404, createErrorPayload("Not found."));
		} catch (error) {
			createJsonResponse(
				response,
				500,
				createErrorPayload(String(error?.message || error || "Gateway request failed.")),
			);
		}
	});

	return {
		config,
		state,
		server,
		initialPairingCode,
		listen() {
			return new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(config.port, config.host, () => {
					server.off("error", reject);
					const address = server.address();
					const resolvedPort =
						address && typeof address === "object" && Number.isFinite(address.port)
							? address.port
							: config.port;
					resolve({
						host: config.host,
						port: resolvedPort,
						initialPairingCode,
					});
				});
			});
		},
		async close() {
			await new Promise((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}

export { createSuiteAgentGatewayServer, resolveGatewayConfig };

export async function main({ repoRoot = process.cwd(), runtimeEnv, forwardedArgs = [] } = {}) {
	const env = runtimeEnv || { ...loadRepoEnv(repoRoot), ...process.env };
	const gateway = await createSuiteAgentGatewayServer({
		repoRoot,
		env,
	});
	const hostArgIndex = forwardedArgs.findIndex((arg) => arg === "--host");
	const portArgIndex = forwardedArgs.findIndex((arg) => arg === "--port");
	if (hostArgIndex !== -1 && forwardedArgs[hostArgIndex + 1]) {
		gateway.config.host = forwardedArgs[hostArgIndex + 1];
	}
	if (portArgIndex !== -1 && forwardedArgs[portArgIndex + 1]) {
		const forwardedPort = Number.parseInt(forwardedArgs[portArgIndex + 1], 10);
		if (Number.isFinite(forwardedPort)) {
			gateway.config.port = forwardedPort;
		}
	}
	const info = await gateway.listen();
	const healthUrl = `http://${info.host}:${info.port}/health`;
	console.warn(`Suite agent gateway listening on ${healthUrl}`);
	console.warn(
		`Provider: ${gateway.config.provider.providerId} (${gateway.config.provider.mode}) -> ${gateway.config.provider.baseUrl}`,
	);
	if (gateway.config.pairingRequired && info.initialPairingCode?.pairing_code) {
		console.warn(
			`Pairing code: ${info.initialPairingCode.pairing_code} (expires ${info.initialPairingCode.expires_at})`,
		);
	}
}

const invokedEntryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (invokedEntryUrl && import.meta.url === invokedEntryUrl) {
	const repoRoot = process.cwd();
	const runtimeEnv = { ...loadRepoEnv(repoRoot), ...process.env };
	await main({
		repoRoot,
		runtimeEnv,
		forwardedArgs: process.argv.slice(2),
	});
}
