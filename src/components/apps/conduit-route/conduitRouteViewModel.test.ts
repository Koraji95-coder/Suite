import { describe, expect, it } from "vitest";
import {
	buildCadCrewReviewPrompt,
	createConduitRouteViewModel,
	inferObstacleTypeFromLayer,
} from "./conduitRouteViewModel";

describe("conduitRouteViewModel", () => {
	it("infers obstacle types from layer names", () => {
		expect(inferObstacleTypeFromLayer("S-FNDN-PRIMARY")).toBe("foundation");
		expect(inferObstacleTypeFromLayer("A-WALL-EXT")).toBe("building");
		expect(inferObstacleTypeFromLayer("ROAD-MAIN")).toBe("road");
	});

	it("builds route summaries and default CAD sync gate state", () => {
		const viewModel = createConduitRouteViewModel({
			workspace: "yard",
			cableType: "DC",
			wireFunction: "Positive",
			activeObstacles: [],
			clearance: 18,
			mode: "plan_view",
			startPoint: null,
			hoverPoint: null,
			routes: [
				{
					id: "route-1",
					ref: "R-01",
					mode: "plan_view",
					cableType: "DC",
					wireFunction: "Positive",
					color: { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
					start: { x: 10, y: 20 },
					end: { x: 80, y: 20 },
					path: [
						{ x: 10, y: 20 },
						{ x: 80, y: 20 },
					],
					length: 70,
					bendCount: 0,
					bendDegrees: 0,
					tag: null,
					createdAt: 1,
				},
			],
			selectedRouteId: "route-1",
			routeBackcheckReport: null,
			crewReviewEntries: [],
			obstacleLayerRules: [
				{ layerName: "A-WALL", obstacleType: "building" },
			],
			sectionPreset: "entry",
		});

		expect(viewModel.heroTitle).toBe("Conduit Route Command Deck");
		expect(viewModel.routeStats).toMatchObject({
			total: 1,
			totalLength: 70,
			totalBends: 0,
			warningCount: 0,
		});
		expect(viewModel.selectedRoute?.ref).toBe("R-01");
		expect(viewModel.obstacleLayerTypeOverrides).toEqual({
			"A-WALL": "building",
		});
		expect(viewModel.cadSyncGate.label).toBe("Backcheck required");
	});

	it("builds crew-review prompt with deterministic sections", () => {
		const prompt = buildCadCrewReviewPrompt({
			profileId: "gridsage",
			report: {
				success: true,
				summary: {
					total_routes: 1,
					pass_count: 0,
					warn_count: 0,
					fail_count: 1,
				},
				findings: [
					{
						routeId: "route-1",
						ref: "R-01",
						mode: "plan_view",
						status: "fail",
						issues: [
							{
								code: "COLLISION",
								severity: "fail",
								message: "Route collides with obstacle",
							},
						],
						suggestions: [],
						stats: {
							length: 70,
							bend_count: 2,
							bend_degrees: 180,
							point_count: 3,
							segment_count: 2,
							diagonal_segment_count: 0,
							collision_count: 1,
						},
					},
				],
			},
			draftsmithReview: "Fix the offset near route R-01.",
		});

		expect(prompt).toContain("GridSage");
		expect(prompt).toContain("Return exactly three sections");
		expect(prompt).toContain("Draftsmith prior review");
		expect(prompt).toContain("\"route\":\"R-01\"");
	});
});
