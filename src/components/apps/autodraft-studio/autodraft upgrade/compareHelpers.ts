// src/components/apps/autodraft/AutoDraftComparePanel/compareHelpers.ts
//
// Pure functions extracted from AutoDraftComparePanel.tsx.
// No React imports. No side effects. Independently testable.

import type { PageViewport } from "pdfjs-dist";
import type {
	AutoDraftComparePoint,
	AutoDraftCompareRoi,
	AutoDraftCompareResponse,
	AutoDraftLearningModel,
	AutoDraftLearningEvaluation,
} from "../autodraftService";

// ── Type guards ──────────────────────────────────────────

export function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── String helpers ───────────────────────────────────────

export function toTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function toSafeIdToken(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "item";
}

// ── Numeric helpers ──────────────────────────────────────

export function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export function clampPercent(value: number): number {
	if (value < 0) return 0;
	if (value > 100) return 100;
	return value;
}

export const PDF_PREVIEW_MIN_ZOOM = 0.4;
export const PDF_PREVIEW_MAX_ZOOM = 4.0;
export const PDF_PREVIEW_ZOOM_STEP = 1.15;

export function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return 1;
	if (value < PDF_PREVIEW_MIN_ZOOM) return PDF_PREVIEW_MIN_ZOOM;
	if (value > PDF_PREVIEW_MAX_ZOOM) return PDF_PREVIEW_MAX_ZOOM;
	return value;
}

// ── Geometry helpers ─────────────────────────────────────

export function buildRoiFromPointPair(
	start: AutoDraftComparePoint,
	end: AutoDraftComparePoint,
): AutoDraftCompareRoi {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	const width = Math.max(0.0001, Math.abs(end.x - start.x));
	const height = Math.max(0.0001, Math.abs(end.y - start.y));
	return { x, y, width, height };
}

export type PointProjection = {
	leftPercent: number;
	topPercent: number;
};

export function mapCanvasClientPointToPdf(args: {
	clientX: number;
	clientY: number;
	rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
	canvasWidth: number;
	canvasHeight: number;
	viewport: Pick<PageViewport, "convertToPdfPoint">;
}): AutoDraftComparePoint | null {
	const { clientX, clientY, rect, canvasWidth, canvasHeight, viewport } = args;
	if (
		canvasWidth <= 0 ||
		canvasHeight <= 0 ||
		rect.width <= 0 ||
		rect.height <= 0
	) {
		return null;
	}
	const renderX = (clientX - rect.left) * (canvasWidth / rect.width);
	const renderY = (clientY - rect.top) * (canvasHeight / rect.height);
	const [pdfX, pdfY] = viewport.convertToPdfPoint(renderX, renderY);
	if (!Number.isFinite(pdfX) || !Number.isFinite(pdfY)) {
		return null;
	}
	return { x: pdfX, y: pdfY };
}

export function mapPdfPointToCanvasPercent(args: {
	pdfPoint: AutoDraftComparePoint;
	canvasWidth: number;
	canvasHeight: number;
	viewport: Pick<PageViewport, "convertToViewportPoint">;
}): PointProjection | null {
	const { pdfPoint, canvasWidth, canvasHeight, viewport } = args;
	if (canvasWidth <= 0 || canvasHeight <= 0) {
		return null;
	}
	const [viewportX, viewportY] = viewport.convertToViewportPoint(
		pdfPoint.x,
		pdfPoint.y,
	);
	if (!Number.isFinite(viewportX) || !Number.isFinite(viewportY)) {
		return null;
	}
	return {
		leftPercent: clampPercent((viewportX / canvasWidth) * 100),
		topPercent: clampPercent((viewportY / canvasHeight) * 100),
	};
}

// ── Markup review normalization ──────────────────────────

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

export type MarkupReviewDraft = {
	category: string;
	markupClass: string;
	color: string;
	text: string;
};

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

// ── Color diagnostics ────────────────────────────────────

export function formatMarkupColorDiagnostic(
	markup: Record<string, unknown>,
): string | null {
	const color =
		typeof markup.color === "string" && markup.color.trim().length > 0
			? markup.color.trim()
			: "";
	const meta = isRecordValue(markup.meta) ? markup.meta : null;
	const colorHex =
		meta &&
		typeof meta.color_hex === "string" &&
		meta.color_hex.trim().length > 0
			? meta.color_hex.trim().toUpperCase()
			: "";
	const colorSource =
		meta &&
		typeof meta.color_source === "string" &&
		meta.color_source.trim().length > 0
			? meta.color_source.trim().toUpperCase()
			: "";
	if (!color && !colorHex && !colorSource) return null;
	const tokens = [color || "unknown"];
	if (colorHex) tokens.push(colorHex);
	if (colorSource) tokens.push(`via ${colorSource}`);
	return tokens.join(" | ");
}

// ── Learning summaries ───────────────────────────────────

export function formatLearningMetricTokens(metrics: Record<string, unknown>): string[] {
	const accuracy = toFiniteNumber(metrics.accuracy);
	const macroF1 = toFiniteNumber(metrics.macro_f1);
	const tokens: string[] = [];
	if (accuracy !== null) tokens.push(`acc ${accuracy.toFixed(2)}`);
	if (macroF1 !== null) tokens.push(`f1 ${macroF1.toFixed(2)}`);
	return tokens;
}

export function summarizeDomainTrainingResult(
	results: Array<Record<string, unknown>>,
	args: {
		domain: string;
		label: string;
	},
): { color: "success" | "warning"; message: string } {
	const { domain, label } = args;
	const result =
		results.find(
			(entry) => toTrimmedString(entry.domain).toLowerCase() === domain,
		) || results[0];
	if (!result) {
		return {
			color: "warning",
			message: `${label} model training returned no results.`,
		};
	}
	const ok = Boolean(result.ok);
	if (!ok) {
		return {
			color: "warning",
			message:
				toTrimmedString(result.message) ||
				`${label} model training did not complete successfully.`,
		};
	}
	const version = toTrimmedString(result.version);
	const sampleCount = toFiniteNumber(result.sample_count);
	const metrics = isRecordValue(result.metrics) ? result.metrics : null;
	const tokens = [`${label} model trained`];
	if (version) tokens.push(version);
	if (sampleCount !== null) tokens.push(`samples ${sampleCount}`);
	if (metrics) {
		tokens.push(...formatLearningMetricTokens(metrics));
	}
	return {
		color: "success",
		message: tokens.join(" | "),
	};
}

export function summarizeMarkupTrainingResult(
	results: Array<Record<string, unknown>>,
): { color: "success" | "warning"; message: string } {
	return summarizeDomainTrainingResult(results, {
		domain: "autodraft_markup",
		label: "Markup",
	});
}

export function summarizeReplacementTrainingResult(
	results: Array<Record<string, unknown>>,
): { color: "success" | "warning"; message: string } {
	return summarizeDomainTrainingResult(results, {
		domain: "autodraft_replacement",
		label: "Replacement",
	});
}

export function describeLearningModel(
	label: string,
	model: AutoDraftLearningModel | null,
): string {
	if (!model) {
		return `No active ${label.toLowerCase()} model yet.`;
	}
	const sampleCount = toFiniteNumber(model.metadata.example_count);
	const tokens = [`Active ${label} model`, model.version];
	if (sampleCount !== null) tokens.push(`samples ${sampleCount}`);
	tokens.push(...formatLearningMetricTokens(model.metrics));
	return tokens.join(" | ");
}

export function describeLearningEvaluation(
	label: string,
	evaluation: AutoDraftLearningEvaluation | null,
): string {
	if (!evaluation) {
		return `No ${label.toLowerCase()} evaluation history yet.`;
	}
	const tokens = [`Latest ${label} eval`, evaluation.version];
	tokens.push(evaluation.promoted ? "promoted" : "held");
	if (evaluation.sampleCount > 0) {
		tokens.push(`samples ${evaluation.sampleCount}`);
	}
	tokens.push(...formatLearningMetricTokens(evaluation.metrics));
	return tokens.join(" | ");
}
