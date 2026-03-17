import { describe, expect, it } from "vitest";
import { resolveTerminalLabelSyncEndpointPath } from "./conduitTerminalService";

describe("resolveTerminalLabelSyncEndpointPath", () => {
	it("uses the bridge endpoint for dotnet fallback com when the sender is ready", () => {
		expect(
			resolveTerminalLabelSyncEndpointPath({
				mode: "auto",
				providerConfigured: "dotnet_fallback_com",
				dotnetSenderReady: true,
			}),
		).toBe("/api/conduit-route/bridge/terminal-labels/sync");
	});

	it("falls back to legacy sync when auto mode is not on a dotnet provider", () => {
		expect(
			resolveTerminalLabelSyncEndpointPath({
				mode: "auto",
				providerConfigured: "com",
				dotnetSenderReady: true,
			}),
		).toBe("/api/conduit-route/terminal-labels/sync");
	});

	it("honors an explicit bridge override", () => {
		expect(
			resolveTerminalLabelSyncEndpointPath({
				mode: "bridge",
				providerConfigured: "com",
				dotnetSenderReady: false,
			}),
		).toBe("/api/conduit-route/bridge/terminal-labels/sync");
	});
});
