import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSuiteAgentGatewayServer, resolveGatewayConfig } from "./suite-agent-gateway.mjs";

function makeTempRoot() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "suite-agent-gateway-"));
}

function makeJsonResponse(payload, init = {}) {
	return new Response(JSON.stringify(payload), {
		status: init.status || 200,
		headers: {
			"content-type": "application/json",
			...(init.headers || {}),
		},
	});
}

function makeNdjsonResponse(lines) {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const line of lines) {
					controller.enqueue(encoder.encode(`${line}\n`));
				}
				controller.close();
			},
		}),
		{
			status: 200,
			headers: {
				"content-type": "application/x-ndjson",
			},
		},
	);
}

async function readResponseText(response) {
	return await response.text();
}

function buildEnv(tempRoot, overrides = {}) {
	return {
		LOCALAPPDATA: tempRoot,
		AGENT_GATEWAY_HOST: "127.0.0.1",
		AGENT_GATEWAY_PORT: "0",
		SUITE_AGENT_PROVIDER_MODE: "local",
		SUITE_LOCAL_AGENT_MODEL: "devstral-small-2:latest",
		AGENT_REQUIRE_WEBHOOK_SECRET: "false",
		SUITE_GATEWAY_REQUIRE_PAIRING: "true",
		...overrides,
	};
}

function encodeJwtSegment(value) {
	return Buffer.from(JSON.stringify(value))
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function createHs256Jwt(payload, secret) {
	const header = { alg: "HS256", typ: "JWT" };
	const signingInput = `${encodeJwtSegment(header)}.${encodeJwtSegment(payload)}`;
	const signature = crypto
		.createHmac("sha256", secret)
		.update(signingInput, "utf8")
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
	return `${signingInput}.${signature}`;
}

const activeResources = [];

afterEach(async () => {
	while (activeResources.length > 0) {
		const resource = activeResources.pop();
		try {
			if (resource?.server) {
				await resource.server.close();
			}
		} catch {
			// Ignore shutdown issues during tests.
		}
		if (resource?.tempRoot) {
			fs.rmSync(resource.tempRoot, { recursive: true, force: true });
		}
	}
});

describe("suite-agent-gateway", () => {
	it("supports pairing and protected webhook requests", async () => {
		const tempRoot = makeTempRoot();
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot),
			fetchImpl: async (url, options = {}) => {
				expect(String(url)).toContain("/api/generate");
				const payload = JSON.parse(String(options.body || "{}"));
				expect(payload.model).toBe("devstral-small-2:latest");
				expect(payload.stream).toBe(false);
				return makeJsonResponse({
					model: payload.model,
					response: `reply:${payload.prompt}`,
				});
			},
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const pairingCodeResponse = await fetch(
			`http://${info.host}:${info.port}/pairing-code`,
			{
				method: "POST",
			},
		);
		expect(pairingCodeResponse.status).toBe(200);
		const pairingCodePayload = await pairingCodeResponse.json();
		expect(pairingCodePayload.pairing_code).toMatch(/^\d{6}$/);

		const unauthorizedResponse = await fetch(
			`http://${info.host}:${info.port}/webhook`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: "hello" }),
			},
		);
		expect(unauthorizedResponse.status).toBe(401);

		const pairResponse = await fetch(`http://${info.host}:${info.port}/pair`, {
			method: "POST",
			headers: {
				"X-Pairing-Code": pairingCodePayload.pairing_code,
			},
		});
		expect(pairResponse.status).toBe(200);
		const pairPayload = await pairResponse.json();
		expect(String(pairPayload.token || "")).toMatch(/^suite_gtw_/);

		const webhookResponse = await fetch(
			`http://${info.host}:${info.port}/webhook`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${pairPayload.token}`,
				},
				body: JSON.stringify({
					message: "hello",
					profile_id: "devstral",
				}),
			},
		);
		expect(webhookResponse.status).toBe(200);
		const webhookPayload = await webhookResponse.json();
		expect(webhookPayload).toMatchObject({
			model: "devstral-small-2:latest",
			response: "reply:hello",
		});
	});

	it("normalizes provider model lists through /v1/models", async () => {
		const tempRoot = makeTempRoot();
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot),
			fetchImpl: async (url) => {
				expect(String(url)).toContain("/api/tags");
				return makeJsonResponse({
					models: [{ name: "devstral-small-2:latest" }, { name: "qwen3:14b" }],
				});
			},
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const pairingCodePayload = await (
			await fetch(`http://${info.host}:${info.port}/pairing-code`, { method: "POST" })
		).json();
		const pairPayload = await (
			await fetch(`http://${info.host}:${info.port}/pair`, {
				method: "POST",
				headers: { "X-Pairing-Code": pairingCodePayload.pairing_code },
			})
		).json();

		const response = await fetch(`http://${info.host}:${info.port}/v1/models`, {
			headers: { Authorization: `Bearer ${pairPayload.token}` },
		});
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data).toEqual([
			{ id: "devstral-small-2:latest", object: "model", owned_by: "ollama" },
			{ id: "qwen3:14b", object: "model", owned_by: "ollama" },
		]);
	});

	it("translates Ollama NDJSON streams into SSE webhook output", async () => {
		const tempRoot = makeTempRoot();
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot),
			fetchImpl: async (url, options = {}) => {
				expect(String(url)).toContain("/api/generate");
				const payload = JSON.parse(String(options.body || "{}"));
				expect(payload.stream).toBe(true);
				return makeNdjsonResponse([
					JSON.stringify({
						model: payload.model,
						response: "hello",
						done: false,
					}),
					JSON.stringify({
						model: payload.model,
						response: " world",
						done: false,
					}),
					JSON.stringify({
						model: payload.model,
						done: true,
					}),
				]);
			},
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const pairingCodePayload = await (
			await fetch(`http://${info.host}:${info.port}/pairing-code`, { method: "POST" })
		).json();
		const pairPayload = await (
			await fetch(`http://${info.host}:${info.port}/pair`, {
				method: "POST",
				headers: { "X-Pairing-Code": pairingCodePayload.pairing_code },
			})
		).json();

		const response = await fetch(`http://${info.host}:${info.port}/webhook`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${pairPayload.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				message: "stream please",
				stream: true,
				profile_id: "devstral",
			}),
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const text = await readResponseText(response);
		expect(text).toContain('"delta":"hello"');
		expect(text).toContain('"delta":" world"');
		expect(text).toContain("data: [DONE]");
	});

	it("resolves provider and release-safe defaults from environment", () => {
		const config = resolveGatewayConfig({
			repoRoot: process.cwd(),
			env: buildEnv("C:\\temp", {
				SUITE_AGENT_PROVIDER_MODE: "auto",
				ZEROCLAW_PROVIDER: "openrouter",
				OPENROUTER_API_KEY: "or-test",
			}),
		});
		expect(config.provider.providerId).toBe("openrouter");
		expect(config.provider.baseUrl).toContain("openrouter.ai");
		expect(config.profileCatalog.devstral.model).toBe("devstral-small-2:latest");
	});

	it("bridges external passkey callbacks back to Suite with signed fields", async () => {
		const tempRoot = makeTempRoot();
		const signingSecret = "test-signing-secret";
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot, {
				AUTH_PASSKEY_CALLBACK_SIGNING_SECRET: signingSecret,
				AUTH_ALLOWED_REDIRECT_ORIGINS: "http://127.0.0.1:5173",
			}),
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const response = await fetch(
			`http://${info.host}:${info.port}/suite/passkey/callback?suite_intent=sign-in&suite_state=AbCdEfGhIjKlMnOpQrStUvWxYz012345&suite_return_to=${encodeURIComponent("http://127.0.0.1:5173/login")}&suite_callback_sig_required=1&status=success&email=user%40example.com`,
			{ redirect: "manual" },
		);
		expect(response.status).toBe(302);
		const location = response.headers.get("location") || "";
		expect(location).toContain("passkey_state=AbCdEfGhIjKlMnOpQrStUvWxYz012345");
		expect(location).toContain("passkey_intent=sign-in");
		expect(location).toContain("passkey_status=success");
		expect(location).toContain("passkey_email=user%40example.com");
		const redirected = new URL(location);
		const signature = redirected.searchParams.get("passkey_signature") || "";
		const timestamp = redirected.searchParams.get("passkey_timestamp") || "";
		expect(signature).toMatch(/^[0-9a-f]{64}$/);
		expect(timestamp).toMatch(/^\d+$/);
	});

	it("downgrades sign-in callbacks without a valid email", async () => {
		const tempRoot = makeTempRoot();
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot, {
				AUTH_ALLOWED_REDIRECT_ORIGINS: "http://127.0.0.1:5173",
			}),
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const response = await fetch(
			`http://${info.host}:${info.port}/suite/passkey/callback?suite_intent=sign-in&suite_state=AbCdEfGhIjKlMnOpQrStUvWxYz012345&suite_return_to=${encodeURIComponent("http://127.0.0.1:5173/login")}&status=success`,
			{ redirect: "manual" },
		);
		expect(response.status).toBe(302);
		const redirected = new URL(response.headers.get("location") || "");
		expect(redirected.searchParams.get("passkey_status")).toBe("failed");
		expect(redirected.searchParams.get("passkey_error")).toContain(
			"did not include a valid email",
		);
		expect(redirected.searchParams.get("passkey_email")).toBeNull();
	});

	it("requires and verifies provider JWT claims when requested", async () => {
		const tempRoot = makeTempRoot();
		const jwtSecret = "provider-secret";
		const stateToken = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
		const providerToken = createHs256Jwt(
			{
				suite_state: stateToken,
				suite_intent: "enroll",
				passkey_status: "success",
				email: "owner@example.com",
				exp: Math.floor(Date.now() / 1000) + 300,
			},
			jwtSecret,
		);
		const gateway = await createSuiteAgentGatewayServer({
			repoRoot: process.cwd(),
			env: buildEnv(tempRoot, {
				AUTH_ALLOWED_REDIRECT_ORIGINS: "http://127.0.0.1:5173",
				ZC_SUITE_PASSKEY_PROVIDER_JWT_SECRET: jwtSecret,
			}),
		});
		const info = await gateway.listen();
		activeResources.push({ server: gateway, tempRoot });

		const response = await fetch(
			`http://${info.host}:${info.port}/suite/passkey/callback?suite_intent=enroll&suite_state=${stateToken}&suite_return_to=${encodeURIComponent("http://127.0.0.1:5173/app/settings")}&suite_claims_required=1&provider_token=${encodeURIComponent(providerToken)}&status=failed&error=ignored`,
			{ redirect: "manual" },
		);
		expect(response.status).toBe(302);
		const redirected = new URL(response.headers.get("location") || "");
		expect(redirected.searchParams.get("passkey_status")).toBe("success");
		expect(redirected.searchParams.get("passkey_email")).toBe("owner@example.com");
		expect(redirected.searchParams.get("passkey_error")).toBeNull();
	});
});
