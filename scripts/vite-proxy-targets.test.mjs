import { describe, expect, it } from "vitest";
import { resolveViteProxyTargets } from "../vite.proxy-targets.ts";

describe("resolveViteProxyTargets", () => {
	it("falls back to localhost defaults when no env values are set", () => {
		expect(resolveViteProxyTargets({})).toEqual({
			backendUrl: "http://127.0.0.1:5000",
			gatewayProxyTarget: "http://127.0.0.1:3000",
		});
	});

	it("prefers container-only proxy targets when they are configured", () => {
		expect(
			resolveViteProxyTargets({
				BACKEND_PROXY_TARGET: "http://backend:5000",
				AGENT_GATEWAY_PROXY_TARGET: "http://gateway:3001",
				VITE_BACKEND_URL: "http://127.0.0.1:5000",
				VITE_AGENT_GATEWAY_URL: "http://127.0.0.1:3001",
			}),
		).toEqual({
			backendUrl: "http://backend:5000",
			gatewayProxyTarget: "http://gateway:3001",
		});
	});

	it("uses the existing public env vars when proxy-only values are absent", () => {
		expect(
			resolveViteProxyTargets({
				VITE_BACKEND_URL: "http://127.0.0.1:5000",
				AGENT_GATEWAY_URL: "http://127.0.0.1:3001",
			}),
		).toEqual({
			backendUrl: "http://127.0.0.1:5000",
			gatewayProxyTarget: "http://127.0.0.1:3001",
		});
	});
});
