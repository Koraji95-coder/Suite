/**
 * Integration tests for suite-repo-mcp Agent-Agnostic API compliance.
 *
 * Design principle reference:
 *   tools/chrome-devtools-mcp/docs/design-principles.md
 *   "Agent-Agnostic API: Use standards like MCP. Don't lock in to one LLM.
 *    Interoperability is key."
 *
 * These tests verify that the server speaks standard JSON-RPC 2.0 / MCP
 * and is therefore interoperable with any MCP-capable client – not just
 * LLM-backed agents.  They use raw stdin/stdout framing (Content-Length
 * headers) so no MCP SDK is required on the test side.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_PATH = path.join(
	REPO_ROOT,
	"tools",
	"suite-repo-mcp",
	"server.mjs",
);

// ---------------------------------------------------------------------------
// Low-level session helper
// ---------------------------------------------------------------------------

/**
 * Frame a JSON-RPC object as an LSP-style Content-Length message.
 * @param {unknown} obj
 * @returns {string}
 */
function frameMessage(obj) {
	const body = JSON.stringify(obj);
	return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

/**
 * Create a raw session against the suite-repo-mcp server.
 *
 * Communicates via stdin/stdout using the standard MCP framing protocol
 * (Content-Length header + JSON body), without any MCP SDK dependency.
 * This simulates a non-LLM agent that only speaks raw JSON-RPC 2.0 / MCP.
 *
 * @param {Record<string, string>} [extraEnv]
 */
function createSession(extraEnv = {}) {
	const proc = spawn("node", [SERVER_PATH], {
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			// Use generic fixture IDs to avoid PII in test output
			SUITE_WORKSTATION_ID: "DEV-WORK",
			SUITE_WORKSTATION_LABEL: "Dev Workstation",
			...extraEnv,
		},
	});

	let readBuf = Buffer.alloc(0);
	/** @type {Map<number|string, (msg: unknown) => void>} */
	const pending = new Map();
	let nextId = 1;

	proc.stdout.on("data", (chunk) => {
		readBuf = Buffer.concat([readBuf, chunk]);
		drainBuffer();
	});

	function drainBuffer() {
		while (true) {
			const headerEnd = readBuf.indexOf("\r\n\r\n");
			if (headerEnd === -1) break;

			const header = readBuf.slice(0, headerEnd).toString("utf8");
			const match = header.match(/Content-Length:\s*(\d+)/i);
			if (!match) {
				readBuf = readBuf.slice(headerEnd + 4);
				continue;
			}

			const contentLength = Number.parseInt(match[1], 10);
			const start = headerEnd + 4;
			const end = start + contentLength;
			if (readBuf.length < end) break;

			const payload = readBuf.slice(start, end).toString("utf8");
			readBuf = readBuf.slice(end);

			let message;
			try {
				message = JSON.parse(payload);
			} catch {
				continue;
			}

			if (message != null && typeof message === "object" && "id" in message) {
				const resolver = pending.get(message.id);
				if (resolver) {
					pending.delete(message.id);
					resolver(message);
				}
			}
		}
	}

	/**
	 * Send a raw JSON-RPC notification (no response expected).
	 * @param {string} method
	 * @param {unknown} [params]
	 */
	function notify(method, params) {
		proc.stdin.write(frameMessage({ jsonrpc: "2.0", method, params }));
	}

	/**
	 * Send a JSON-RPC request and await the response.
	 * @param {string} method
	 * @param {unknown} [params]
	 * @param {number} [timeoutMs]
	 * @returns {Promise<unknown>}
	 */
	function request(method, params, timeoutMs = 10_000) {
		return new Promise((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`Request timed out: ${method} (id=${id})`));
			}, timeoutMs);

			pending.set(id, (msg) => {
				clearTimeout(timer);
				resolve(msg);
			});

			proc.stdin.write(
				frameMessage({ jsonrpc: "2.0", id, method, params }),
			);
		});
	}

	/**
	 * Perform the MCP initialize handshake.
	 * @param {string} [protocolVersion]
	 */
	async function initialize(protocolVersion = "2026-01-26") {
		const resp = await request("initialize", {
			protocolVersion,
			clientInfo: { name: "test-agent", version: "1.0" },
			capabilities: {},
		});
		notify("notifications/initialized");
		return resp;
	}

	/** Gracefully close the session. */
	async function close() {
		proc.stdin.end();
		await new Promise((resolve) => {
			proc.on("close", resolve);
			setTimeout(resolve, 2_000);
		});
	}

	return { request, notify, initialize, close, proc };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("suite-repo-mcp Agent-Agnostic API compliance", () => {
	/** @type {ReturnType<typeof createSession>} */
	let session;

	beforeEach(async () => {
		session = createSession();
	});

	afterEach(async () => {
		await session.close();
	});

	// -----------------------------------------------------------------------
	// 1. Initialization handshake
	// -----------------------------------------------------------------------

	describe("initialize handshake", () => {
		it("responds with jsonrpc 2.0 and a valid result", async () => {
			const resp = await session.initialize();
			expect(resp).toMatchObject({ jsonrpc: "2.0" });
			expect(resp).toHaveProperty("result");
			expect(resp).not.toHaveProperty("error");
		});

		it("echoes the latest supported protocol version", async () => {
			const resp = await session.initialize("2026-01-26");
			expect(resp.result.protocolVersion).toBe("2026-01-26");
		});

		it("accepts an older supported protocol version", async () => {
			const resp = await session.initialize("2024-11-05");
			expect(resp.result.protocolVersion).toBe("2024-11-05");
		});

		it("falls back to the latest version for an unknown protocol version", async () => {
			const resp = await session.initialize("1900-01-01");
			// Server must still respond successfully (not reject the client)
			expect(resp).not.toHaveProperty("error");
			expect(resp.result.protocolVersion).toBe("2026-01-26");
		});

		it("reports server info with name and version", async () => {
			const resp = await session.initialize();
			expect(resp.result.serverInfo).toMatchObject({
				name: "suite-repo-mcp",
				version: expect.any(String),
			});
		});

		it("advertises tools capability", async () => {
			const resp = await session.initialize();
			expect(resp.result.capabilities).toHaveProperty("tools");
		});
	});

	// -----------------------------------------------------------------------
	// 2. tools/list – standard MCP tool schema
	// -----------------------------------------------------------------------

	describe("tools/list", () => {
		beforeEach(async () => {
			await session.initialize();
		});

		it("returns a tools array", async () => {
			const resp = await session.request("tools/list");
			expect(resp.result).toHaveProperty("tools");
			expect(Array.isArray(resp.result.tools)).toBe(true);
			expect(resp.result.tools.length).toBeGreaterThan(0);
		});

		it("every tool has a non-empty name string", async () => {
			const resp = await session.request("tools/list");
			for (const tool of resp.result.tools) {
				expect(typeof tool.name).toBe("string");
				expect(tool.name.trim().length).toBeGreaterThan(0);
			}
		});

		it("every tool has a non-empty description string", async () => {
			const resp = await session.request("tools/list");
			for (const tool of resp.result.tools) {
				expect(typeof tool.description).toBe("string");
				expect(tool.description.trim().length).toBeGreaterThan(0);
			}
		});

		it("every tool has an inputSchema with type 'object'", async () => {
			const resp = await session.request("tools/list");
			for (const tool of resp.result.tools) {
				expect(tool).toHaveProperty("inputSchema");
				expect(tool.inputSchema.type).toBe("object");
			}
		});

		it("tool names use a consistent namespace prefix", async () => {
			const resp = await session.request("tools/list");
			for (const tool of resp.result.tools) {
				expect(tool.name).toMatch(/^repo\./);
			}
		});

		it("includes the get_workstation_context tool", async () => {
			const resp = await session.request("tools/list");
			const names = resp.result.tools.map((t) => t.name);
			expect(names).toContain("repo.get_workstation_context");
		});
	});

	// -----------------------------------------------------------------------
	// 3. tools/call – standard MCP content response format
	// -----------------------------------------------------------------------

	describe("tools/call response format", () => {
		beforeEach(async () => {
			await session.initialize();
		});

		it("returns a content array with text items", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.get_workstation_context",
				arguments: {},
			});
			expect(resp.result).toHaveProperty("content");
			expect(Array.isArray(resp.result.content)).toBe(true);
			expect(resp.result.content.length).toBeGreaterThan(0);
		});

		it("each content item has a string type field", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.get_workstation_context",
				arguments: {},
			});
			for (const item of resp.result.content) {
				expect(typeof item.type).toBe("string");
			}
		});

		it("text content items carry a non-empty text field", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.get_workstation_context",
				arguments: {},
			});
			const textItems = resp.result.content.filter((i) => i.type === "text");
			expect(textItems.length).toBeGreaterThan(0);
			for (const item of textItems) {
				expect(typeof item.text).toBe("string");
				expect(item.text.trim().length).toBeGreaterThan(0);
			}
		});

		it("isError is absent or false for a successful call", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.get_workstation_context",
				arguments: {},
			});
			const isError = resp.result.isError;
			expect(!isError).toBe(true);
		});

		it("list_directory returns text content for the repo root", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.list_directory",
				arguments: { path: ".", depth: 1 },
			});
			expect(resp.result.content.length).toBeGreaterThan(0);
			const text = resp.result.content
				.filter((i) => i.type === "text")
				.map((i) => i.text)
				.join("");
			// The repo root contains package.json
			expect(text).toContain("package.json");
		});
	});

	// -----------------------------------------------------------------------
	// 4. Error handling – JSON-RPC 2.0 compliance
	// -----------------------------------------------------------------------

	describe("error handling (JSON-RPC 2.0)", () => {
		beforeEach(async () => {
			await session.initialize();
		});

		it("returns JSON-RPC error for an unknown method", async () => {
			const resp = await session.request("nonexistent/method");
			expect(resp).toHaveProperty("error");
			expect(typeof resp.error.code).toBe("number");
			expect(typeof resp.error.message).toBe("string");
			expect(resp).not.toHaveProperty("result");
		});

		it("returns -32601 (method not found) for an unknown method", async () => {
			const resp = await session.request("nonexistent/method");
			expect(resp.error.code).toBe(-32601);
		});

		it("returns JSON-RPC error for an unknown tool name", async () => {
			const resp = await session.request("tools/call", {
				name: "repo.does_not_exist",
				arguments: {},
			});
			expect(resp).toHaveProperty("error");
			expect(resp.error.code).toBe(-32601);
		});

		it("returns error when tools/call is called before initialize", async () => {
			// Create a fresh un-initialized session
			const raw = createSession();
			try {
				const resp = await raw.request("tools/list");
				expect(resp).toHaveProperty("error");
				expect(resp.error.code).toBe(-32002);
			} finally {
				await raw.close();
			}
		});

		it("returns -32602 when tools/call is sent without a name", async () => {
			const resp = await session.request("tools/call", {
				arguments: {},
			});
			expect(resp.error.code).toBe(-32602);
		});
	});

	// -----------------------------------------------------------------------
	// 5. resources/list – non-LLM-specific resource URIs
	// -----------------------------------------------------------------------

	describe("resources/list", () => {
		beforeEach(async () => {
			await session.initialize();
		});

		it("returns a resources array", async () => {
			const resp = await session.request("resources/list");
			expect(resp.result).toHaveProperty("resources");
			expect(Array.isArray(resp.result.resources)).toBe(true);
		});

		it("every resource has a uri, name, and mimeType", async () => {
			const resp = await session.request("resources/list");
			for (const resource of resp.result.resources) {
				expect(typeof resource.uri).toBe("string");
				expect(resource.uri.trim().length).toBeGreaterThan(0);
				expect(typeof resource.name).toBe("string");
				expect(typeof resource.mimeType).toBe("string");
			}
		});

		it("resource URIs use the repo:// scheme", async () => {
			const resp = await session.request("resources/list");
			for (const resource of resp.result.resources) {
				expect(resource.uri).toMatch(/^repo:\/\//);
			}
		});
	});

	// -----------------------------------------------------------------------
	// 6. prompts/list – standard MCP prompt schema
	// -----------------------------------------------------------------------

	describe("prompts/list", () => {
		beforeEach(async () => {
			await session.initialize();
		});

		it("returns a prompts array", async () => {
			const resp = await session.request("prompts/list");
			expect(resp.result).toHaveProperty("prompts");
			expect(Array.isArray(resp.result.prompts)).toBe(true);
			expect(resp.result.prompts.length).toBeGreaterThan(0);
		});

		it("every prompt has a name and description", async () => {
			const resp = await session.request("prompts/list");
			for (const prompt of resp.result.prompts) {
				expect(typeof prompt.name).toBe("string");
				expect(prompt.name.trim().length).toBeGreaterThan(0);
				expect(typeof prompt.description).toBe("string");
			}
		});
	});

	// -----------------------------------------------------------------------
	// 7. Cloud / tool-only mode – capabilities subset
	// -----------------------------------------------------------------------

	describe("cloud agent mode (TOOL_ONLY_CLOUD_AGENT_MODE)", () => {
		/** @type {ReturnType<typeof createSession>} */
		let cloudSession;

		beforeEach(async () => {
			cloudSession = createSession({ SUITE_WORKSTATION_ROLE: "ci" });
			await cloudSession.initialize();
		});

		afterEach(async () => {
			await cloudSession.close();
		});

		it("does not advertise prompts or resources in capabilities", async () => {
			const raw = createSession({ SUITE_WORKSTATION_ROLE: "ci" });
			try {
				const resp = await raw.initialize();
				expect(resp.result.capabilities).not.toHaveProperty("prompts");
				expect(resp.result.capabilities).not.toHaveProperty("resources");
				expect(resp.result.capabilities).toHaveProperty("tools");
			} finally {
				await raw.close();
			}
		});

		it("returns method-not-found for resources/list in cloud mode", async () => {
			const resp = await cloudSession.request("resources/list");
			expect(resp).toHaveProperty("error");
			expect(resp.error.code).toBe(-32601);
		});

		it("returns method-not-found for prompts/list in cloud mode", async () => {
			const resp = await cloudSession.request("prompts/list");
			expect(resp).toHaveProperty("error");
			expect(resp.error.code).toBe(-32601);
		});

		it("still serves tools/list in cloud mode", async () => {
			const resp = await cloudSession.request("tools/list");
			expect(resp.result.tools.length).toBeGreaterThan(0);
		});
	});
});
