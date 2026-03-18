import type {
	AutoDraftComparePoint,
	AutoDraftComparePrepareResponse,
	AutoDraftLearningEvaluation,
	AutoDraftLearningModel,
	AutoDraftReplacementTuning,
} from "./autodraftService";

export type CadPointInput = {
	x: string;
	y: string;
};

export type ReplacementTuningInput = {
	unresolvedConfidenceThreshold: string;
	ambiguityMarginThreshold: string;
	searchRadiusMultiplier: string;
};

export type LearningSummaryState = {
	loading: boolean;
	model: AutoDraftLearningModel | null;
	evaluation: AutoDraftLearningEvaluation | null;
	error: string | null;
};

export const DEFAULT_CAD_POINTS: CadPointInput[] = [
	{ x: "", y: "" },
	{ x: "", y: "" },
];

export const DEFAULT_REPLACEMENT_TUNING: ReplacementTuningInput = {
	unresolvedConfidenceThreshold: "0.36",
	ambiguityMarginThreshold: "0.08",
	searchRadiusMultiplier: "2.5",
};

export const EMPTY_LEARNING_SUMMARY: LearningSummaryState = {
	loading: false,
	model: null,
	evaluation: null,
	error: null,
};

export function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export function formatLearningMetricTokens(
	metrics: Record<string, unknown>,
): string[] {
	const accuracy = toFiniteNumber(metrics.accuracy);
	const macroF1 = toFiniteNumber(metrics.macro_f1);
	const tokens: string[] = [];
	if (accuracy !== null) tokens.push(`acc ${accuracy.toFixed(2)}`);
	if (macroF1 !== null) tokens.push(`f1 ${macroF1.toFixed(2)}`);
	return tokens;
}

function toTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeDomainTrainingResult(
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

export function parseReplacementTuningInput(
	replacementTuning: ReplacementTuningInput,
): AutoDraftReplacementTuning | null {
	const unresolvedThreshold = Number(
		replacementTuning.unresolvedConfidenceThreshold,
	);
	const ambiguityMargin = Number(replacementTuning.ambiguityMarginThreshold);
	const radiusMultiplier = Number(replacementTuning.searchRadiusMultiplier);
	if (
		!Number.isFinite(unresolvedThreshold) ||
		!Number.isFinite(ambiguityMargin) ||
		!Number.isFinite(radiusMultiplier)
	) {
		return null;
	}
	if (
		unresolvedThreshold < 0 ||
		unresolvedThreshold > 1 ||
		ambiguityMargin < 0 ||
		ambiguityMargin > 1 ||
		radiusMultiplier < 0.5 ||
		radiusMultiplier > 8
	) {
		return null;
	}
	return {
		unresolved_confidence_threshold: unresolvedThreshold,
		ambiguity_margin_threshold: ambiguityMargin,
		search_radius_multiplier: radiusMultiplier,
		min_search_radius: 24,
	};
}

export function parseCadPointInputs(
	cadPoints: CadPointInput[],
): AutoDraftComparePoint[] | null {
	const parsed = cadPoints.map((entry) => ({
		x: Number(entry.x),
		y: Number(entry.y),
	}));
	if (
		parsed.some(
			(entry) => !Number.isFinite(entry.x) || !Number.isFinite(entry.y),
		)
	) {
		return null;
	}
	return parsed;
}

export function buildRoiAroundPreparedMarkups(
	prepareResult: AutoDraftComparePrepareResponse | null,
) {
	if (!prepareResult || prepareResult.markups.length === 0) return null;
	let left: number | null = null;
	let bottom: number | null = null;
	let right: number | null = null;
	let top: number | null = null;
	for (const markup of prepareResult.markups) {
		const bounds = markup.bounds;
		if (!bounds) continue;
		const x = Number(bounds.x);
		const y = Number(bounds.y);
		const width = Number(bounds.width);
		const height = Number(bounds.height);
		if (
			!Number.isFinite(x) ||
			!Number.isFinite(y) ||
			!Number.isFinite(width) ||
			!Number.isFinite(height) ||
			width <= 0 ||
			height <= 0
		) {
			continue;
		}
		const nextRight = x + width;
		const nextTop = y + height;
		left = left === null ? x : Math.min(left, x);
		bottom = bottom === null ? y : Math.min(bottom, y);
		right = right === null ? nextRight : Math.max(right, nextRight);
		top = top === null ? nextTop : Math.max(top, nextTop);
	}
	if (left === null || bottom === null || right === null || top === null) {
		return null;
	}
	return {
		x: left,
		y: bottom,
		width: Math.max(0.0001, right - left),
		height: Math.max(0.0001, top - bottom),
	};
}
