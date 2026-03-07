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

const withTimeout = (
	timeoutMs: number,
	signal?: AbortSignal,
): { signal: AbortSignal; clear: () => void } => {
	const controller = new AbortController();
	const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
	if (signal) {
		if (signal.aborted) controller.abort();
		else
			signal.addEventListener("abort", () => controller.abort(), {
				once: true,
			});
	}
	return {
		signal: controller.signal,
		clear: () => globalThis.clearTimeout(timer),
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
		try {
			const payload = (await response.json()) as
				| { error?: string; message?: string; detail?: string }
				| undefined;
			return (
				payload?.error ||
				payload?.message ||
				payload?.detail ||
				`Request failed (${response.status})`
			);
		} catch {
			return `Request failed (${response.status})`;
		}
	}

	private async requestJson<T>(
		path: string,
		init: RequestInit = {},
		timeoutMs = DEFAULT_TIMEOUT_MS,
	): Promise<T> {
		const { signal, clear } = withTimeout(timeoutMs, init.signal ?? undefined);
		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				...init,
				headers: this.getHeaders(init.headers || {}),
				signal,
			});
			if (!response.ok) {
				throw new Error(await this.parseError(response));
			}
			return (await response.json()) as T;
		} finally {
			clear();
		}
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
}

export const autoDraftService = new AutoDraftService();
