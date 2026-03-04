import { logger } from "@/lib/logger";
import type { AutoDraftRule } from "./autodraftData";

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
			return await this.requestJson<AutoDraftHealth>("/api/autodraft/health", {
				method: "GET",
			});
		} catch (error) {
			logger.warn("AutoDraft health failed", "AutoDraftService", { error });
			return {
				ok: false,
				mode: "offline",
				dotnet: {
					configured: false,
					reachable: false,
					error: "Backend unavailable.",
				},
			};
		}
	}

	async listRules(): Promise<AutoDraftRule[]> {
		try {
			const result = await this.requestJson<{
				ok: boolean;
				rules?: AutoDraftRule[];
			}>("/api/autodraft/rules", { method: "GET" });
			return Array.isArray(result.rules) ? result.rules : [];
		} catch (error) {
			logger.warn("AutoDraft rules fetch failed", "AutoDraftService", {
				error,
			});
			return [];
		}
	}

	async plan(markups: MarkupInput[]): Promise<AutoDraftPlanResponse> {
		return this.requestJson<AutoDraftPlanResponse>("/api/autodraft/plan", {
			method: "POST",
			body: JSON.stringify({ markups }),
		});
	}
}

export const autoDraftService = new AutoDraftService();
