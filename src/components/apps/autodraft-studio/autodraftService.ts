import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { RULE_LIBRARY, type AutoDraftRule } from "./autodraftData";

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
};

export type AutoDraftBackcheckFinding = {
	id: string;
	action_id: string;
	status: "pass" | "warn" | "fail" | string;
	severity: "low" | "medium" | "high" | string;
	category: string;
	notes: string[];
	suggestions: string[];
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

const DEFAULT_TIMEOUT_MS = 20_000;

const FALLBACK_HEALTH: AutoDraftHealth = {
	ok: false,
	mode: "offline",
	dotnet: {
		configured: false,
		reachable: false,
		error: "Backend unavailable.",
	},
};

const FALLBACK_RULE_BY_CATEGORY: Record<AutoDraftRule["category"], AutoDraftRule> = {
	DELETE: RULE_LIBRARY.find((rule) => rule.category === "DELETE") ?? RULE_LIBRARY[0],
	ADD: RULE_LIBRARY.find((rule) => rule.category === "ADD") ?? RULE_LIBRARY[0],
	NOTE: RULE_LIBRARY.find((rule) => rule.category === "NOTE") ?? RULE_LIBRARY[0],
	SWAP: RULE_LIBRARY.find((rule) => rule.category === "SWAP") ?? RULE_LIBRARY[0],
	TITLE_BLOCK:
		RULE_LIBRARY.find((rule) => rule.category === "TITLE_BLOCK") ?? RULE_LIBRARY[0],
	BLOCK_REF:
		RULE_LIBRARY.find((rule) => rule.category === "BLOCK_REF") ?? RULE_LIBRARY[0],
	REVISION_CLOUD:
		RULE_LIBRARY.find((rule) => rule.category === "REVISION_CLOUD") ?? RULE_LIBRARY[0],
	DIMENSION:
		RULE_LIBRARY.find((rule) => rule.category === "DIMENSION") ?? RULE_LIBRARY[0],
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
					typeof payload.dotnet.base_url === "string" ? payload.dotnet.base_url : null,
				error: typeof payload.dotnet.error === "string" ? payload.dotnet.error : null,
			}
		: FALLBACK_HEALTH.dotnet;

	return {
		ok: Boolean(payload.ok),
		app: toNonEmptyString(payload.app),
		mode: toNonEmptyString(payload.mode, "unknown"),
		dotnet,
		elapsed_ms:
			typeof payload.elapsed_ms === "number" && Number.isFinite(payload.elapsed_ms)
				? payload.elapsed_ms
				: undefined,
	};
};

const normalizeRule = (payload: unknown, index: number): AutoDraftRule | null => {
	if (!isRecord(payload)) return null;

	const defaultRule = RULE_LIBRARY[index % RULE_LIBRARY.length] ?? RULE_LIBRARY[0];
	const rawCategory = toNonEmptyString(payload.category, defaultRule.category).toUpperCase();
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

const normalizeAction = (payload: unknown, index: number): AutoDraftAction | null => {
	if (!isRecord(payload)) return null;
	return {
		id: toNonEmptyString(payload.id, `action-${index + 1}`),
		rule_id: typeof payload.rule_id === "string" ? payload.rule_id : null,
		category: toNonEmptyString(payload.category, "UNCLASSIFIED"),
		action: toNonEmptyString(payload.action, "Manual review required."),
		confidence: toConfidence(payload.confidence, 0),
		status: toNonEmptyString(payload.status, "review"),
		markup: isRecord(payload.markup) ? payload.markup : {},
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
			total_markups: toInt(summaryRaw?.total_markups, fallbackSummary.total_markups),
			actions_proposed: toInt(
				summaryRaw?.actions_proposed,
				fallbackSummary.actions_proposed,
			),
			classified: toInt(summaryRaw?.classified, fallbackSummary.classified),
			needs_review: toInt(summaryRaw?.needs_review, fallbackSummary.needs_review),
		},
	};
};

const normalizeExecutePayload = (payload: unknown): AutoDraftExecuteResponse => {
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

	return {
		ok: Boolean(payload.ok),
		source: toNonEmptyString(payload.source, "unknown"),
		job_id: toNonEmptyString(payload.job_id),
		status: toNonEmptyString(payload.status, "unknown"),
		accepted: toInt(payload.accepted, 0),
		skipped: toInt(payload.skipped, 0),
		dry_run: Boolean(payload.dry_run),
		message: toNonEmptyString(payload.message) || undefined,
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
		? payload.suggestions.filter((item): item is string => typeof item === "string")
		: [];
	return {
		id: toNonEmptyString(payload.id, `finding-${index + 1}`),
		action_id: toNonEmptyString(payload.action_id, `action-${index + 1}`),
		status: toNonEmptyString(payload.status, "warn"),
		severity: toNonEmptyString(payload.severity, "medium"),
		category: toNonEmptyString(payload.category, "unclassified"),
		notes,
		suggestions,
	};
};

const normalizeBackcheckPayload = (payload: unknown): AutoDraftBackcheckResponse => {
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
		? payload.warnings.filter((item): item is string => typeof item === "string")
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

class AutoDraftService {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor() {
		this.baseUrl = (
			import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000"
		).replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY || "";
	}

	private getHeaders(extra: HeadersInit = {}): HeadersInit {
		return {
			"Content-Type": "application/json",
			"X-API-Key": this.apiKey,
			...extra,
		};
	}

	private async parseError(response: Response): Promise<string> {
		return parseResponseErrorMessage(
			response,
			`Request failed (${response.status})`,
		);
	}

	private async requestJson<T>(
		path: string,
		init: RequestInit = {},
		timeoutMs = DEFAULT_TIMEOUT_MS,
	): Promise<T> {
		const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
			...init,
			headers: this.getHeaders(init.headers || {}),
			timeoutMs,
			requestName: `AutoDraft request (${path})`,
		});
		if (!response.ok) {
			throw new Error(await this.parseError(response));
		}
		return (await response.json()) as T;
	}

	async health(): Promise<AutoDraftHealth> {
		try {
			const payload = await this.requestJson<unknown>("/api/autodraft/health", {
				method: "GET",
			});
			return normalizeHealthPayload(payload);
		} catch (error) {
			logger.warn("AutoDraft health failed", "AutoDraftService", { error });
			return FALLBACK_HEALTH;
		}
	}

	async listRules(): Promise<AutoDraftRule[]> {
		try {
			const payload = await this.requestJson<unknown>("/api/autodraft/rules", {
				method: "GET",
			});
			const rulesRaw =
				isRecord(payload) && Array.isArray(payload.rules) ? payload.rules : [];
			const rules = rulesRaw
				.map((item, index) => normalizeRule(item, index))
				.filter((item): item is AutoDraftRule => item !== null);

			if (rulesRaw.length > 0 && rules.length !== rulesRaw.length) {
				logger.warn("AutoDraft rules payload contained invalid entries", "AutoDraftService", {
					expected: rulesRaw.length,
					normalized: rules.length,
				});
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
		const payload = await this.requestJson<unknown>("/api/autodraft/plan", {
			method: "POST",
			body: JSON.stringify({ markups }),
		});
		return normalizePlanPayload(payload);
	}

	async execute(
		actions: AutoDraftAction[],
		options?: { dryRun?: boolean },
	): Promise<AutoDraftExecuteResponse> {
		const payload = await this.requestJson<unknown>("/api/autodraft/execute", {
			method: "POST",
			body: JSON.stringify({
				actions,
				dry_run: options?.dryRun ?? true,
			}),
		});
		return normalizeExecutePayload(payload);
	}

	async backcheck(
		actions: AutoDraftAction[],
		options?: {
			cadContext?: Record<string, unknown>;
			requireCadContext?: boolean;
		},
	): Promise<AutoDraftBackcheckResponse> {
		const payload = await this.requestJson<unknown>("/api/autodraft/backcheck", {
			method: "POST",
			body: JSON.stringify({
				actions,
				cad_context: options?.cadContext,
				require_cad_context: options?.requireCadContext ?? false,
			}),
		});
		return normalizeBackcheckPayload(payload);
	}
}

export const autoDraftService = new AutoDraftService();
