import { describe, expect, it } from "vitest";
import {
	conductorKey,
	coordinateBucketKey,
	dataSignature,
	placementBaseKey,
} from "./gridGeneratorStateShared";

describe("gridGeneratorStateShared", () => {
	it("builds orientation-insensitive conductor keys", () => {
		const a = conductorKey({
			label: "A",
			length: 10,
			x1: 1,
			y1: 2,
			x2: 3,
			y2: 4,
			diameter: 0.5,
			sort_order: 0,
		});
		const b = conductorKey({
			label: "B",
			length: 10,
			x1: 3,
			y1: 4,
			x2: 1,
			y2: 2,
			diameter: 0.5,
			sort_order: 0,
		});
		expect(a).toBe(b);
	});

	it("builds stable placement and coordinate keys", () => {
		const placementKey = placementBaseKey({
			type: "TEE",
			grid_x: 12.3456789,
			grid_y: 10.0000001,
			autocad_x: 0,
			autocad_y: 0,
			rotation_deg: 0,
		});
		const bucketKey = coordinateBucketKey(12.3456789, 10.0000001);

		expect(placementKey.startsWith("TEE|")).toBe(true);
		expect(placementKey.endsWith(bucketKey)).toBe(true);
	});

	it("changes data signature when rods or conductors change", () => {
		const baseline = dataSignature(
			[{ label: "R1", grid_x: 0, grid_y: 0, depth: 10, diameter: 0.75, sort_order: 0 }],
			[
				{
					label: "C1",
					length: 5,
					x1: 0,
					y1: 0,
					x2: 5,
					y2: 0,
					diameter: 0.5,
					sort_order: 0,
				},
			],
		);

		const changed = dataSignature(
			[{ label: "R1", grid_x: 0, grid_y: 1, depth: 10, diameter: 0.75, sort_order: 0 }],
			[
				{
					label: "C1",
					length: 5,
					x1: 0,
					y1: 0,
					x2: 5,
					y2: 0,
					diameter: 0.5,
					sort_order: 0,
				},
			],
		);

		expect(changed).not.toBe(baseline);
	});
});
