import type { DrawingAnnotation } from "@/features/standards-checker/standardsDrawingModels";
import type { ProjectStandardsLatestReview } from "@/features/standards-checker/standardsCheckerModels";
import type { ProjectDocumentMetadataRow } from "@/features/project-documents";

type ProjectReviewFingerprintItemType = "title-block" | "standards";

interface ProjectReviewFingerprintParts {
	type: ProjectReviewFingerprintItemType;
	entityId: string;
	title: string;
	summary: string;
	detail: string;
}

export interface ProjectReviewItemDescriptor {
	itemId: string;
	entityId: string;
	title: string;
	summary: string;
	detail: string;
	fingerprint: string;
}

export function buildProjectReviewInboxFingerprint(
	item: ProjectReviewFingerprintParts,
) {
	return [
		item.type,
		item.entityId,
		item.title.trim().toLowerCase(),
		item.summary.trim().toLowerCase(),
		item.detail.trim().toLowerCase(),
	].join("::");
}

export function buildTitleBlockReviewDescriptor(
	row: ProjectDocumentMetadataRow,
): ProjectReviewItemDescriptor {
	const summary =
		row.issues[0] ||
		row.warnings[0] ||
		(row.reviewState === "fallback"
			? "This drawing is using filename-based metadata and still needs title block confirmation."
			: "This drawing still needs title block review.");
	const detail = row.drawingNumber
		? `${row.drawingNumber} • ${row.title || "Untitled drawing"}`
		: row.title || "Title block review needed";
	const entityId = row.id;
	const title = row.fileName;

	return {
		itemId: `title-block:${row.id}`,
		entityId,
		title,
		summary,
		detail,
		fingerprint: buildProjectReviewInboxFingerprint({
			type: "title-block",
			entityId,
			title,
			summary,
			detail,
		}),
	};
}

export function buildStandardsReviewDescriptor(
	row: DrawingAnnotation,
): ProjectReviewItemDescriptor {
	const summary =
		row.annotations[0]?.message ||
		(row.qa_status === "pending"
			? "Standards review has not been completed yet."
			: `${row.issues_found} standards issue${
					row.issues_found === 1 ? "" : "s"
				} need attention.`);
	const detail = `${row.qa_status} • ${row.rules_applied.length} rule${
		row.rules_applied.length === 1 ? "" : "s"
	} applied`;
	const entityId = row.id;
	const title = row.drawing_name || "Standards review";

	return {
		itemId: `standards:${row.id}`,
		entityId,
		title,
		summary,
		detail,
		fingerprint: buildProjectReviewInboxFingerprint({
			type: "standards",
			entityId,
			title,
			summary,
			detail,
		}),
	};
}

export function buildNativeStandardsReviewDescriptor(
	review: ProjectStandardsLatestReview,
): ProjectReviewItemDescriptor {
	const failingResult = review.results.find((row) => row.status === "fail");
	const warningResult =
		failingResult ?? review.results.find((row) => row.status === "warning");
	const summary =
		warningResult?.message ||
		review.warnings[0] ||
		(review.overallStatus === "pass"
			? "Latest native project standards review passed."
			: review.overallStatus === "fail"
				? "Latest native project standards review found blockers."
				: "Latest native project standards review needs follow-up.");
	const inspectedDrawings =
		Number(review.summary.inspectedDrawingCount || review.summary.drawingCount || 0) ||
		0;
	const detailParts = [
		review.standardsCategory,
		review.selectedStandardIds.length > 0
			? `${review.selectedStandardIds.length} standard${
					review.selectedStandardIds.length === 1 ? "" : "s"
				}`
			: "",
		inspectedDrawings > 0
			? `${inspectedDrawings} drawing${
					inspectedDrawings === 1 ? "" : "s"
				} inspected`
			: "",
	]
		.map((value) => value.trim())
		.filter(Boolean);
	const detail = detailParts.join(" • ") || "Project-level native standards review";
	const entityId =
		String(review.requestId || "").trim() ||
		String(review.id || "").trim() ||
		`project-standards-review:${review.projectId}`;
	const title = "Project standards review";

	return {
		itemId: `standards:native:${review.projectId}`,
		entityId,
		title,
		summary,
		detail,
		fingerprint: buildProjectReviewInboxFingerprint({
			type: "standards",
			entityId,
			title,
			summary,
			detail,
		}),
	};
}
