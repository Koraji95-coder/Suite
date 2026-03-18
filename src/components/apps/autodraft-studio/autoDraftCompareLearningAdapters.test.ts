import { describe, expect, it } from "vitest";
import {
	buildJsonDownloadPackage,
	parseCompareFeedbackImportPayload,
} from "./autoDraftCompareLearningAdapters";

describe("autoDraftCompareLearningAdapters", () => {
	it("builds named json package", () => {
		const pack = buildJsonDownloadPackage({ hello: "world" }, "file.json");
		expect(pack.filename).toBe("file.json");
		expect(pack.text).toContain("\"hello\": \"world\"");
	});

	it("normalizes feedback import payload arrays", () => {
		const payload = parseCompareFeedbackImportPayload({
			events: [{ a: 1 }],
			pairs: "bad",
			metrics: [],
		});
		expect(payload.events).toHaveLength(1);
		expect(payload.pairs).toEqual([]);
		expect(payload.metrics).toEqual([]);
	});
});
