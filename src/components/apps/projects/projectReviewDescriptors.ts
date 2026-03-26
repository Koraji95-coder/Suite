import type { DrawingAnnotation } from "@/components/apps/standards-checker/standardsDrawingModels";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";

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
			? "This drawing is still relying on filename fallback metadata."
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
