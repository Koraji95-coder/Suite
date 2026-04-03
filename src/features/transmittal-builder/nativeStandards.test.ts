import { describe, expect, it } from "vitest";
import type { ProjectStandardsLatestReview } from "@/features/standards-checker/standardsCheckerModels";
import {
	buildTransmittalNativeStandardsReviewSnapshot,
	formatTransmittalNativeStandardsCompactValue,
	formatTransmittalNativeStandardsStatus,
} from "./nativeStandards";

function createLatestReview(
	overrides: Partial<ProjectStandardsLatestReview> = {},
): ProjectStandardsLatestReview {
	return {
		id: "review-1",
		projectId: "project-1",
		userId: "user-1",
		requestId: "request-1",
		recordedAt: "2026-04-03T08:00:00.000Z",
		cadFamilyId: "autocad-electrical",
		standardsCategory: "NEC",
		selectedStandardIds: ["nec-210", "nec-250"],
		results: [
			{
				standardId: "nec-210",
				status: "warning",
				message: "Layer naming needs follow-up.",
			},
		],
		warnings: ["No DWS file was found."],
		summary: {
			inspectedDrawingCount: 3,
			providerPath: "dotnet+inproc",
		},
		meta: {},
		overallStatus: "warning",
		...overrides,
	};
}

describe("transmittal native standards helpers", () => {
	it("builds a compact snapshot from a recorded review", () => {
		const snapshot = buildTransmittalNativeStandardsReviewSnapshot(
			createLatestReview(),
		);

		expect(snapshot).toMatchObject({
			hasRecordedReview: true,
			isBlocking: true,
			overallStatus: "warning",
			selectedStandardCount: 2,
			inspectedDrawingCount: 3,
			providerPath: "dotnet+inproc",
		});
		expect(snapshot?.summaryMessage).toBe("Layer naming needs follow-up.");
		expect(formatTransmittalNativeStandardsCompactValue(snapshot)).toBe(
			"WARNING | 3 drawings | 2 standards",
		);
	});

	it("treats a missing request id as not recorded yet", () => {
		const snapshot = buildTransmittalNativeStandardsReviewSnapshot(
			createLatestReview({
				requestId: "",
				selectedStandardIds: [],
				results: [],
				warnings: [],
				summary: {},
				overallStatus: "warning",
			}),
		);

		expect(snapshot).toMatchObject({
			hasRecordedReview: false,
			isBlocking: false,
			overallStatus: null,
		});
		expect(formatTransmittalNativeStandardsCompactValue(snapshot)).toBe(
			"Not recorded",
		);
		expect(
			formatTransmittalNativeStandardsStatus({ review: snapshot }),
		).toBe("No native project standards review has been recorded yet.");
	});

	it("formats loading, error, and pass states for the right rail", () => {
		const passSnapshot = buildTransmittalNativeStandardsReviewSnapshot(
			createLatestReview({
				results: [
					{
						standardId: "nec-210",
						status: "pass",
						message: "All checks passed.",
					},
				],
				warnings: [],
				overallStatus: "pass",
			}),
		);

		expect(
			formatTransmittalNativeStandardsStatus({
				review: null,
				loading: true,
			}),
		).toBe("Loading the latest native project standards review.");
		expect(
			formatTransmittalNativeStandardsStatus({
				review: null,
				error: "Backend unavailable.",
			}),
		).toBe(
			"Unable to load the latest native project standards review. Backend unavailable.",
		);
		expect(
			formatTransmittalNativeStandardsStatus({
				review: passSnapshot,
			}),
		).toBe("Native project standards review passed for the current package.");
	});
});
