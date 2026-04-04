import { describe, expect, it } from "vitest";
import type {
	AutoDraftComparePrepareResponse,
	AutoDraftCompareResponse,
} from "./autodraftService";
import {
	buildCompareActionById,
	buildPrepareColorSourcesSummary,
	buildPrepareStatus,
	buildPrepareTextFallbackSummary,
} from "./autoDraftCompareSelectors";

describe("autoDraftCompareSelectors", () => {
	it("builds an action lookup keyed by action id", () => {
		const compareResult = {
			plan: {
				actions: [
					{ id: "a-1", category: "NOTE", action: "noop", confidence: 0.9 },
					{ id: "a-2", category: "NOTE", action: "noop", confidence: 0.9 },
				],
			},
		} as unknown as AutoDraftCompareResponse;

		const lookup = buildCompareActionById(compareResult);
		expect(lookup.get("a-1")?.id).toBe("a-1");
		expect(lookup.get("a-2")?.id).toBe("a-2");
	});

	it("summarizes prepare color-source counts", () => {
		const prepareResult = {
			markups: [
				{ color: "red", meta: { color_source: "ocr" } },
				{ color: "unknown", meta: { color_source: "embedded" } },
			],
		} as unknown as AutoDraftComparePrepareResponse;

		const summary = buildPrepareColorSourcesSummary(prepareResult);
		expect(summary).toContain("known 1/2");
		expect(summary).toContain("EMBEDDED:1");
		expect(summary).toContain("OCR:1");
	});

	it("reports text fallback summary from prepare metadata", () => {
		const prepareResult = {
			pdf_metadata: {
				page: {
					text_extraction: {
						used: true,
						source: "ocr",
						selected_line_count: 6,
						candidate_count: 8,
						embedded_line_count: 2,
						ocr_line_count: 10,
					},
				},
			},
		} as unknown as AutoDraftComparePrepareResponse;

		const summary = buildPrepareTextFallbackSummary(prepareResult);
		expect(summary).toContain("Text fallback: ocr");
		expect(summary).toContain("selected 6 of 8 candidates");
	});

	it("builds a warning status for empty prepare results", () => {
		const prepareResult = {
			page: { index: 0 },
			markups: [],
		} as unknown as AutoDraftComparePrepareResponse;

		expect(
			buildPrepareStatus({
				loadingPdf: false,
				loadingPrepare: false,
				prepareError: null,
				prepareResult,
			}),
		).toEqual({
			color: "warning",
			message:
				"Prepared 0 markups from page 1. No supported annotations were detected.",
		});
	});
});
