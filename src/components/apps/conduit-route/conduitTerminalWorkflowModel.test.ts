import { describe, expect, it } from "vitest";
import {
	backcheckStatusLabel,
	cadLayerForRoute,
	createConduitTerminalViewModel,
	resolveCadProviderPath,
} from "./conduitTerminalWorkflowModel";

describe("conduitTerminalWorkflowModel", () => {
	it("derives terminal workflow summaries and sorted route rows", () => {
		const viewModel = createConduitTerminalViewModel({
			scanData: {
				drawing: { name: "test.dwg", units: "in" },
				panels: {
					P1: {
						fullName: "Panel 1",
						color: "#22c55e",
						sides: {
							LEFT: {
								strips: [
									{
										stripId: "TB1",
										stripNumber: 1,
										terminalCount: 2,
										x: 100,
										y: 120,
									},
								],
							},
						},
					},
				},
			},
			routeType: "conductor",
			cableType: "DC",
			wireFunction: "Positive",
			routes: [
				{
					id: "route-1",
					ref: "W-01",
					routeType: "conductor",
					cableType: "DC",
					wireFunction: "Positive",
					color: { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
					fromTerminalId: "TB1:T01",
					toTerminalId: "TB1:T02",
					fromLabel: "TB1-1",
					toLabel: "TB1-2",
					path: [
						{ x: 1, y: 1 },
						{ x: 5, y: 1 },
					],
					length: 4,
					bendCount: 0,
					bendDegrees: 0,
					createdAt: 10,
					cadSyncStatus: "failed",
					cadBackcheckStatus: "fail",
				},
				{
					id: "route-2",
					ref: "W-02",
					routeType: "conductor",
					cableType: "DC",
					wireFunction: "Positive",
					color: { code: "BK", hex: "#444444", stroke: "#6b7280", aci: 7 },
					fromTerminalId: "TB1:T02",
					toTerminalId: "TB1:T01",
					fromLabel: "TB1-2",
					toLabel: "TB1-1",
					path: [
						{ x: 1, y: 2 },
						{ x: 5, y: 2 },
					],
					length: 4,
					bendCount: 5,
					bendDegrees: 450,
					createdAt: 20,
					cadSyncStatus: "synced",
					cadBackcheckStatus: "pass",
				},
			],
			selectedRouteId: "route-2",
			fromTerminalId: "TB1:T01",
			hoverTerminalId: "TB1:T02",
			cadStatus: {
				connected: true,
				autocad_running: true,
				drawing_open: true,
				drawing_name: "test.dwg",
				conduit_route_provider: {
					configured: "dotnet",
					dotnet_enabled: true,
				},
			},
			preflightChecking: false,
		});

		expect(viewModel.panelRows).toHaveLength(1);
		expect(viewModel.routeRows[0]?.ref).toBe("W-02");
		expect(viewModel.routeStats).toMatchObject({
			total: 2,
			failed: 1,
			synced: 1,
			warnings: 1,
			backcheckFail: 1,
			backcheckPass: 1,
		});
		expect(viewModel.selectedRoute?.ref).toBe("W-02");
		expect(viewModel.activeFromTerminal?.id).toBe("TB1:T01");
		expect(viewModel.activeHoverTerminal?.id).toBe("TB1:T02");
		expect(viewModel.cadPreflightLabel).toBe("CAD Drawing Ready");
		expect(viewModel.cadBackcheckGateLabel).toBe("Backcheck Failures Present");
	});

	it("preserves CAD label helpers and provider resolution", () => {
		expect(backcheckStatusLabel("overridden")).toBe("Backcheck overridden");
		expect(
			cadLayerForRoute({
				id: "route-1",
				ref: "W-01",
				routeType: "conductor",
				cableType: "AC",
				wireFunction: "Phase A",
				color: { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
				fromTerminalId: "A",
				toTerminalId: "B",
				fromLabel: "A",
				toLabel: "B",
				path: [],
				length: 0,
				bendCount: 0,
				bendDegrees: 0,
				createdAt: 0,
			}),
		).toBe("SUITE_WIRE_AC_RD");
		expect(resolveCadProviderPath({ source: "autocad" })).toBe("com");
		expect(resolveCadProviderPath({ providerPath: "dotnet" })).toBe("dotnet");
	});
});
