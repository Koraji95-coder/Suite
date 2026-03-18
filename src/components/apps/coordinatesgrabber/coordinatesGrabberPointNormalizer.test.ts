import { describe, expect, it } from "vitest";
import { normalizeCoordinatePoints } from "./coordinatesGrabberPointNormalizer";

describe("normalizeCoordinatePoints", () => {
	it("normalizes explicit point payload values", () => {
		const result = normalizeCoordinatePoints(
			[
				{
					east: "10.5" as unknown as number,
					elevation: 15,
					id: "P-1",
					layer: "LAYER-A",
					north: 20,
				},
			],
			{
				layerName: "fallback-layer",
				pointPrefix: "P",
				pointsCreated: 1,
				startNumber: 1,
			},
		);

		expect(result).toEqual([
			{
				east: 10.5,
				elevation: 15,
				id: "P-1",
				layer: "LAYER-A",
				north: 20,
			},
		]);
	});

	it("builds fallback points when response has no points payload", () => {
		const result = normalizeCoordinatePoints(undefined, {
			layerName: "Layer-1",
			pointPrefix: "Q",
			pointsCreated: 3,
			startNumber: 7,
		});

		expect(result).toEqual([
			{ east: 0, elevation: 0, id: "Q7", layer: "Layer-1", north: 0 },
			{ east: 0, elevation: 0, id: "Q8", layer: "Layer-1", north: 0 },
			{ east: 0, elevation: 0, id: "Q9", layer: "Layer-1", north: 0 },
		]);
	});
});
