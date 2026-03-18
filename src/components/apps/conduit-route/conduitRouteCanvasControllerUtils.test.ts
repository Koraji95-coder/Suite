import { describe, expect, it } from "vitest";
import type { ConduitRouteRecord } from "./conduitRouteTypes";
import {
	buildConduitScheduleRows,
	buildNextConduitRef,
} from "./conduitRouteCanvasControllerUtils";

function makeRoute(overrides: Partial<ConduitRouteRecord>): ConduitRouteRecord {
	return {
		id: "route-1",
		ref: "DC-001",
		mode: "plan_view",
		cableType: "DC",
		wireFunction: "PV+",
		color: {
			code: "RD",
			hex: "#f00",
			stroke: "#f00",
			aci: 1,
		},
		start: { x: 10.2, y: 20.8 },
		end: { x: 99.4, y: 199.2 },
		path: [
			{ x: 10.2, y: 20.8 },
			{ x: 99.4, y: 199.2 },
		],
		length: 120.4,
		bendCount: 1,
		bendDegrees: 90,
		tag: null,
		createdAt: 1,
		...overrides,
	};
}

describe("conduitRouteCanvasControllerUtils", () => {
	it("builds schedule rows sorted by newest route first", () => {
		const older = makeRoute({
			id: "route-old",
			ref: "DC-001",
			createdAt: 100,
		});
		const newer = makeRoute({
			id: "route-new",
			ref: "DC-002",
			createdAt: 200,
			start: { x: 1.1, y: 2.2 },
			end: { x: 3.3, y: 4.4 },
			length: 33.6,
		});

		const rows = buildConduitScheduleRows([older, newer]);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.id).toBe("route-new");
		expect(rows[0]?.from).toBe("1,2");
		expect(rows[0]?.to).toBe("3,4");
		expect(rows[0]?.length).toBe(34);
		expect(rows[1]?.id).toBe("route-old");
	});

	it("builds deterministic next route ref by cable type counter", () => {
		expect(buildNextConduitRef("DC", { AC: 7, DC: 3 })).toBe("DC-003");
		expect(buildNextConduitRef("AC", { AC: 12, DC: 9 })).toBe("AC-012");
	});
});
