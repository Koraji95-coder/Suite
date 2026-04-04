import type {
	AutoDraftComparePrepareResponse,
	AutoDraftCompareResponse,
} from "./autodraftService";

export type PrepareStatus = {
	color: "muted" | "warning" | "success";
	message: string;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildCompareActionById(
	compareResult: AutoDraftCompareResponse | null,
) {
	const lookup = new Map<
		string,
		AutoDraftCompareResponse["plan"]["actions"][number]
	>();
	if (!compareResult) return lookup;
	for (const action of compareResult.plan.actions) {
		lookup.set(action.id, action);
	}
	return lookup;
}

export function buildReviewQueue(compareResult: AutoDraftCompareResponse | null) {
	return compareResult ? compareResult.review_queue : [];
}

export function buildMarkupReviewQueue(
	compareResult: AutoDraftCompareResponse | null,
) {
	return compareResult ? compareResult.markup_review_queue : [];
}

export function buildPrepareColorSourcesSummary(
	prepareResult: AutoDraftComparePrepareResponse | null,
) {
	if (!prepareResult) return null;
	const counters = new Map<string, number>();
	let knownColors = 0;
	for (const markup of prepareResult.markups) {
		if (markup.color !== "unknown") {
			knownColors += 1;
		}
		const meta = isRecordValue(markup.meta) ? markup.meta : null;
		const source =
			meta &&
			typeof meta.color_source === "string" &&
			meta.color_source.trim().length > 0
				? meta.color_source.trim().toUpperCase()
				: "UNKNOWN";
		counters.set(source, (counters.get(source) || 0) + 1);
	}
	const sourceSummary = Array.from(counters.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([source, count]) => `${source}:${count}`)
		.join(" | ");
	return `Color extraction: known ${knownColors}/${prepareResult.markups.length} | sources ${sourceSummary || "none"}`;
}

export function buildPrepareTextFallbackSummary(
	prepareResult: AutoDraftComparePrepareResponse | null,
) {
	const extraction = prepareResult?.pdf_metadata.page.text_extraction;
	if (!extraction) return null;
	if (
		!extraction.used &&
		extraction.embedded_line_count <= 0 &&
		extraction.ocr_line_count <= 0
	) {
		return null;
	}
	if (!extraction.used) {
		return `Text fallback scanned but not used | embedded lines ${extraction.embedded_line_count} | OCR lines ${extraction.ocr_line_count}`;
	}
	return `Text fallback: ${extraction.source} | selected ${extraction.selected_line_count} of ${Math.max(extraction.candidate_count, extraction.selected_line_count)} candidates | embedded lines ${extraction.embedded_line_count} | OCR lines ${extraction.ocr_line_count}`;
}

export function buildPrepareStatus(args: {
	loadingPdf: boolean;
	loadingPrepare: boolean;
	prepareError: string | null;
	prepareResult: AutoDraftComparePrepareResponse | null;
}): PrepareStatus | null {
	const { loadingPdf, loadingPrepare, prepareError, prepareResult } = args;
	if (loadingPdf) {
		return {
			color: "muted",
			message: "Loading PDF preview...",
		};
	}
	if (loadingPrepare) {
		return {
			color: "muted",
			message: "Preparing markups...",
		};
	}
	if (prepareError) {
		return {
			color: "warning",
			message: prepareError,
		};
	}
	if (!prepareResult) {
		return null;
	}
	if (prepareResult.markups.length === 0) {
		return {
			color: "warning",
			message: `Prepared 0 markups from page ${prepareResult.page.index + 1}. No supported annotations were detected.`,
		};
	}
	return {
		color: "success",
		message: `Prepared ${prepareResult.markups.length} markups from page ${prepareResult.page.index + 1}.`,
	};
}
