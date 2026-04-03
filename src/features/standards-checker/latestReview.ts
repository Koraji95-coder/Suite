import type { ProjectStandardsLatestReview } from "./standardsCheckerModels";

export function hasRecordedProjectStandardsLatestReview(
	review: ProjectStandardsLatestReview | null | undefined,
): review is ProjectStandardsLatestReview {
	if (!review) {
		return false;
	}
	return Boolean(
		String(review.requestId || "").trim() ||
			review.selectedStandardIds.length > 0 ||
			review.results.length > 0 ||
			review.warnings.length > 0,
	);
}

export function isProjectStandardsLatestReviewBlocking(
	review: ProjectStandardsLatestReview | null | undefined,
) {
	return (
		hasRecordedProjectStandardsLatestReview(review) &&
		review.overallStatus !== "pass"
	);
}
