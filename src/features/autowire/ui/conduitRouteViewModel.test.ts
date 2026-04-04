import { describe, expect, it } from "vitest";
import {
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
});
