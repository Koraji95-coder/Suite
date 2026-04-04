import { describe, expect, it } from "vitest";
import { resolveViteProxyTargets } from "../vite.proxy-targets.ts";

describe("resolveViteProxyTargets", () => {
	it("falls back to localhost defaults when no env values are set", () => {
		expect(resolveViteProxyTargets({})).toEqual({
			backendUrl: "http://127.0.0.1:5000",
		});
	});

	it("prefers container-only proxy targets when they are configured", () => {
		expect(
			resolveViteProxyTargets({
				BACKEND_PROXY_TARGET: "http://backend:5000",
				VITE_BACKEND_URL: "http://127.0.0.1:5000",
			}),
		).toEqual({
			backendUrl: "http://backend:5000",
		});
	});
});
