import { describe, expect, it } from "vitest";
import type { AutoDraftComparePrepareResponse } from "./autodraftService";
import {
	buildRoiAroundPreparedMarkups,
	parseCadPointInputs,
	parseReplacementTuningInput,
} from "./autoDraftCompareHelpers";

describe("autoDraftCompareHelpers", () => {
	it("parses replacement tuning inputs inside allowed ranges", () => {
		const parsed = parseReplacementTuningInput({
			unresolvedConfidenceThreshold: "0.35",
			ambiguityMarginThreshold: "0.09",
			searchRadiusMultiplier: "2.2",
		});

		expect(parsed).toEqual({
			unresolved_confidence_threshold: 0.35,
			ambiguity_margin_threshold: 0.09,
			search_radius_multiplier: 2.2,
			min_search_radius: 24,
		});
	});

	it("returns null when replacement tuning values are out of bounds", () => {
		const parsed = parseReplacementTuningInput({
			unresolvedConfidenceThreshold: "1.2",
			ambiguityMarginThreshold: "0.09",
			searchRadiusMultiplier: "2.2",
		});

		expect(parsed).toBeNull();
	});

	it("builds ROI bounds from prepared markups", () => {
		const prepareResult = {
			markups: [
				{
					id: "a",
					type: "cloud",
					color: "red",
					text: "",
					bounds: { x: 10, y: 20, width: 40, height: 30 },
				},
				{
					id: "b",
					type: "cloud",
					color: "red",
					text: "",
					bounds: { x: 35, y: 10, width: 10, height: 15 },
				},
			],
		} as unknown as AutoDraftComparePrepareResponse;

		expect(buildRoiAroundPreparedMarkups(prepareResult)).toEqual({
			x: 10,
			y: 10,
			width: 40,
			height: 40,
		});
	});

	it("parses manual CAD point text values", () => {
		expect(
			parseCadPointInputs([
				{ x: "100", y: "200" },
				{ x: "150.5", y: "320.25" },
			]),
		).toEqual([
			{ x: 100, y: 200 },
			{ x: 150.5, y: 320.25 },
		]);
	});
});
