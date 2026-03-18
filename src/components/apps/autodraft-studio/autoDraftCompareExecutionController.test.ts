import { describe, expect, it } from "vitest";
import {
	buildCompareExecutionPayload,
	validateComparePreflight,
	validatePreparePreflight,
} from "./autoDraftCompareExecutionController";

describe("autoDraftCompareExecutionController", () => {
	it("validates prepare preflight", () => {
		expect(
			validatePreparePreflight({
				hasPdfFile: false,
				pageCount: 0,
				pageIndex: 0,
			}),
		).toBe("Choose a PDF file first.");

		expect(
			validatePreparePreflight({
				hasPdfFile: true,
				pageCount: 2,
				pageIndex: 5,
			}),
		).toBe("Page number must be between 1 and 2.");
	});

	it("validates compare preflight manual requirements", () => {
		const prepareResult = {
			markups: [],
			calibration_seed: { scale_x: 1, scale_y: 1, offset_x: 0, offset_y: 0 },
		} as never;

		const result = validateComparePreflight({
			prepareResult,
			pdfPoints: [{ x: 1, y: 1 }],
			calibrationMode: "manual",
			manualOverride: false,
			parseCadPoints: () => null,
			parseReplacementTuning: () => ({}),
		});

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Manual calibration");
	});

	it("builds compare payload with optional point fields", () => {
		const payload = buildCompareExecutionPayload({
			engine: "auto",
			tolerance: "medium",
			calibrationMode: "auto",
			manualOverride: false,
			prepareResult: {
				markups: [{ id: "m1" }],
				calibration_seed: { scale_x: 1, scale_y: 1, offset_x: 0, offset_y: 0 },
			} as never,
			pdfPoints: [
				{ x: 10, y: 20 },
				{ x: 30, y: 40 },
			],
			cadPoints: null,
			roiBounds: null,
			replacementTuning: { confidenceThreshold: 0.75 },
		});

		expect(payload.toleranceProfile).toBe("medium");
		expect(payload.pdfPoints).toBeUndefined();
		expect(payload.cadPoints).toBeUndefined();
		expect(payload.replacementTuning).toEqual({ confidenceThreshold: 0.75 });
	});
});
