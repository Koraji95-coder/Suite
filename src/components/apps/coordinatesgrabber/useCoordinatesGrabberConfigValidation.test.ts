import { describe, expect, it } from "vitest";
import {
	validateCoordinatesGrabberConfig,
} from "./useCoordinatesGrabberConfigValidation";
import { DEFAULT_STATE } from "./CoordinatesGrabberModels";

describe("validateCoordinatesGrabberConfig", () => {
	it("returns no errors for a valid layer-search config", () => {
		const errors = validateCoordinatesGrabberConfig({
			...DEFAULT_STATE,
			layerName: "E-GRID",
			selectedLayers: ["E-GRID"],
			pointPrefix: "P",
			startNumber: 1,
			decimalPlaces: 3,
			refScale: 1,
		});
		expect(errors).toEqual([]);
	});

	it("returns expected validation errors for invalid config", () => {
		const errors = validateCoordinatesGrabberConfig({
			...DEFAULT_STATE,
			mode: "blocks",
			layerName: "",
			selectedLayers: [],
			pointPrefix: "ABCDEFGHIJK",
			startNumber: 0,
			decimalPlaces: 13,
			refScale: 0,
		});

		expect(errors).toContain(
			"Only layer-based extraction is currently supported in this workflow",
		);
		expect(errors).toContain("Add at least one layer before starting extraction");
		expect(errors).toContain("Start number must be at least 1");
		expect(errors).toContain("Decimal places must be between 0 and 12");
		expect(errors).toContain("Point prefix must be 10 characters or less");
		expect(errors).toContain("Scale must be greater than 0");
	});
});

