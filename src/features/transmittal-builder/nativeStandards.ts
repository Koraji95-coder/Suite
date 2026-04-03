import {
	hasRecordedProjectStandardsLatestReview,
	isProjectStandardsLatestReviewBlocking,
} from "@/features/standards-checker/latestReview";
import type { ProjectStandardsLatestReview } from "@/features/standards-checker/standardsCheckerModels";

export interface TransmittalNativeStandardsReviewSnapshot {
	hasRecordedReview: boolean;
	isBlocking: boolean;
	overallStatus: "pass" | "warning" | "fail" | null;
	recordedAt: string | null;
	requestId: string | null;
	standardsCategory: string | null;
	selectedStandardCount: number;
	inspectedDrawingCount: number;
	warningCount: number;
	providerPath: string | null;
	summaryMessage: string;
}

function pluralize(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function buildTransmittalNativeStandardsReviewSnapshot(
	review: ProjectStandardsLatestReview | null | undefined,
): TransmittalNativeStandardsReviewSnapshot | null {
	if (!review) {
		return null;
	}

	const hasRecordedReview = hasRecordedProjectStandardsLatestReview(review);
	const inspectedDrawingCount = Math.max(
		0,
		Number(review.summary.inspectedDrawingCount || review.summary.drawingCount || 0),
	);
	const warningResult =
		review.results.find((entry) => entry.status === "fail") ||
		review.results.find((entry) => entry.status === "warning");
	const summaryMessage = hasRecordedReview
		? warningResult?.message ||
			review.warnings[0] ||
			(review.overallStatus === "pass"
				? "Native project standards review passed."
				: review.overallStatus === "fail"
					? "Native project standards review found blockers before issue."
					: "Native project standards review returned follow-up items before issue.")
		: "No native project standards review has been recorded yet.";

	return {
		hasRecordedReview,
		isBlocking: hasRecordedReview
			? isProjectStandardsLatestReviewBlocking(review)
			: false,
		overallStatus: hasRecordedReview ? review.overallStatus : null,
		recordedAt: hasRecordedReview ? review.recordedAt : null,
		requestId: hasRecordedReview ? String(review.requestId || "").trim() || null : null,
		standardsCategory: hasRecordedReview
			? String(review.standardsCategory || "").trim() || null
			: null,
		selectedStandardCount: hasRecordedReview
			? review.selectedStandardIds.length
			: 0,
		inspectedDrawingCount,
		warningCount: hasRecordedReview ? review.warnings.length : 0,
		providerPath:
			hasRecordedReview &&
			typeof review.summary.providerPath === "string" &&
			review.summary.providerPath.trim()
				? review.summary.providerPath.trim()
				: null,
		summaryMessage,
	};
}

export function formatTransmittalNativeStandardsCompactValue(
	review: TransmittalNativeStandardsReviewSnapshot | null,
): string {
	if (!review || !review.hasRecordedReview) {
		return "Not recorded";
	}

	const parts = [review.overallStatus?.toUpperCase() ?? "UNKNOWN"];
	if (review.inspectedDrawingCount > 0) {
		parts.push(pluralize(review.inspectedDrawingCount, "drawing"));
	}
	if (review.selectedStandardCount > 0) {
		parts.push(pluralize(review.selectedStandardCount, "standard"));
	}
	return parts.join(" | ");
}

export function formatTransmittalNativeStandardsStatus(args: {
	review: TransmittalNativeStandardsReviewSnapshot | null;
	loading?: boolean;
	error?: string | null;
}): string {
	if (args.loading) {
		return "Loading the latest native project standards review.";
	}

	if (args.error) {
		return `Unable to load the latest native project standards review. ${args.error}`;
	}

	if (!args.review || !args.review.hasRecordedReview) {
		return "No native project standards review has been recorded yet.";
	}

	if (args.review.overallStatus === "pass") {
		return "Native project standards review passed for the current package.";
	}

	return args.review.summaryMessage;
}
