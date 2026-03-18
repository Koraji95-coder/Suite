import type { AutoDraftCompareResponse } from "./autodraftService";

type MarkupReviewDraft = {
	category: string;
	markupClass: string;
	color: string;
	text: string;
};

function toTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export const MARKUP_REVIEW_CATEGORY_OPTIONS = [
	"",
	"ADD",
	"DELETE",
	"NOTE",
	"TITLE_BLOCK",
	"UNCLASSIFIED",
];
export const MARKUP_REVIEW_CLASS_OPTIONS = [
	"",
	"text",
	"arrow",
	"cloud",
	"rectangle",
	"unknown",
];
export const MARKUP_REVIEW_COLOR_OPTIONS = [
	"",
	"red",
	"green",
	"blue",
	"yellow",
	"black",
	"unknown",
];

export function normalizeMarkupReviewCategory(value: unknown): string {
	const normalized = toTrimmedString(value).toUpperCase().replace(/[\s-]+/g, "_");
	return MARKUP_REVIEW_CATEGORY_OPTIONS.includes(normalized) ? normalized : "";
}

export function normalizeMarkupReviewClass(value: unknown): string {
	const normalized = toTrimmedString(value).toLowerCase();
	return MARKUP_REVIEW_CLASS_OPTIONS.includes(normalized) ? normalized : "";
}

export function normalizeMarkupReviewColor(value: unknown): string {
	const normalized = toTrimmedString(value).toLowerCase();
	return MARKUP_REVIEW_COLOR_OPTIONS.includes(normalized) ? normalized : "";
}

export function getMarkupReviewMarkup(
	item: AutoDraftCompareResponse["markup_review_queue"][number],
	action: AutoDraftCompareResponse["plan"]["actions"][number] | undefined,
): Record<string, unknown> | null {
	if (item.markup && isRecordValue(item.markup)) {
		return item.markup;
	}
	if (action?.markup && isRecordValue(action.markup)) {
		return action.markup;
	}
	return null;
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildMarkupReviewDraftDefaults(args: {
	item: AutoDraftCompareResponse["markup_review_queue"][number];
	action?: AutoDraftCompareResponse["plan"]["actions"][number];
	storedDraft?: Partial<MarkupReviewDraft>;
}): MarkupReviewDraft {
	const { item, action, storedDraft } = args;
	const markup = getMarkupReviewMarkup(item, action);
	return {
		category:
			toTrimmedString(storedDraft?.category) ||
			normalizeMarkupReviewCategory(item.predicted_category || action?.category || ""),
		markupClass:
			toTrimmedString(storedDraft?.markupClass) ||
			normalizeMarkupReviewClass(markup?.type),
		color:
			toTrimmedString(storedDraft?.color) ||
			normalizeMarkupReviewColor(markup?.color),
		text:
			typeof storedDraft?.text === "string"
				? storedDraft.text
				: typeof markup?.text === "string"
					? markup.text
					: "",
	};
}

export function buildMarkupReviewSubmission(args: {
	item: AutoDraftCompareResponse["markup_review_queue"][number];
	action?: AutoDraftCompareResponse["plan"]["actions"][number];
	compareRequestId: string;
	storedDraft?: Partial<MarkupReviewDraft>;
	note: string;
	mode: "approve" | "unresolved";
}) {
	const { item, action, compareRequestId, storedDraft, note, mode } = args;
	const actionId = String(item.action_id || "").trim();
	const markup = getMarkupReviewMarkup(item, action);
	if (!actionId || !markup) return null;

	const defaults = buildMarkupReviewDraftDefaults({
		item,
		action,
		storedDraft,
	});
	const predictedCategory = normalizeMarkupReviewCategory(
		item.predicted_category || action?.category || defaults.category,
	);
	const predictedMarkupClass = normalizeMarkupReviewClass(markup.type);
	const predictedColor = normalizeMarkupReviewColor(markup.color);
	const predictedText = typeof markup.text === "string" ? markup.text.trim() : "";
	const nextCategory = normalizeMarkupReviewCategory(defaults.category);
	const nextMarkupClass = normalizeMarkupReviewClass(defaults.markupClass);
	const nextColor = normalizeMarkupReviewColor(defaults.color);
	const nextText = defaults.text.trim();
	const hasCorrections =
		nextCategory !== predictedCategory ||
		nextMarkupClass !== predictedMarkupClass ||
		nextColor !== predictedColor ||
		nextText !== predictedText;
	const reviewStatus =
		mode === "unresolved" ? "unresolved" : hasCorrections ? "corrected" : "approved";

	const markupMeta = isRecordValue(markup.meta) ? markup.meta : null;
	const markupMetaPairedAnnotationIds =
		markupMeta && Array.isArray(markupMeta.paired_annotation_ids)
			? markupMeta.paired_annotation_ids.filter(
					(entry): entry is string =>
						typeof entry === "string" && entry.trim().length > 0,
				)
			: [];
	const pairedAnnotationIds = Array.isArray(action?.paired_annotation_ids)
		? action.paired_annotation_ids.filter(
				(entry): entry is string =>
					typeof entry === "string" && entry.trim().length > 0,
			)
		: markupMetaPairedAnnotationIds;

	return {
		actionId,
		reviewStatus,
		successMessage:
			reviewStatus === "corrected"
				? "Markup correction saved."
				: reviewStatus === "approved"
					? "Markup review approved and saved."
					: "Markup marked unresolved and saved.",
		payload: {
			request_id: item.request_id || compareRequestId,
			action_id: actionId,
			review_status: reviewStatus,
			feedback_type: "markup_learning",
			new_text: nextText || predictedText,
			note,
			markup_id:
				item.markup_id || (typeof markup.id === "string" ? markup.id : undefined),
			markup,
			predicted_category: predictedCategory || undefined,
			predicted_action: item.predicted_action || action?.action || undefined,
			corrected_intent:
				mode === "unresolved" || !nextCategory || nextCategory === predictedCategory
					? undefined
					: nextCategory,
			corrected_markup_class:
				mode === "unresolved" ||
				!nextMarkupClass ||
				nextMarkupClass === predictedMarkupClass
					? undefined
					: nextMarkupClass,
			corrected_color:
				mode === "unresolved" || !nextColor || nextColor === predictedColor
					? undefined
					: nextColor,
			corrected_text:
				mode === "unresolved" || nextText === predictedText
					? undefined
					: nextText,
			ocr_text:
				markupMeta &&
				typeof markupMeta.ocr_text === "string" &&
				markupMeta.ocr_text.trim().length > 0
					? markupMeta.ocr_text
					: undefined,
			paired_annotation_ids:
				pairedAnnotationIds.length > 0 ? pairedAnnotationIds : undefined,
			recognition: item.recognition,
			override_reason: note || undefined,
		},
	} as const;
}
