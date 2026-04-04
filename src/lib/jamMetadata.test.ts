import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const metadataSpy = vi.fn();

vi.mock("@jam.dev/sdk", () => ({
	jam: {
		metadata: metadataSpy,
	},
}));

describe("jamMetadata", () => {
	beforeEach(() => {
		metadataSpy.mockReset();
		vi.resetModules();
	});

	afterEach(async () => {
		const { resetSuiteJamMetadataState } = await import(
			"@/lib/jamMetadataState"
		);
		resetSuiteJamMetadataState();
	});

	it("registers a curated Jam metadata snapshot", async () => {
		const {
			resetSuiteJamMetadataState,
			updateSuiteJamAuthContext,
			updateSuiteJamDiagnostics,
			updateSuiteJamRouteContext,
		} = await import("@/lib/jamMetadataState");
		const { installSuiteJamMetadata } = await import("@/lib/jamMetadata");

		resetSuiteJamMetadataState();
		updateSuiteJamRouteContext({
			hash: "#compare",
			pathname: "/app/projects/proj-123",
			search: "?projectId=proj-123&view=overview&token=secret",
		});
		updateSuiteJamAuthContext({
			displayName: "Dev User",
			email: "dev@example.com",
			isAuthenticated: true,
			loading: false,
			profileHydrating: false,
			sessionAuthMethod: "passkey",
			userId: "user-123",
		});
		updateSuiteJamDiagnostics([
			{
				context: "/app/projects/proj-123",
				id: "diag-1",
				message: "Backend request timed out",
				occurrences: 2,
				severity: "error",
				source: "fetch",
				timestamp: "2026-04-04T00:00:00.000Z",
				title: "Project load timed out",
			},
		]);

		installSuiteJamMetadata({ enabled: true });

		expect(metadataSpy).toHaveBeenCalledTimes(1);
		const metadataFactory = metadataSpy.mock.calls[0]?.[0];
		expect(typeof metadataFactory).toBe("function");

		const snapshot = metadataFactory();
		expect(snapshot).toMatchObject({
			app: {
				name: "Suite",
			},
			auth: {
				displayName: "Dev User",
				email: "dev@example.com",
				isAuthenticated: true,
				loading: false,
				profileHydrating: false,
				sessionAuthMethod: "passkey",
				userId: "user-123",
			},
			diagnostics: {
				actionableCount: 1,
				bySeverity: {
					error: 1,
					info: 0,
					warning: 0,
				},
				recent: [
					expect.objectContaining({
						context: "/app/projects/proj-123",
						message: "Backend request timed out",
						title: "Project load timed out",
					}),
				],
			},
			route: {
				hasHash: true,
				pathname: "/app/projects/proj-123",
				query: {
					projectId: "proj-123",
					view: "overview",
				},
				routeFamily: "app/projects",
			},
		});
		expect(JSON.stringify(snapshot)).not.toContain("token");
		expect(JSON.stringify(snapshot)).not.toContain("secret");
	});

	it("does not re-register Jam metadata after the first install", async () => {
		const { installSuiteJamMetadata } = await import("@/lib/jamMetadata");

		installSuiteJamMetadata({ enabled: true });
		installSuiteJamMetadata({ enabled: true });

		expect(metadataSpy).toHaveBeenCalledTimes(1);
	});
});
