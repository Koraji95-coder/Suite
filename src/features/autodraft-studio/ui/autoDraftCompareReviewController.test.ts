import { describe, expect, it } from "vitest";
import {
	buildMarkupReviewDraftDefaults,
	buildMarkupReviewSubmission,
} from "./autoDraftCompareReviewController";

describe("autoDraftCompareReviewController", () => {
	const item = {
		action_id: "a1",
		request_id: "r1",
		predicted_category: "add",
		predicted_action: "replace",
		markup: {
			id: "m1",
			type: "text",
			color: "red",
			text: "OLD",
			meta: { ocr_text: "OCR-OLD", paired_annotation_ids: ["ann-1"] },
		},
		recognition: { source: "ocr" },
	} as never;

	it("builds defaults from prediction and markup", () => {
		const defaults = buildMarkupReviewDraftDefaults({ item });
		expect(defaults.category).toBe("ADD");
		expect(defaults.markupClass).toBe("text");
		expect(defaults.color).toBe("red");
		expect(defaults.text).toBe("OLD");
	});

	it("builds corrected markup submission payload", () => {
		const submission = buildMarkupReviewSubmission({
			item,
			compareRequestId: "run-1",
			storedDraft: {
				category: "NOTE",
				markupClass: "cloud",
				color: "blue",
				text: "NEW",
			},
			note: "manual correction",
			mode: "approve",
		});

		expect(submission?.reviewStatus).toBe("corrected");
		expect(submission?.payload.corrected_intent).toBe("NOTE");
		expect(submission?.payload.corrected_markup_class).toBe("cloud");
		expect(submission?.payload.corrected_color).toBe("blue");
		expect(submission?.payload.corrected_text).toBe("NEW");
	});
});
