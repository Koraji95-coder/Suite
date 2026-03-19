import { logger } from "@/lib/logger";
import { createAutoDraftApiClient } from "./autodraftApiClient";
import {
	requestAutoDraftExportCompareFeedback,
	requestAutoDraftExportReviewedRunBundle,
	requestAutoDraftImportCompareFeedback,
	requestAutoDraftPrepareCompare,
	requestAutoDraftRunCompare,
	requestAutoDraftSubmitCompareFeedback,
} from "./autodraftCompareRequests";
import {
	requestAutoDraftBackcheck,
	requestAutoDraftExecute,
	requestAutoDraftHealth,
	requestAutoDraftPlan,
	requestAutoDraftRules,
} from "./autodraftCoreRequests";
import {
	requestAutoDraftLearningEvaluations,
	requestAutoDraftLearningModels,
	requestAutoDraftTrainLearning,
} from "./autodraftLearningRequests";
import { type AutoDraftRule, RULE_LIBRARY } from "./autodraftData";

export type AutoDraftHealth = {
	ok: boolean;
	app?: string;
	mode?: string;
	dotnet?: {
		configured: boolean;
		reachable: boolean;
		base_url?: string | null;
		error?: string | null;
	};
	elapsed_ms?: number;
};

export type MarkupInput = {
	type?: string;
	color?: string;
	text?: string;
	bounds?: { x: number; y: number; width: number; height: number };
	meta?: Record<string, unknown>;
	[key: string]: unknown;
};

export type AutoDraftAction = {
	id: string;
	rule_id: string | null;
	category: string;
	action: string;
	confidence: number;
	status: "proposed" | "review" | string;
	markup: MarkupInput;
	paired_annotation_ids?: string[];
	replacement?: AutoDraftReplacementMetadata;
};

export type AutoDraftPlanResponse = {
	ok: boolean;
	source: string;
	actions: AutoDraftAction[];
	summary: {
		total_markups: number;
		actions_proposed: number;
		classified: number;
		needs_review: number;
	};
};

export type AutoDraftExecuteResponse = {
	ok: boolean;
	source: string;
	job_id: string;
	status: string;
	accepted: number;
	skipped: number;
	dry_run: boolean;
	message?: string;
	requestId?: string;
	warnings?: string[];
	meta?: AutoDraftExecuteMeta;
};

export type AutoDraftExecuteWorkflowContext = {
	projectId?: string;
	projectName?: string;
	lane?: string;
	phase?: string;
	workflowId?: string;
	itemId?: string;
	summary?: string;
};

export type AutoDraftExecuteRevisionContext = {
	projectId?: string;
	fileId?: string;
	drawingNumber?: string;
	title?: string;
	revision?: string;
	previousRevision?: string;
	issueSummary?: string;
	notes?: string;
};

export type AutoDraftExecutionReceipt = {
	id?: string;
	requestId?: string;
	jobId?: string;
	providerPath?: string;
	source?: string;
	status?: string;
	dryRun?: boolean;
	accepted?: number;
	skipped?: number;
	drawingName?: string | null;
	drawingPath?: string | null;
	createdAt?: string;
	workflowContext?: Record<string, unknown>;
	revisionContext?: Record<string, unknown>;
	createdHandles?: string[];
	titleBlockUpdates?: Record<string, unknown>[];
	textReplacementUpdates?: Record<string, unknown>[];
	textDeleteUpdates?: Record<string, unknown>[];
	dimensionTextUpdates?: Record<string, unknown>[];
};

export type AutoDraftExecuteMeta = {
	mode?: string;
	previewReadyCount?: number;
	providerPath?: string;
	requestId?: string;
	bridgeRequestId?: string;
	bridgeMs?: number;
	cad?: Record<string, unknown>;
	commit?: Record<string, unknown>;
	executionReceipt?: AutoDraftExecutionReceipt;
};

export type AutoDraftBackcheckFinding = {
	id: string;
	action_id: string;
	status: "pass" | "warn" | "fail" | string;
	severity: "low" | "medium" | "high" | string;
	category: string;
	notes: string[];
	suggestions: string[];
	paired_annotation_ids?: string[];
	replacement?: AutoDraftReplacementMetadata;
};

export type AutoDraftReplacementScoreComponents = {
	pointer?: number;
	overlap?: number;
	distance?: number;
	pair_boost?: number;
	same_text_penalty?: number;
	base_score?: number;
	agent_boost?: number;
	pre_model_score?: number;
	model_adjustment?: number;
	final_score?: number;
};

export type AutoDraftReplacementSelectionModel = {
	label: string;
	confidence: number;
	modelVersion: string;
	featureSource: string;
	source: string;
	reasonCodes: string[];
	applied: boolean;
	adjustment: number;
};

export type AutoDraftReplacementCandidate = {
	entity_id: string;
	text: string;
	score: number;
	distance: number;
	pointer_hit: boolean;
	overlap: boolean;
	pair_hit_count: number;
	score_components?: AutoDraftReplacementScoreComponents;
	selection_model?: AutoDraftReplacementSelectionModel;
};

export type AutoDraftReplacementMetadata = {
	new_text: string;
	old_text?: string | null;
	target_entity_id?: string | null;
	confidence: number;
	status: "resolved" | "ambiguous" | "unresolved" | string;
	target_source?: string;
	candidates: AutoDraftReplacementCandidate[];
};

export type AutoDraftReplacementTuning = {
	unresolved_confidence_threshold: number;
	ambiguity_margin_threshold: number;
	search_radius_multiplier: number;
	min_search_radius: number;
};

export type AutoDraftCompareReviewItem = {
	id: string;
	request_id: string;
	action_id: string;
	status: "resolved" | "ambiguous" | "unresolved" | string;
	confidence: number;
	new_text: string;
	selected_old_text?: string | null;
	selected_entity_id?: string | null;
	message: string;
	candidates: AutoDraftReplacementCandidate[];
	agent_hint?: {
		candidate_boosts?: Record<string, number>;
		intent_hint?: string | null;
		roi_hint?: AutoDraftCompareRoi | null;
		rationale?: string | null;
	};
	shadow?: {
		action_id: string;
		suggested_old_text?: string | null;
		suggested_entity_id?: string | null;
		confidence?: number | null;
		rationale?: string | null;
	};
};

export type AutoDraftMarkupReviewItem = {
	id: string;
	request_id: string;
	action_id: string;
	status: "needs_review" | string;
	confidence: number;
	message: string;
	markup_id?: string | null;
	markup?: MarkupInput;
	recognition?: AutoDraftRecognitionMetadata;
	predicted_category?: string | null;
	predicted_action?: string | null;
	reason_codes: string[];
};

export type AutoDraftBackcheckResponse = {
	ok: boolean;
	success: boolean;
	requestId: string;
	source: string;
	mode: string;
	cad: {
		available: boolean;
		degraded: boolean;
		source?: string;
		entity_count: number;
		locked_layer_count: number;
	};
	summary: {
		total_actions: number;
		pass_count: number;
		warn_count: number;
		fail_count: number;
	};
	warnings: string[];
	findings: AutoDraftBackcheckFinding[];
};

export type AutoDraftCompareEngine = "auto" | "python" | "dotnet";
export type AutoDraftToleranceProfile = "strict" | "medium" | "loose";
export type AutoDraftCalibrationMode = "auto" | "manual";
export type AutoDraftAgentReviewMode = "off" | "pre";

export type AutoDraftComparePoint = {
	x: number;
	y: number;
};

export type AutoDraftCompareRoi = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type AutoDraftRecognitionMetadata = {
	label?: string;
	modelVersion: string;
	confidence: number;
	source: string;
	featureSource: string;
	reasonCodes: string[];
	needsReview: boolean;
	accepted: boolean;
	overrideReason?: string | null;
	agentHintsApplied?: boolean;
};

export type AutoDraftAutoCalibration = {
	available: boolean;
	used: boolean;
	status: "ready" | "needs_manual" | "failed" | string;
	confidence: number;
	method: string;
	quality_notes: string[];
	suggested_pdf_points: AutoDraftComparePoint[];
	suggested_cad_points: AutoDraftComparePoint[];
	matched_anchor_count?: number;
	anchor_count?: number;
	residual_error?: number;
};

export type AutoDraftPreparedMarkup = {
	id: string;
	type: string;
	color: string;
	text: string;
	bounds?: { x: number; y: number; width: number; height: number };
	layer?: string;
	meta?: Record<string, unknown>;
	recognition?: AutoDraftRecognitionMetadata;
};

export type AutoDraftComparePrepareResponse = {
	ok: boolean;
	success: boolean;
	requestId: string;
	source: string;
	page: {
		index: number;
		total_pages: number;
		width: number;
		height: number;
	};
	calibration_seed: {
		available: boolean;
		source: string;
		scale_hint?: number | null;
		rotation_hint_deg?: number | null;
		ratio_text?: string | null;
		notes: string[];
	};
	auto_calibration: AutoDraftAutoCalibration;
	warnings: string[];
	recognition?: AutoDraftRecognitionMetadata;
	pdf_metadata: {
		bluebeam_detected: boolean;
		detection_reasons: string[];
		document: {
			title: string | null;
			author: string | null;
			subject: string | null;
			creator: string | null;
			producer: string | null;
			keywords: string | null;
			created_utc: string | null;
			modified_utc: string | null;
			custom: Record<string, string>;
		};
		page: {
			index: number;
			rotation_deg: number;
			user_unit: number | null;
			media_box: { width: number; height: number };
			crop_box: { x: number; y: number; width: number; height: number } | null;
			annotation_counts: {
				total: number;
				supported: number;
				unsupported: number;
				by_subtype: Record<string, number>;
			};
			text_extraction?: {
				used: boolean;
				source: string;
				feature_source: string;
				render_available: boolean;
				ocr_available: boolean;
				embedded_line_count: number;
				ocr_line_count: number;
				candidate_count: number;
				selected_line_count: number;
				skipped_without_bounds: number;
				selected_black_text_count: number;
			};
		};
	};
	markups: AutoDraftPreparedMarkup[];
};

export type AutoDraftCompareResponse = {
	ok: boolean;
	success: boolean;
	requestId: string;
	source: string;
	mode: string;
	tolerance_profile: AutoDraftToleranceProfile;
	calibration_mode?: AutoDraftCalibrationMode;
	engine: {
		requested: AutoDraftCompareEngine;
		used: AutoDraftCompareEngine;
		used_fallback: boolean;
	};
	calibration: {
		pdf_points: AutoDraftComparePoint[];
		cad_points: AutoDraftComparePoint[];
		scale: number;
		rotation_deg: number;
		translation: AutoDraftComparePoint;
	};
	auto_calibration?: AutoDraftAutoCalibration;
	roi?: AutoDraftCompareRoi;
	cad_roi?: AutoDraftCompareRoi;
	recognition?: AutoDraftRecognitionMetadata;
	plan: {
		source: string;
		summary: AutoDraftPlanResponse["summary"];
		actions: AutoDraftAction[];
	};
	backcheck: AutoDraftBackcheckResponse;
	summary: {
		status: "pass" | "warn" | "fail" | string;
		total_markups: number;
		total_actions: number;
		pass_count: number;
		warn_count: number;
		fail_count: number;
		cad_context_available: boolean;
	};
	replacement_tuning?: AutoDraftReplacementTuning;
	markup_review_queue: AutoDraftMarkupReviewItem[];
	review_queue: AutoDraftCompareReviewItem[];
	agent_pre_review?: {
		enabled: boolean;
		attempted: boolean;
		available: boolean;
		used: boolean;
		profile: string;
		latency_ms?: number | null;
		hints_count: number;
		error?: string | null;
		auth?: {
			mode: string;
			token_source: string;
			refresh_attempted: boolean;
		};
		preflight?: {
			checked: boolean;
			available: boolean;
			expected_model?: string | null;
			reason?: string | null;
		};
	};
	shadow_advisor?: {
		enabled: boolean;
		available: boolean;
		profile: string;
		error?: string | null;
		auth?: {
			mode: string;
			token_source: string;
			refresh_attempted: boolean;
		};
		reviews: Array<{
			action_id: string;
			suggested_old_text?: string | null;
			suggested_entity_id?: string | null;
			confidence?: number | null;
			rationale?: string | null;
		}>;
	};
};

export type AutoDraftCompareFeedbackResponse = {
	ok: boolean;
	success: boolean;
	requestId: string;
	source: string;
	stored?: number;
	metrics?: Record<string, number>;
	learning?: Record<string, number>;
	mode?: "merge" | "replace";
	imported?: {
		events: number;
		pairs: number;
		metrics: number;
	};
};

export type AutoDraftCompareFeedbackItemInput = {
	action_id: string;
	review_status: "approved" | "corrected" | "unresolved";
	new_text: string;
	selected_old_text?: string;
	selected_entity_id?: string;
	confidence?: number;
	note?: string;
	candidates?: AutoDraftReplacementCandidate[];
	selected_candidate?: AutoDraftReplacementCandidate;
	agent_suggestion?: AutoDraftCompareReviewItem["agent_hint"];
	accepted_agent_suggestion?: boolean;
	request_id?: string;
	feedback_type?: "replacement_review" | "markup_learning" | string;
	markup_id?: string;
	markup?: MarkupInput;
	predicted_category?: string;
	predicted_action?: string;
	corrected_markup_class?: string;
	corrected_intent?: string;
	corrected_color?: string;
	paired_annotation_ids?: string[];
	ocr_text?: string;
	corrected_text?: string;
	recognition?: AutoDraftRecognitionMetadata;
	override_reason?: string;
};

export type AutoDraftLearningModel = {
	domain: string;
	version: string;
	artifactPath: string;
	metrics: Record<string, unknown>;
	metadata: Record<string, unknown>;
	active: boolean;
	createdUtc: string;
};

export type AutoDraftLearningEvaluation = {
	domain: string;
	version: string;
	metrics: Record<string, unknown>;
	confusion: Record<string, unknown>;
	promoted: boolean;
	sampleCount: number;
	createdUtc: string;
};

export type AutoDraftReviewedRunBundle = {
	schema: string;
	bundleId: string;
	requestId: string;
	capturedUtc: string;
	source: string;
	label?: string;
	notes?: string;
	summary: Record<string, unknown>;
	feedback: {
		items: Record<string, unknown>[];
		eventCount: number;
		latestEventUtc?: string;
	};
	learningExamples: Record<string, Record<string, unknown>[]>;
	prepare: Record<string, unknown>;
	compare: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_COMPARE_TIMEOUT_MS = 120_000;
const DEFAULT_REPLACEMENT_TUNING: AutoDraftReplacementTuning = {
	unresolved_confidence_threshold: 0.36,
	ambiguity_margin_threshold: 0.08,
	search_radius_multiplier: 2.5,
	min_search_radius: 24,
};

const FALLBACK_HEALTH: AutoDraftHealth = {
	ok: false,
	mode: "offline",
	dotnet: {
		configured: false,
		reachable: false,
		error: "Backend unavailable.",
	},
};

const FALLBACK_RULE_BY_CATEGORY: Record<
	AutoDraftRule["category"],
	AutoDraftRule
> = {
	DELETE:
		RULE_LIBRARY.find((rule) => rule.category === "DELETE") ?? RULE_LIBRARY[0],
	ADD: RULE_LIBRARY.find((rule) => rule.category === "ADD") ?? RULE_LIBRARY[0],
	NOTE:
		RULE_LIBRARY.find((rule) => rule.category === "NOTE") ?? RULE_LIBRARY[0],
	SWAP:
		RULE_LIBRARY.find((rule) => rule.category === "SWAP") ?? RULE_LIBRARY[0],
	TITLE_BLOCK:
		RULE_LIBRARY.find((rule) => rule.category === "TITLE_BLOCK") ??
		RULE_LIBRARY[0],
	BLOCK_REF:
		RULE_LIBRARY.find((rule) => rule.category === "BLOCK_REF") ??
		RULE_LIBRARY[0],
	REVISION_CLOUD:
		RULE_LIBRARY.find((rule) => rule.category === "REVISION_CLOUD") ??
		RULE_LIBRARY[0],
	DIMENSION:
		RULE_LIBRARY.find((rule) => rule.category === "DIMENSION") ??
		RULE_LIBRARY[0],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isRuleCategory = (value: unknown): value is AutoDraftRule["category"] => {
	if (typeof value !== "string") return false;
	return value.toUpperCase() in FALLBACK_RULE_BY_CATEGORY;
};

const toNonEmptyString = (value: unknown, fallback = ""): string => {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
};

const toConfidence = (value: unknown, fallback: number): number => {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(1, parsed));
};

const toInt = (value: unknown, fallback: number): number => {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.round(parsed));
};

const normalizeTrigger = (
	value: unknown,
	fallback: AutoDraftRule["trigger"],
): AutoDraftRule["trigger"] => {
	if (!isRecord(value)) return fallback;
	const entries = Object.entries(value).filter((entry) => {
		const [key, entryValue] = entry;
		if (typeof key !== "string" || key.trim().length === 0) return false;
		return (
			typeof entryValue === "string" ||
			typeof entryValue === "number" ||
			typeof entryValue === "boolean"
		);
	});
	if (entries.length === 0) return fallback;
	return Object.fromEntries(entries) as AutoDraftRule["trigger"];
};

const normalizeExamples = (value: unknown, fallback: string[]): string[] => {
	if (!Array.isArray(value)) return fallback;
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	return normalized.length > 0 ? normalized : fallback;
};

const normalizeHealthPayload = (payload: unknown): AutoDraftHealth => {
	if (!isRecord(payload)) return FALLBACK_HEALTH;

	const dotnet = isRecord(payload.dotnet)
		? {
				configured: Boolean(payload.dotnet.configured),
				reachable: Boolean(payload.dotnet.reachable),
				base_url:
					typeof payload.dotnet.base_url === "string"
						? payload.dotnet.base_url
						: null,
				error:
					typeof payload.dotnet.error === "string"
						? payload.dotnet.error
						: null,
			}
		: FALLBACK_HEALTH.dotnet;

	return {
		ok: Boolean(payload.ok),
		app: toNonEmptyString(payload.app),
		mode: toNonEmptyString(payload.mode, "unknown"),
		dotnet,
		elapsed_ms:
			typeof payload.elapsed_ms === "number" &&
			Number.isFinite(payload.elapsed_ms)
				? payload.elapsed_ms
				: undefined,
	};
};

const normalizeRule = (
	payload: unknown,
	index: number,
): AutoDraftRule | null => {
	if (!isRecord(payload)) return null;

	const defaultRule =
		RULE_LIBRARY[index % RULE_LIBRARY.length] ?? RULE_LIBRARY[0];
	const rawCategory = toNonEmptyString(
		payload.category,
		defaultRule.category,
	).toUpperCase();
	const category = isRuleCategory(rawCategory)
		? (rawCategory as AutoDraftRule["category"])
		: defaultRule.category;
	const categoryDefaults = FALLBACK_RULE_BY_CATEGORY[category] ?? defaultRule;

	return {
		id: toNonEmptyString(payload.id, `${category.toLowerCase()}-${index + 1}`),
		category,
		trigger: normalizeTrigger(payload.trigger, categoryDefaults.trigger),
		action: toNonEmptyString(payload.action, categoryDefaults.action),
		icon: toNonEmptyString(payload.icon, categoryDefaults.icon),
		examples: normalizeExamples(payload.examples, categoryDefaults.examples),
		confidence: toConfidence(payload.confidence, categoryDefaults.confidence),
	};
};

const normalizeAction = (
	payload: unknown,
	index: number,
): AutoDraftAction | null => {
	if (!isRecord(payload)) return null;
	const pairedAnnotationIds = Array.isArray(payload.paired_annotation_ids)
		? payload.paired_annotation_ids
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0)
		: [];
	return {
		id: toNonEmptyString(payload.id, `action-${index + 1}`),
		rule_id: typeof payload.rule_id === "string" ? payload.rule_id : null,
		category: toNonEmptyString(payload.category, "UNCLASSIFIED"),
		action: toNonEmptyString(payload.action, "Manual review required."),
		confidence: toConfidence(payload.confidence, 0),
		status: toNonEmptyString(payload.status, "review"),
		markup: isRecord(payload.markup) ? payload.markup : {},
		paired_annotation_ids:
			pairedAnnotationIds.length > 0 ? pairedAnnotationIds : undefined,
		replacement: normalizeReplacementMetadata(payload.replacement),
	};
};

const summarizeActions = (
	actions: AutoDraftAction[],
): AutoDraftPlanResponse["summary"] => ({
	total_markups: actions.length,
	actions_proposed: actions.length,
	classified: actions.filter((item) => Boolean(item.rule_id)).length,
	needs_review: actions.filter((item) => !item.rule_id).length,
});

const normalizePlanPayload = (payload: unknown): AutoDraftPlanResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			source: "invalid-payload",
			actions: [],
			summary: summarizeActions([]),
		};
	}

	const actionsRaw = Array.isArray(payload.actions) ? payload.actions : [];
	const actions = actionsRaw
		.map((item, index) => normalizeAction(item, index))
		.filter((item): item is AutoDraftAction => item !== null);

	const fallbackSummary = summarizeActions(actions);
	const summaryRaw = isRecord(payload.summary) ? payload.summary : null;

	return {
		ok: Boolean(payload.ok),
		source: toNonEmptyString(payload.source, "unknown"),
		actions,
		summary: {
			total_markups: toInt(
				summaryRaw?.total_markups,
				fallbackSummary.total_markups,
			),
			actions_proposed: toInt(
				summaryRaw?.actions_proposed,
				fallbackSummary.actions_proposed,
			),
			classified: toInt(summaryRaw?.classified, fallbackSummary.classified),
			needs_review: toInt(
				summaryRaw?.needs_review,
				fallbackSummary.needs_review,
			),
		},
	};
};

const normalizeExecutePayload = (
	payload: unknown,
): AutoDraftExecuteResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			source: "invalid-payload",
			job_id: "",
			status: "invalid",
			accepted: 0,
			skipped: 0,
			dry_run: true,
			message: "Execution payload was invalid.",
		};
	}

	const warnings = Array.isArray(payload.warnings)
		? payload.warnings.filter((item): item is string => typeof item === "string")
		: undefined;
	const metaPayload = isRecord(payload.meta) ? payload.meta : null;
	const executionReceiptPayload = metaPayload && isRecord(metaPayload.executionReceipt)
		? metaPayload.executionReceipt
		: null;
	const executionReceipt: AutoDraftExecutionReceipt | undefined =
		executionReceiptPayload
			? {
					id: toNonEmptyString(executionReceiptPayload.id) || undefined,
					requestId:
						toNonEmptyString(executionReceiptPayload.requestId) || undefined,
					jobId: toNonEmptyString(executionReceiptPayload.jobId) || undefined,
					providerPath:
						toNonEmptyString(executionReceiptPayload.providerPath) || undefined,
					source: toNonEmptyString(executionReceiptPayload.source) || undefined,
					status: toNonEmptyString(executionReceiptPayload.status) || undefined,
					dryRun:
						typeof executionReceiptPayload.dryRun === "boolean"
							? executionReceiptPayload.dryRun
							: undefined,
					accepted:
						typeof executionReceiptPayload.accepted === "number"
							? executionReceiptPayload.accepted
							: undefined,
					skipped:
						typeof executionReceiptPayload.skipped === "number"
							? executionReceiptPayload.skipped
							: undefined,
					drawingName:
						typeof executionReceiptPayload.drawingName === "string"
							? executionReceiptPayload.drawingName
							: null,
					drawingPath:
						typeof executionReceiptPayload.drawingPath === "string"
							? executionReceiptPayload.drawingPath
							: null,
					createdAt:
						toNonEmptyString(executionReceiptPayload.createdAt) || undefined,
					workflowContext: isRecord(executionReceiptPayload.workflowContext)
						? executionReceiptPayload.workflowContext
						: undefined,
					revisionContext: isRecord(executionReceiptPayload.revisionContext)
						? executionReceiptPayload.revisionContext
						: undefined,
					createdHandles: Array.isArray(executionReceiptPayload.createdHandles)
						? executionReceiptPayload.createdHandles.filter(
								(item): item is string => typeof item === "string",
							)
						: undefined,
					titleBlockUpdates: Array.isArray(
						executionReceiptPayload.titleBlockUpdates,
					)
						? executionReceiptPayload.titleBlockUpdates.filter(isRecord)
						: undefined,
					textReplacementUpdates: Array.isArray(
						executionReceiptPayload.textReplacementUpdates,
					)
						? executionReceiptPayload.textReplacementUpdates.filter(isRecord)
						: undefined,
					textDeleteUpdates: Array.isArray(
						executionReceiptPayload.textDeleteUpdates,
					)
						? executionReceiptPayload.textDeleteUpdates.filter(isRecord)
						: undefined,
					dimensionTextUpdates: Array.isArray(
						executionReceiptPayload.dimensionTextUpdates,
					)
						? executionReceiptPayload.dimensionTextUpdates.filter(isRecord)
						: undefined,
				}
			: undefined;
	const meta: AutoDraftExecuteMeta | undefined = metaPayload
		? {
				mode: toNonEmptyString(metaPayload.mode) || undefined,
				previewReadyCount:
					typeof metaPayload.previewReadyCount === "number"
						? metaPayload.previewReadyCount
						: undefined,
				providerPath: toNonEmptyString(metaPayload.providerPath) || undefined,
				requestId: toNonEmptyString(metaPayload.requestId) || undefined,
				bridgeRequestId:
					toNonEmptyString(metaPayload.bridgeRequestId) || undefined,
				bridgeMs:
					typeof metaPayload.bridgeMs === "number" ? metaPayload.bridgeMs : undefined,
				cad: isRecord(metaPayload.cad) ? metaPayload.cad : undefined,
				commit: isRecord(metaPayload.commit) ? metaPayload.commit : undefined,
				executionReceipt,
			}
		: undefined;

	return {
		ok: Boolean(payload.ok),
		source: toNonEmptyString(payload.source, "unknown"),
		job_id: toNonEmptyString(payload.job_id),
		status: toNonEmptyString(payload.status, "unknown"),
		accepted: toInt(payload.accepted, 0),
		skipped: toInt(payload.skipped, 0),
		dry_run: Boolean(payload.dry_run),
		message: toNonEmptyString(payload.message) || undefined,
		requestId: toNonEmptyString(payload.requestId) || undefined,
		warnings,
		meta,
	};
};

const normalizeBackcheckFinding = (
	payload: unknown,
	index: number,
): AutoDraftBackcheckFinding | null => {
	if (!isRecord(payload)) return null;
	const notes = Array.isArray(payload.notes)
		? payload.notes.filter((item): item is string => typeof item === "string")
		: [];
	const suggestions = Array.isArray(payload.suggestions)
		? payload.suggestions.filter(
				(item): item is string => typeof item === "string",
			)
		: [];
	const pairedAnnotationIds = Array.isArray(payload.paired_annotation_ids)
		? payload.paired_annotation_ids
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0)
		: [];
	return {
		id: toNonEmptyString(payload.id, `finding-${index + 1}`),
		action_id: toNonEmptyString(payload.action_id, `action-${index + 1}`),
		status: toNonEmptyString(payload.status, "warn"),
		severity: toNonEmptyString(payload.severity, "medium"),
		category: toNonEmptyString(payload.category, "unclassified"),
		notes,
		suggestions,
		paired_annotation_ids:
			pairedAnnotationIds.length > 0 ? pairedAnnotationIds : undefined,
		replacement: normalizeReplacementMetadata(payload.replacement),
	};
};

const normalizeReplacementCandidate = (
	value: unknown,
): AutoDraftReplacementCandidate | null => {
	if (!isRecord(value)) return null;
	const entityId = toNonEmptyString(value.entity_id);
	const text = toNonEmptyString(value.text);
	if (!entityId || !text) return null;
	const score = toConfidence(value.score, 0);
	const distance =
		typeof value.distance === "number" && Number.isFinite(value.distance)
			? value.distance
			: 0;
	const pairHitCount = toInt(value.pair_hit_count, 0);
	const scoreComponentsRaw = isRecord(value.score_components)
		? value.score_components
		: null;
	const scoreComponents: AutoDraftReplacementScoreComponents | undefined =
		scoreComponentsRaw
			? {
					pointer:
						typeof scoreComponentsRaw.pointer === "number" &&
						Number.isFinite(scoreComponentsRaw.pointer)
							? scoreComponentsRaw.pointer
							: undefined,
					overlap:
						typeof scoreComponentsRaw.overlap === "number" &&
						Number.isFinite(scoreComponentsRaw.overlap)
							? scoreComponentsRaw.overlap
							: undefined,
					distance:
						typeof scoreComponentsRaw.distance === "number" &&
						Number.isFinite(scoreComponentsRaw.distance)
							? scoreComponentsRaw.distance
							: undefined,
					pair_boost:
						typeof scoreComponentsRaw.pair_boost === "number" &&
						Number.isFinite(scoreComponentsRaw.pair_boost)
							? scoreComponentsRaw.pair_boost
							: undefined,
					same_text_penalty:
						typeof scoreComponentsRaw.same_text_penalty === "number" &&
						Number.isFinite(scoreComponentsRaw.same_text_penalty)
							? scoreComponentsRaw.same_text_penalty
							: undefined,
					base_score:
						typeof scoreComponentsRaw.base_score === "number" &&
						Number.isFinite(scoreComponentsRaw.base_score)
							? scoreComponentsRaw.base_score
							: undefined,
					agent_boost:
						typeof scoreComponentsRaw.agent_boost === "number" &&
						Number.isFinite(scoreComponentsRaw.agent_boost)
							? scoreComponentsRaw.agent_boost
							: undefined,
					pre_model_score:
						typeof scoreComponentsRaw.pre_model_score === "number" &&
						Number.isFinite(scoreComponentsRaw.pre_model_score)
							? scoreComponentsRaw.pre_model_score
							: undefined,
					model_adjustment:
						typeof scoreComponentsRaw.model_adjustment === "number" &&
						Number.isFinite(scoreComponentsRaw.model_adjustment)
							? scoreComponentsRaw.model_adjustment
							: undefined,
					final_score:
						typeof scoreComponentsRaw.final_score === "number" &&
						Number.isFinite(scoreComponentsRaw.final_score)
							? scoreComponentsRaw.final_score
							: undefined,
				}
			: undefined;
	const selectionModelRaw = isRecord(value.selection_model)
		? value.selection_model
		: null;
	const selectionModel: AutoDraftReplacementSelectionModel | undefined =
		selectionModelRaw
			? {
					label: toNonEmptyString(selectionModelRaw.label, "unknown"),
					confidence: toConfidence(selectionModelRaw.confidence, 0),
					modelVersion: toNonEmptyString(
						selectionModelRaw.model_version,
						"unknown",
					),
					featureSource: toNonEmptyString(
						selectionModelRaw.feature_source,
						"replacement_numeric_features",
					),
					source: toNonEmptyString(selectionModelRaw.source, "local_model"),
					reasonCodes: Array.isArray(selectionModelRaw.reason_codes)
						? selectionModelRaw.reason_codes
								.map((item) => (typeof item === "string" ? item.trim() : ""))
								.filter((item) => item.length > 0)
						: [],
					applied: Boolean(selectionModelRaw.applied),
					adjustment:
						typeof selectionModelRaw.adjustment === "number" &&
						Number.isFinite(selectionModelRaw.adjustment)
							? selectionModelRaw.adjustment
							: 0,
				}
			: undefined;
	return {
		entity_id: entityId,
		text,
		score,
		distance,
		pointer_hit: Boolean(value.pointer_hit),
		overlap: Boolean(value.overlap),
		pair_hit_count: pairHitCount,
		score_components: scoreComponents,
		selection_model: selectionModel,
	};
};

const normalizeReplacementMetadata = (
	value: unknown,
): AutoDraftReplacementMetadata | undefined => {
	if (!isRecord(value)) return undefined;
	const newText = toNonEmptyString(value.new_text);
	if (!newText) return undefined;
	const rawCandidates = Array.isArray(value.candidates) ? value.candidates : [];
	const candidates = rawCandidates
		.map((entry) => normalizeReplacementCandidate(entry))
		.filter((entry): entry is AutoDraftReplacementCandidate => entry !== null);
	return {
		new_text: newText,
		old_text: typeof value.old_text === "string" ? value.old_text : null,
		target_entity_id:
			typeof value.target_entity_id === "string"
				? value.target_entity_id
				: null,
		confidence: toConfidence(value.confidence, 0),
		status: toNonEmptyString(value.status, "unresolved"),
		target_source: toNonEmptyString(value.target_source),
		candidates,
	};
};

const normalizeReplacementTuning = (
	value: unknown,
): AutoDraftReplacementTuning => {
	const fallback = { ...DEFAULT_REPLACEMENT_TUNING };
	if (!isRecord(value)) return fallback;
	const unresolvedThreshold =
		typeof value.unresolved_confidence_threshold === "number" &&
		Number.isFinite(value.unresolved_confidence_threshold)
			? value.unresolved_confidence_threshold
			: fallback.unresolved_confidence_threshold;
	const ambiguityMargin =
		typeof value.ambiguity_margin_threshold === "number" &&
		Number.isFinite(value.ambiguity_margin_threshold)
			? value.ambiguity_margin_threshold
			: fallback.ambiguity_margin_threshold;
	const radiusMultiplier =
		typeof value.search_radius_multiplier === "number" &&
		Number.isFinite(value.search_radius_multiplier)
			? value.search_radius_multiplier
			: fallback.search_radius_multiplier;
	const minSearchRadius =
		typeof value.min_search_radius === "number" &&
		Number.isFinite(value.min_search_radius)
			? value.min_search_radius
			: fallback.min_search_radius;
	return {
		unresolved_confidence_threshold: Math.max(
			0,
			Math.min(1, unresolvedThreshold),
		),
		ambiguity_margin_threshold: Math.max(0, Math.min(1, ambiguityMargin)),
		search_radius_multiplier: Math.max(0.5, Math.min(8, radiusMultiplier)),
		min_search_radius: Math.max(4, Math.min(200, minSearchRadius)),
	};
};

const normalizeBackcheckPayload = (
	payload: unknown,
): AutoDraftBackcheckResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			success: false,
			requestId: "",
			source: "invalid-payload",
			mode: "cad-aware",
			cad: {
				available: false,
				degraded: true,
				source: "none",
				entity_count: 0,
				locked_layer_count: 0,
			},
			summary: {
				total_actions: 0,
				pass_count: 0,
				warn_count: 0,
				fail_count: 0,
			},
			warnings: ["Backcheck payload was invalid."],
			findings: [],
		};
	}

	const findingsRaw = Array.isArray(payload.findings) ? payload.findings : [];
	const findings = findingsRaw
		.map((item, index) => normalizeBackcheckFinding(item, index))
		.filter((item): item is AutoDraftBackcheckFinding => item !== null);
	const summaryRaw = isRecord(payload.summary) ? payload.summary : {};
	const cadRaw = isRecord(payload.cad) ? payload.cad : {};
	const warnings = Array.isArray(payload.warnings)
		? payload.warnings.filter(
				(item): item is string => typeof item === "string",
			)
		: [];

	return {
		ok: Boolean(payload.ok),
		success: Boolean(payload.success),
		requestId: toNonEmptyString(payload.requestId),
		source: toNonEmptyString(payload.source, "unknown"),
		mode: toNonEmptyString(payload.mode, "cad-aware"),
		cad: {
			available: Boolean(cadRaw["available"]),
			degraded: Boolean(cadRaw["degraded"]),
			source: toNonEmptyString(cadRaw["source"], "none"),
			entity_count: toInt(cadRaw["entity_count"], 0),
			locked_layer_count: toInt(cadRaw["locked_layer_count"], 0),
		},
		summary: {
			total_actions: toInt(summaryRaw["total_actions"], findings.length),
			pass_count: toInt(summaryRaw["pass_count"], 0),
			warn_count: toInt(summaryRaw["warn_count"], 0),
			fail_count: toInt(summaryRaw["fail_count"], 0),
		},
		warnings,
		findings,
	};
};

const toPoint = (value: unknown): AutoDraftComparePoint | null => {
	if (!isRecord(value)) return null;
	const x = typeof value.x === "number" ? value.x : Number(value.x);
	const y = typeof value.y === "number" ? value.y : Number(value.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return { x, y };
};

const toRoi = (value: unknown): AutoDraftCompareRoi | null => {
	if (!isRecord(value)) return null;
	const x = typeof value.x === "number" ? value.x : Number(value.x);
	const y = typeof value.y === "number" ? value.y : Number(value.y);
	const width =
		typeof value.width === "number" ? value.width : Number(value.width);
	const height =
		typeof value.height === "number" ? value.height : Number(value.height);
	if (
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return null;
	}
	if (width <= 0 || height <= 0) return null;
	return { x, y, width, height };
};

const normalizeRecognitionMetadata = (
	value: unknown,
): AutoDraftRecognitionMetadata | undefined => {
	if (!isRecord(value)) return undefined;
	const reasonCodes = Array.isArray(value.reason_codes)
		? value.reason_codes.filter(
				(entry): entry is string => typeof entry === "string",
			)
		: [];
	return {
		label: toNonEmptyString(value.label) || undefined,
		modelVersion: toNonEmptyString(value.model_version, "deterministic-v1"),
		confidence: toConfidence(value.confidence, 0),
		source: toNonEmptyString(value.source, "deterministic"),
		featureSource: toNonEmptyString(value.feature_source, "unknown"),
		reasonCodes,
		needsReview: Boolean(value.needs_review),
		accepted: Boolean(value.accepted),
		overrideReason:
			typeof value.override_reason === "string"
				? value.override_reason
				: null,
		agentHintsApplied: Boolean(value.agent_hints_applied),
	};
};

const normalizeAutoCalibration = (value: unknown): AutoDraftAutoCalibration => {
	const raw = isRecord(value) ? value : {};
	const suggestedPdfPoints = Array.isArray(raw.suggested_pdf_points)
		? raw.suggested_pdf_points
				.map((entry) => toPoint(entry))
				.filter((entry): entry is AutoDraftComparePoint => entry !== null)
		: [];
	const suggestedCadPoints = Array.isArray(raw.suggested_cad_points)
		? raw.suggested_cad_points
				.map((entry) => toPoint(entry))
				.filter((entry): entry is AutoDraftComparePoint => entry !== null)
		: [];
	const qualityNotes = Array.isArray(raw.quality_notes)
		? raw.quality_notes.filter(
				(entry): entry is string => typeof entry === "string",
			)
		: [];
	return {
		available: Boolean(raw.available),
		used: Boolean(raw.used),
		status: toNonEmptyString(raw.status, "needs_manual"),
		confidence: toConfidence(raw.confidence, 0),
		method: toNonEmptyString(raw.method, "none"),
		quality_notes: qualityNotes,
		suggested_pdf_points: suggestedPdfPoints,
		suggested_cad_points: suggestedCadPoints,
		matched_anchor_count: toInt(raw.matched_anchor_count, 0),
		anchor_count: toInt(raw.anchor_count, 0),
		residual_error:
			typeof raw.residual_error === "number" &&
			Number.isFinite(raw.residual_error)
				? raw.residual_error
				: undefined,
	};
};

const normalizePreparedMarkup = (
	value: unknown,
	index: number,
): AutoDraftPreparedMarkup | null => {
	if (!isRecord(value)) return null;
	const bounds = isRecord(value.bounds)
		? {
				x: Number(value.bounds.x),
				y: Number(value.bounds.y),
				width: Number(value.bounds.width),
				height: Number(value.bounds.height),
			}
		: undefined;
	const normalizedBounds =
		bounds &&
		Number.isFinite(bounds.x) &&
		Number.isFinite(bounds.y) &&
		Number.isFinite(bounds.width) &&
		Number.isFinite(bounds.height) &&
		bounds.width > 0 &&
		bounds.height > 0
			? bounds
			: undefined;

	return {
		id: toNonEmptyString(value.id, `markup-${index + 1}`),
		type: toNonEmptyString(value.type, "unknown"),
		color: toNonEmptyString(value.color, "unknown"),
		text: toNonEmptyString(value.text),
		bounds: normalizedBounds,
		layer: typeof value.layer === "string" ? value.layer : undefined,
		meta: isRecord(value.meta) ? value.meta : undefined,
		recognition: normalizeRecognitionMetadata(value.recognition),
	};
};

const normalizeComparePreparePayload = (
	payload: unknown,
): AutoDraftComparePrepareResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			success: false,
			requestId: "",
			source: "invalid-payload",
			page: { index: 0, total_pages: 0, width: 0, height: 0 },
			calibration_seed: {
				available: false,
				source: "none",
				scale_hint: null,
				rotation_hint_deg: null,
				ratio_text: null,
				notes: [],
			},
			auto_calibration: normalizeAutoCalibration(null),
			warnings: ["Prepare payload was invalid."],
			recognition: normalizeRecognitionMetadata(null),
			pdf_metadata: {
				bluebeam_detected: false,
				detection_reasons: [],
				document: {
					title: null,
					author: null,
					subject: null,
					creator: null,
					producer: null,
					keywords: null,
					created_utc: null,
					modified_utc: null,
					custom: {},
				},
				page: {
					index: 0,
					rotation_deg: 0,
					user_unit: null,
					media_box: { width: 0, height: 0 },
					crop_box: null,
					annotation_counts: {
						total: 0,
						supported: 0,
						unsupported: 0,
						by_subtype: {},
					},
				},
			},
			markups: [],
		};
	}

	const markupsRaw = Array.isArray(payload.markups) ? payload.markups : [];
	const markups = markupsRaw
		.map((entry, index) => normalizePreparedMarkup(entry, index))
		.filter((entry): entry is AutoDraftPreparedMarkup => entry !== null);
	const pageRaw = isRecord(payload.page) ? payload.page : {};
	const seedRaw = isRecord(payload.calibration_seed)
		? payload.calibration_seed
		: {};
	const pdfMetadataRaw = isRecord(payload.pdf_metadata)
		? payload.pdf_metadata
		: {};
	const pdfDocumentRaw = isRecord(pdfMetadataRaw.document)
		? pdfMetadataRaw.document
		: {};
	const pdfPageRaw = isRecord(pdfMetadataRaw.page) ? pdfMetadataRaw.page : {};
	const annotationCountsRaw = isRecord(pdfPageRaw.annotation_counts)
		? pdfPageRaw.annotation_counts
		: {};
	const textExtractionRaw = isRecord(pdfPageRaw.text_extraction)
		? pdfPageRaw.text_extraction
		: null;
	const bySubtypeRaw = isRecord(annotationCountsRaw.by_subtype)
		? annotationCountsRaw.by_subtype
		: {};
	const cropBoxRaw = isRecord(pdfPageRaw.crop_box) ? pdfPageRaw.crop_box : null;
	const cropBox =
		cropBoxRaw &&
		typeof cropBoxRaw.x === "number" &&
		Number.isFinite(cropBoxRaw.x) &&
		typeof cropBoxRaw.y === "number" &&
		Number.isFinite(cropBoxRaw.y) &&
		typeof cropBoxRaw.width === "number" &&
		Number.isFinite(cropBoxRaw.width) &&
		typeof cropBoxRaw.height === "number" &&
		Number.isFinite(cropBoxRaw.height)
			? {
					x: cropBoxRaw.x,
					y: cropBoxRaw.y,
					width: cropBoxRaw.width,
					height: cropBoxRaw.height,
				}
			: null;

	const bySubtype: Record<string, number> = {};
	for (const [rawKey, rawValue] of Object.entries(bySubtypeRaw)) {
		if (typeof rawKey !== "string") continue;
		const normalizedKey = rawKey.trim();
		if (!normalizedKey) continue;
		if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
		bySubtype[normalizedKey] = Math.max(0, Math.trunc(rawValue));
	}

	const customRaw = isRecord(pdfDocumentRaw.custom)
		? pdfDocumentRaw.custom
		: {};
	const custom: Record<string, string> = {};
	for (const [rawKey, rawValue] of Object.entries(customRaw)) {
		if (typeof rawKey !== "string") continue;
		const key = rawKey.trim();
		if (!key || typeof rawValue !== "string") continue;
		const value = rawValue.trim();
		if (!value) continue;
		custom[key] = value;
	}

	return {
		ok: Boolean(payload.ok),
		success: Boolean(payload.success),
		requestId: toNonEmptyString(payload.requestId),
		source: toNonEmptyString(payload.source, "unknown"),
		page: {
			index: toInt(pageRaw.index, 0),
			total_pages: toInt(pageRaw.total_pages, 0),
			width:
				typeof pageRaw.width === "number" && Number.isFinite(pageRaw.width)
					? pageRaw.width
					: 0,
			height:
				typeof pageRaw.height === "number" && Number.isFinite(pageRaw.height)
					? pageRaw.height
					: 0,
		},
		calibration_seed: {
			available: Boolean(seedRaw.available),
			source: toNonEmptyString(seedRaw.source, "none"),
			scale_hint:
				typeof seedRaw.scale_hint === "number" &&
				Number.isFinite(seedRaw.scale_hint)
					? seedRaw.scale_hint
					: null,
			rotation_hint_deg:
				typeof seedRaw.rotation_hint_deg === "number" &&
				Number.isFinite(seedRaw.rotation_hint_deg)
					? seedRaw.rotation_hint_deg
					: null,
			ratio_text:
				typeof seedRaw.ratio_text === "string" ? seedRaw.ratio_text : null,
			notes: Array.isArray(seedRaw.notes)
				? seedRaw.notes.filter(
						(entry): entry is string => typeof entry === "string",
					)
				: [],
		},
		auto_calibration: normalizeAutoCalibration(payload.auto_calibration),
		warnings: Array.isArray(payload.warnings)
			? payload.warnings.filter(
					(entry): entry is string => typeof entry === "string",
				)
			: [],
		recognition: normalizeRecognitionMetadata(payload.recognition),
		pdf_metadata: {
			bluebeam_detected: Boolean(pdfMetadataRaw.bluebeam_detected),
			detection_reasons: Array.isArray(pdfMetadataRaw.detection_reasons)
				? pdfMetadataRaw.detection_reasons.filter(
						(entry): entry is string => typeof entry === "string",
					)
				: [],
			document: {
				title:
					typeof pdfDocumentRaw.title === "string"
						? pdfDocumentRaw.title
						: null,
				author:
					typeof pdfDocumentRaw.author === "string"
						? pdfDocumentRaw.author
						: null,
				subject:
					typeof pdfDocumentRaw.subject === "string"
						? pdfDocumentRaw.subject
						: null,
				creator:
					typeof pdfDocumentRaw.creator === "string"
						? pdfDocumentRaw.creator
						: null,
				producer:
					typeof pdfDocumentRaw.producer === "string"
						? pdfDocumentRaw.producer
						: null,
				keywords:
					typeof pdfDocumentRaw.keywords === "string"
						? pdfDocumentRaw.keywords
						: null,
				created_utc:
					typeof pdfDocumentRaw.created_utc === "string"
						? pdfDocumentRaw.created_utc
						: null,
				modified_utc:
					typeof pdfDocumentRaw.modified_utc === "string"
						? pdfDocumentRaw.modified_utc
						: null,
				custom,
			},
			page: {
				index: toInt(pdfPageRaw.index, toInt(pageRaw.index, 0)),
				rotation_deg:
					typeof pdfPageRaw.rotation_deg === "number" &&
					Number.isFinite(pdfPageRaw.rotation_deg)
						? pdfPageRaw.rotation_deg
						: 0,
				user_unit:
					typeof pdfPageRaw.user_unit === "number" &&
					Number.isFinite(pdfPageRaw.user_unit)
						? pdfPageRaw.user_unit
						: null,
				media_box: {
					width:
						isRecord(pdfPageRaw.media_box) &&
						typeof pdfPageRaw.media_box.width === "number" &&
						Number.isFinite(pdfPageRaw.media_box.width)
							? pdfPageRaw.media_box.width
							: typeof pageRaw.width === "number" &&
									Number.isFinite(pageRaw.width)
								? pageRaw.width
								: 0,
					height:
						isRecord(pdfPageRaw.media_box) &&
						typeof pdfPageRaw.media_box.height === "number" &&
						Number.isFinite(pdfPageRaw.media_box.height)
							? pdfPageRaw.media_box.height
							: typeof pageRaw.height === "number" &&
									Number.isFinite(pageRaw.height)
								? pageRaw.height
								: 0,
				},
				crop_box: cropBox,
				annotation_counts: {
					total: toInt(annotationCountsRaw.total, markups.length),
					supported: toInt(annotationCountsRaw.supported, markups.length),
					unsupported: toInt(annotationCountsRaw.unsupported, 0),
					by_subtype: bySubtype,
				},
				text_extraction: textExtractionRaw
					? {
							used: Boolean(textExtractionRaw.used),
							source: toNonEmptyString(textExtractionRaw.source, "none"),
							feature_source: toNonEmptyString(
								textExtractionRaw.feature_source,
								"pdf_annotations",
							),
							render_available: Boolean(textExtractionRaw.render_available),
							ocr_available: Boolean(textExtractionRaw.ocr_available),
							embedded_line_count: toInt(
								textExtractionRaw.embedded_line_count,
								0,
							),
							ocr_line_count: toInt(textExtractionRaw.ocr_line_count, 0),
							candidate_count: toInt(textExtractionRaw.candidate_count, 0),
							selected_line_count: toInt(
								textExtractionRaw.selected_line_count,
								0,
							),
							skipped_without_bounds: toInt(
								textExtractionRaw.skipped_without_bounds,
								0,
							),
							selected_black_text_count: toInt(
								textExtractionRaw.selected_black_text_count,
								0,
							),
						}
					: undefined,
			},
		},
		markups,
	};
};

const normalizeCompareReviewItem = (
	value: unknown,
	index: number,
): AutoDraftCompareReviewItem | null => {
	if (!isRecord(value)) return null;
	const actionId = toNonEmptyString(value.action_id);
	const newText = toNonEmptyString(value.new_text);
	if (!actionId || !newText) return null;
	const candidatesRaw = Array.isArray(value.candidates) ? value.candidates : [];
	const candidates = candidatesRaw
		.map((entry) => normalizeReplacementCandidate(entry))
		.filter((entry): entry is AutoDraftReplacementCandidate => entry !== null);
	const agentHintRaw = isRecord(value.agent_hint) ? value.agent_hint : null;
	const candidateBoostsRaw =
		agentHintRaw && isRecord(agentHintRaw.candidate_boosts)
			? agentHintRaw.candidate_boosts
			: null;
	const candidateBoosts: Record<string, number> = {};
	if (candidateBoostsRaw) {
		for (const [rawKey, rawValue] of Object.entries(candidateBoostsRaw)) {
			if (typeof rawKey !== "string") continue;
			const key = rawKey.trim();
			if (!key) continue;
			const valueNumber =
				typeof rawValue === "number" ? rawValue : Number(rawValue);
			if (!Number.isFinite(valueNumber) || valueNumber <= 0) continue;
			candidateBoosts[key] = valueNumber;
		}
	}
	const agentHint =
		agentHintRaw && (Object.keys(candidateBoosts).length > 0 || agentHintRaw.intent_hint || agentHintRaw.rationale)
			? {
					candidate_boosts:
						Object.keys(candidateBoosts).length > 0 ? candidateBoosts : undefined,
					intent_hint:
						typeof agentHintRaw.intent_hint === "string"
							? agentHintRaw.intent_hint
							: null,
					roi_hint: toRoi(agentHintRaw.roi_hint) ?? null,
					rationale:
						typeof agentHintRaw.rationale === "string"
							? agentHintRaw.rationale
							: null,
				}
			: undefined;
	const shadowRaw = isRecord(value.shadow) ? value.shadow : null;
	const shadow =
		shadowRaw && toNonEmptyString(shadowRaw.action_id)
			? {
					action_id: toNonEmptyString(shadowRaw.action_id),
					suggested_old_text:
						typeof shadowRaw.suggested_old_text === "string"
							? shadowRaw.suggested_old_text
							: null,
					suggested_entity_id:
						typeof shadowRaw.suggested_entity_id === "string"
							? shadowRaw.suggested_entity_id
							: null,
					confidence:
						typeof shadowRaw.confidence === "number" &&
						Number.isFinite(shadowRaw.confidence)
							? shadowRaw.confidence
							: null,
					rationale:
						typeof shadowRaw.rationale === "string"
							? shadowRaw.rationale
							: null,
				}
			: undefined;
	return {
		id: toNonEmptyString(value.id, `review-${index + 1}`),
		request_id: toNonEmptyString(value.request_id),
		action_id: actionId,
		status: toNonEmptyString(value.status, "unresolved"),
		confidence: toConfidence(value.confidence, 0),
		new_text: newText,
		selected_old_text:
			typeof value.selected_old_text === "string"
				? value.selected_old_text
				: null,
		selected_entity_id:
			typeof value.selected_entity_id === "string"
				? value.selected_entity_id
				: null,
		message: toNonEmptyString(value.message, "Review replacement mapping."),
		candidates,
		agent_hint: agentHint,
		shadow,
	};
};

const normalizeMarkupReviewItem = (
	value: unknown,
	index: number,
): AutoDraftMarkupReviewItem | null => {
	if (!isRecord(value)) return null;
	const actionId = toNonEmptyString(value.action_id);
	if (!actionId) return null;
	const reasonCodes = Array.isArray(value.reason_codes)
		? value.reason_codes.filter(
				(entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
			)
		: [];
	return {
		id: toNonEmptyString(value.id, `markup-review-${index + 1}`),
		request_id: toNonEmptyString(value.request_id),
		action_id: actionId,
		status: toNonEmptyString(value.status, "needs_review"),
		confidence: toConfidence(value.confidence, 0),
		message: toNonEmptyString(
			value.message,
			"Low-confidence markup recognition requires operator review.",
		),
		markup_id:
			typeof value.markup_id === "string" ? value.markup_id : undefined,
		markup: isRecord(value.markup) ? value.markup : undefined,
		recognition: normalizeRecognitionMetadata(value.recognition),
		predicted_category:
			typeof value.predicted_category === "string"
				? value.predicted_category
				: null,
		predicted_action:
			typeof value.predicted_action === "string"
				? value.predicted_action
				: null,
		reason_codes: reasonCodes,
	};
};

const normalizeShadowAdvisor = (
	value: unknown,
): AutoDraftCompareResponse["shadow_advisor"] => {
	if (!isRecord(value)) return undefined;
	const reviewsRaw = Array.isArray(value.reviews) ? value.reviews : [];
	const reviews: NonNullable<
		AutoDraftCompareResponse["shadow_advisor"]
	>["reviews"] = [];
	for (const entry of reviewsRaw) {
		if (!isRecord(entry)) continue;
		const actionId = toNonEmptyString(entry.action_id);
		if (!actionId) continue;
		reviews.push({
			action_id: actionId,
			suggested_old_text:
				typeof entry.suggested_old_text === "string"
					? entry.suggested_old_text
					: null,
			suggested_entity_id:
				typeof entry.suggested_entity_id === "string"
					? entry.suggested_entity_id
					: null,
			confidence:
				typeof entry.confidence === "number" &&
				Number.isFinite(entry.confidence)
					? entry.confidence
					: null,
			rationale: typeof entry.rationale === "string" ? entry.rationale : null,
		});
	}
	return {
		enabled: Boolean(value.enabled),
		available: Boolean(value.available),
		profile: toNonEmptyString(value.profile, "draftsmith"),
		error: typeof value.error === "string" ? value.error : null,
		auth: isRecord(value.auth)
			? {
					mode: toNonEmptyString(value.auth.mode, "service_token"),
					token_source: toNonEmptyString(value.auth.token_source, "none"),
					refresh_attempted: Boolean(value.auth.refresh_attempted),
				}
			: undefined,
		reviews,
	};
};

const normalizeAgentPreReview = (
	value: unknown,
): AutoDraftCompareResponse["agent_pre_review"] => {
	if (!isRecord(value)) return undefined;
	const preflightRaw = isRecord(value.preflight) ? value.preflight : null;
	const authRaw = isRecord(value.auth) ? value.auth : null;
	return {
		enabled: Boolean(value.enabled),
		attempted: Boolean(value.attempted),
		available: Boolean(value.available),
		used: Boolean(value.used),
		profile: toNonEmptyString(value.profile, "draftsmith"),
		latency_ms:
			typeof value.latency_ms === "number" && Number.isFinite(value.latency_ms)
				? value.latency_ms
				: null,
		hints_count: toInt(value.hints_count, 0),
		error: typeof value.error === "string" ? value.error : null,
		auth: authRaw
			? {
					mode: toNonEmptyString(authRaw.mode, "service_token"),
					token_source: toNonEmptyString(authRaw.token_source, "none"),
					refresh_attempted: Boolean(authRaw.refresh_attempted),
				}
			: undefined,
		preflight: preflightRaw
			? {
					checked: Boolean(preflightRaw.checked),
					available: Boolean(preflightRaw.available),
					expected_model:
						typeof preflightRaw.expected_model === "string"
							? preflightRaw.expected_model
							: null,
					reason:
						typeof preflightRaw.reason === "string"
							? preflightRaw.reason
							: null,
				}
			: undefined,
	};
};

const normalizeComparePayload = (
	payload: unknown,
): AutoDraftCompareResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			success: false,
			requestId: "",
			source: "invalid-payload",
			mode: "cad-aware",
			tolerance_profile: "medium",
			engine: {
				requested: "auto",
				used: "python",
				used_fallback: false,
			},
			calibration: {
				pdf_points: [],
				cad_points: [],
				scale: 1,
				rotation_deg: 0,
				translation: { x: 0, y: 0 },
			},
			recognition: normalizeRecognitionMetadata(null),
			plan: {
				source: "invalid-payload",
				summary: {
					total_markups: 0,
					actions_proposed: 0,
					classified: 0,
					needs_review: 0,
				},
				actions: [],
			},
			backcheck: normalizeBackcheckPayload(null),
			summary: {
				status: "fail",
				total_markups: 0,
				total_actions: 0,
				pass_count: 0,
				warn_count: 0,
				fail_count: 0,
				cad_context_available: false,
			},
			replacement_tuning: { ...DEFAULT_REPLACEMENT_TUNING },
			markup_review_queue: [],
			review_queue: [],
			agent_pre_review: {
				enabled: false,
				attempted: false,
				available: false,
				used: false,
				profile: "draftsmith",
				latency_ms: null,
				hints_count: 0,
				error: "Compare payload was invalid.",
			},
			shadow_advisor: {
				enabled: false,
				available: false,
				profile: "draftsmith",
				error: "Compare payload was invalid.",
				reviews: [],
			},
		};
	}

	const engineRaw = isRecord(payload.engine) ? payload.engine : {};
	const calibrationRaw = isRecord(payload.calibration)
		? payload.calibration
		: {};
	const planRaw = isRecord(payload.plan) ? payload.plan : {};
	const planSummaryRaw = isRecord(planRaw.summary) ? planRaw.summary : {};
	const summaryRaw = isRecord(payload.summary) ? payload.summary : {};
	const planActionsRaw = Array.isArray(planRaw.actions) ? planRaw.actions : [];
	const planActions = planActionsRaw
		.map((entry, index) => normalizeAction(entry, index))
		.filter((entry): entry is AutoDraftAction => entry !== null);
	const reviewQueueRaw = Array.isArray(payload.review_queue)
		? payload.review_queue
		: [];
	const reviewQueue = reviewQueueRaw
		.map((entry, index) => normalizeCompareReviewItem(entry, index))
		.filter((entry): entry is AutoDraftCompareReviewItem => entry !== null);
	const markupReviewQueueRaw = Array.isArray(payload.markup_review_queue)
		? payload.markup_review_queue
		: [];
	const markupReviewQueue = markupReviewQueueRaw
		.map((entry, index) => normalizeMarkupReviewItem(entry, index))
		.filter((entry): entry is AutoDraftMarkupReviewItem => entry !== null);

	const requestedEngine = toNonEmptyString(engineRaw.requested, "auto");
	const usedEngine = toNonEmptyString(engineRaw.used, "python");
	const requested =
		requestedEngine === "python" || requestedEngine === "dotnet"
			? requestedEngine
			: "auto";
	const used =
		usedEngine === "auto" || usedEngine === "dotnet" ? usedEngine : "python";

	const toleranceRaw = toNonEmptyString(payload.tolerance_profile, "medium");
	const tolerance =
		toleranceRaw === "strict" || toleranceRaw === "loose"
			? toleranceRaw
			: "medium";

	return {
		ok: Boolean(payload.ok),
		success: Boolean(payload.success),
		requestId: toNonEmptyString(payload.requestId),
		source: toNonEmptyString(payload.source, "unknown"),
		mode: toNonEmptyString(payload.mode, "cad-aware"),
		calibration_mode:
			toNonEmptyString(payload.calibration_mode, "auto") === "manual"
				? "manual"
				: "auto",
		tolerance_profile: tolerance,
		engine: {
			requested,
			used,
			used_fallback: Boolean(engineRaw.used_fallback),
		},
		calibration: {
			pdf_points: Array.isArray(calibrationRaw.pdf_points)
				? calibrationRaw.pdf_points
						.map((entry) => toPoint(entry))
						.filter((entry): entry is AutoDraftComparePoint => entry !== null)
				: [],
			cad_points: Array.isArray(calibrationRaw.cad_points)
				? calibrationRaw.cad_points
						.map((entry) => toPoint(entry))
						.filter((entry): entry is AutoDraftComparePoint => entry !== null)
				: [],
			scale:
				typeof calibrationRaw.scale === "number" &&
				Number.isFinite(calibrationRaw.scale)
					? calibrationRaw.scale
					: 1,
			rotation_deg:
				typeof calibrationRaw.rotation_deg === "number" &&
				Number.isFinite(calibrationRaw.rotation_deg)
					? calibrationRaw.rotation_deg
					: 0,
			translation: toPoint(calibrationRaw.translation) ?? { x: 0, y: 0 },
		},
		auto_calibration: normalizeAutoCalibration(payload.auto_calibration),
		roi: toRoi(payload.roi) ?? undefined,
		cad_roi: toRoi(payload.cad_roi) ?? undefined,
		recognition: normalizeRecognitionMetadata(payload.recognition),
		plan: {
			source: toNonEmptyString(planRaw.source, "unknown"),
			summary: {
				total_markups: toInt(planSummaryRaw.total_markups, planActions.length),
				actions_proposed: toInt(
					planSummaryRaw.actions_proposed,
					planActions.length,
				),
				classified: toInt(planSummaryRaw.classified, 0),
				needs_review: toInt(planSummaryRaw.needs_review, 0),
			},
			actions: planActions,
		},
		backcheck: normalizeBackcheckPayload(payload.backcheck),
		summary: {
			status: toNonEmptyString(summaryRaw.status, "pass"),
			total_markups: toInt(summaryRaw.total_markups, 0),
			total_actions: toInt(summaryRaw.total_actions, planActions.length),
			pass_count: toInt(summaryRaw.pass_count, 0),
			warn_count: toInt(summaryRaw.warn_count, 0),
			fail_count: toInt(summaryRaw.fail_count, 0),
			cad_context_available: Boolean(summaryRaw.cad_context_available),
		},
		replacement_tuning: normalizeReplacementTuning(payload.replacement_tuning),
		markup_review_queue: markupReviewQueue,
		review_queue: reviewQueue,
		agent_pre_review: normalizeAgentPreReview(payload.agent_pre_review),
		shadow_advisor: normalizeShadowAdvisor(payload.shadow_advisor),
	};
};

const normalizeCompareFeedbackResponse = (
	payload: unknown,
): AutoDraftCompareFeedbackResponse => {
	if (!isRecord(payload)) {
		return {
			ok: false,
			success: false,
			requestId: "",
			source: "invalid-payload",
		};
	}
	const metricsRaw = isRecord(payload.metrics) ? payload.metrics : {};
	const metrics: Record<string, number> = {};
	for (const [key, value] of Object.entries(metricsRaw)) {
		if (typeof key !== "string" || !key.trim()) continue;
		const numeric =
			typeof value === "number"
				? value
				: typeof value === "string"
					? Number(value)
					: NaN;
		if (!Number.isFinite(numeric)) continue;
		metrics[key] = numeric;
	}
	const importedRaw = isRecord(payload.imported) ? payload.imported : {};
	return {
		ok: Boolean(payload.ok),
		success: Boolean(payload.success),
		requestId: toNonEmptyString(payload.requestId),
		source: toNonEmptyString(payload.source, "unknown"),
		stored: toInt(payload.stored, 0),
		metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
		learning:
			isRecord(payload.learning)
				? Object.fromEntries(
						Object.entries(payload.learning)
							.map(([key, value]) => [key, toInt(value, 0)])
							.filter(([key]) => Boolean(String(key).trim())),
					)
				: undefined,
		mode:
			toNonEmptyString(payload.mode) === "replace"
				? "replace"
				: toNonEmptyString(payload.mode) === "merge"
					? "merge"
					: undefined,
		imported: isRecord(importedRaw)
			? {
					events: toInt(importedRaw.events, 0),
					pairs: toInt(importedRaw.pairs, 0),
					metrics: toInt(importedRaw.metrics, 0),
				}
			: undefined,
	};
};

const normalizeLearningModel = (
	payload: unknown,
): AutoDraftLearningModel | null => {
	if (!isRecord(payload)) return null;
	return {
		domain: toNonEmptyString(payload.domain),
		version: toNonEmptyString(payload.version),
		artifactPath: toNonEmptyString(payload.artifact_path),
		metrics: isRecord(payload.metrics) ? payload.metrics : {},
		metadata: isRecord(payload.metadata) ? payload.metadata : {},
		active: Boolean(payload.active),
		createdUtc: toNonEmptyString(payload.created_utc),
	};
};

const normalizeLearningEvaluation = (
	payload: unknown,
): AutoDraftLearningEvaluation | null => {
	if (!isRecord(payload)) return null;
	return {
		domain: toNonEmptyString(payload.domain),
		version: toNonEmptyString(payload.version),
		metrics: isRecord(payload.metrics) ? payload.metrics : {},
		confusion: isRecord(payload.confusion) ? payload.confusion : {},
		promoted: Boolean(payload.promoted),
		sampleCount: toInt(payload.sample_count, 0),
		createdUtc: toNonEmptyString(payload.created_utc),
	};
};

const normalizeReviewedRunBundle = (
	payload: unknown,
): AutoDraftReviewedRunBundle | null => {
	if (!isRecord(payload)) return null;
	const feedbackRaw = isRecord(payload.feedback) ? payload.feedback : {};
	const learningExamplesRaw = isRecord(payload.learning_examples)
		? payload.learning_examples
		: {};
	const learningExamples: Record<string, Record<string, unknown>[]> = {};
	for (const [domain, value] of Object.entries(learningExamplesRaw)) {
		if (!Array.isArray(value)) continue;
		learningExamples[domain] = value.filter((entry): entry is Record<string, unknown> =>
			isRecord(entry),
		);
	}
	return {
		schema: toNonEmptyString(payload.schema),
		bundleId: toNonEmptyString(payload.bundle_id),
		requestId: toNonEmptyString(payload.request_id),
		capturedUtc: toNonEmptyString(payload.captured_utc),
		source: toNonEmptyString(payload.source, "autodraft-reviewed-run"),
		label: toNonEmptyString(payload.label) || undefined,
		notes: toNonEmptyString(payload.notes) || undefined,
		summary: isRecord(payload.summary) ? payload.summary : {},
		feedback: {
			items: Array.isArray(feedbackRaw.items)
				? feedbackRaw.items.filter((entry): entry is Record<string, unknown> =>
						isRecord(entry),
					)
				: [],
			eventCount: toInt(feedbackRaw.event_count, 0),
			latestEventUtc: toNonEmptyString(feedbackRaw.latest_event_utc) || undefined,
		},
		learningExamples,
		prepare: isRecord(payload.prepare) ? payload.prepare : {},
		compare: isRecord(payload.compare) ? payload.compare : {},
	};
};

class AutoDraftService {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly apiClient: ReturnType<typeof createAutoDraftApiClient>;

	constructor() {
		this.baseUrl = (
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000"
		).replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY || "";
		this.apiClient = createAutoDraftApiClient({
			baseUrl: this.baseUrl,
			apiKey: this.apiKey,
			defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		});
	}

	async health(): Promise<AutoDraftHealth> {
		try {
			const payload = await requestAutoDraftHealth(this.apiClient);
			return normalizeHealthPayload(payload);
		} catch (error) {
			logger.warn("AutoDraft health failed", "AutoDraftService", { error });
			return FALLBACK_HEALTH;
		}
	}

	async listRules(): Promise<AutoDraftRule[]> {
		try {
			const payload = await requestAutoDraftRules(this.apiClient);
			const rulesRaw =
				isRecord(payload) && Array.isArray(payload.rules) ? payload.rules : [];
			const rules = rulesRaw
				.map((item, index) => normalizeRule(item, index))
				.filter((item): item is AutoDraftRule => item !== null);

			if (rulesRaw.length > 0 && rules.length !== rulesRaw.length) {
				logger.warn(
					"AutoDraft rules payload contained invalid entries",
					"AutoDraftService",
					{
						expected: rulesRaw.length,
						normalized: rules.length,
					},
				);
			}

			return rules;
		} catch (error) {
			logger.warn("AutoDraft rules fetch failed", "AutoDraftService", {
				error,
			});
			return [];
		}
	}

	async plan(markups: MarkupInput[]): Promise<AutoDraftPlanResponse> {
		const payload = await requestAutoDraftPlan(this.apiClient, markups);
		return normalizePlanPayload(payload);
	}

	async execute(
		actions: AutoDraftAction[],
		options?: {
			dryRun?: boolean;
			backcheckRequestId?: string;
			backcheckOverrideReason?: string;
			backcheckFailCount?: number;
			workflowContext?: AutoDraftExecuteWorkflowContext;
			revisionContext?: AutoDraftExecuteRevisionContext;
		},
	): Promise<AutoDraftExecuteResponse> {
		const payload = await requestAutoDraftExecute(
			this.apiClient,
			actions,
			options,
		);
		return normalizeExecutePayload(payload);
	}

	async backcheck(
		actions: AutoDraftAction[],
		options?: {
			cadContext?: Record<string, unknown>;
			requireCadContext?: boolean;
		},
	): Promise<AutoDraftBackcheckResponse> {
		const payload = await requestAutoDraftBackcheck(
			this.apiClient,
			actions,
			options,
		);
		return normalizeBackcheckPayload(payload);
	}

	async prepareCompare(
		file: File,
		pageIndex: number,
	): Promise<AutoDraftComparePrepareResponse> {
		const payload = await requestAutoDraftPrepareCompare(this.apiClient, {
			file,
			pageIndex,
			timeoutMs: DEFAULT_TIMEOUT_MS,
		});
		return normalizeComparePreparePayload(payload);
	}

	async runCompare(args: {
		engine: AutoDraftCompareEngine;
		toleranceProfile: AutoDraftToleranceProfile;
		calibrationMode?: AutoDraftCalibrationMode;
		agentReviewMode?: AutoDraftAgentReviewMode;
		manualOverride?: boolean;
		markups: AutoDraftPreparedMarkup[];
		pdfPoints?: AutoDraftComparePoint[];
		cadPoints?: AutoDraftComparePoint[];
		roi?: AutoDraftCompareRoi;
		calibrationSeed?: AutoDraftComparePrepareResponse["calibration_seed"];
		cadContext?: Record<string, unknown>;
		replacementTuning?: Partial<AutoDraftReplacementTuning>;
	}): Promise<AutoDraftCompareResponse> {
		const payload = await requestAutoDraftRunCompare(this.apiClient, {
			...args,
			timeoutMs: DEFAULT_COMPARE_TIMEOUT_MS,
		});
		return normalizeComparePayload(payload);
	}

	async submitCompareFeedback(args: {
		requestId?: string;
		items: AutoDraftCompareFeedbackItemInput[];
	}): Promise<AutoDraftCompareFeedbackResponse> {
		const payload = await requestAutoDraftSubmitCompareFeedback(
			this.apiClient,
			args,
		);
		return normalizeCompareFeedbackResponse(payload);
	}

	async exportCompareFeedback(): Promise<{
		requestId: string;
		events: unknown[];
		pairs: unknown[];
		metrics: unknown[];
	}> {
		const payload = await requestAutoDraftExportCompareFeedback(this.apiClient);
		if (!isRecord(payload)) {
			return { requestId: "", events: [], pairs: [], metrics: [] };
		}
		return {
			requestId: toNonEmptyString(payload.requestId),
			events: Array.isArray(payload.events) ? payload.events : [],
			pairs: Array.isArray(payload.pairs) ? payload.pairs : [],
			metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
		};
	}

	async exportReviewedRunBundle(args: {
		prepare: AutoDraftComparePrepareResponse;
		compare: AutoDraftCompareResponse;
		label?: string;
		notes?: string;
	}): Promise<AutoDraftReviewedRunBundle> {
		const payload = await requestAutoDraftExportReviewedRunBundle(
			this.apiClient,
			{
				...args,
				timeoutMs: DEFAULT_TIMEOUT_MS * 2,
			},
		);
		if (!isRecord(payload)) {
			throw new Error("Invalid reviewed run export response.");
		}
		const bundle = normalizeReviewedRunBundle(payload.bundle);
		if (!bundle) {
			throw new Error("Reviewed run bundle payload was invalid.");
		}
		return bundle;
	}

	async importCompareFeedback(args: {
		mode?: "merge" | "replace";
		events?: unknown[];
		pairs?: unknown[];
		metrics?: unknown[];
	}): Promise<AutoDraftCompareFeedbackResponse> {
		const payload = await requestAutoDraftImportCompareFeedback(
			this.apiClient,
			args,
		);
		return normalizeCompareFeedbackResponse(payload);
	}

	async trainLearningModels(args?: {
		domain?: string;
		domains?: string[];
	}): Promise<{
		requestId: string;
		results: Array<Record<string, unknown>>;
	}> {
		const payload = await requestAutoDraftTrainLearning(this.apiClient, {
			...args,
			timeoutMs: DEFAULT_TIMEOUT_MS * 3,
		});
		if (!isRecord(payload)) {
			return { requestId: "", results: [] };
		}
		return {
			requestId: toNonEmptyString(payload.requestId),
			results: Array.isArray(payload.results) ? payload.results : [],
		};
	}

	async listLearningModels(domain?: string): Promise<AutoDraftLearningModel[]> {
		const payload = await requestAutoDraftLearningModels(this.apiClient, domain);
		if (!isRecord(payload)) return [];
		const modelsRaw = Array.isArray(payload.models) ? payload.models : [];
		return modelsRaw
			.map((entry) => normalizeLearningModel(entry))
			.filter((entry): entry is AutoDraftLearningModel => entry !== null);
	}

	async listLearningEvaluations(args?: {
		domain?: string;
		limit?: number;
	}): Promise<AutoDraftLearningEvaluation[]> {
		const payload = await requestAutoDraftLearningEvaluations(
			this.apiClient,
			args,
		);
		if (!isRecord(payload)) return [];
		const evaluationsRaw = Array.isArray(payload.evaluations)
			? payload.evaluations
			: [];
		return evaluationsRaw
			.map((entry) => normalizeLearningEvaluation(entry))
			.filter(
				(entry): entry is AutoDraftLearningEvaluation => entry !== null,
			);
	}
}

export const autoDraftService = new AutoDraftService();
