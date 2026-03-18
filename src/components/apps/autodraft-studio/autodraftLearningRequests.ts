import type { AutoDraftApiClient } from "./autodraftApiClient";

export function requestAutoDraftTrainLearning(
	client: AutoDraftApiClient,
	args?: {
		domain?: string;
		domains?: string[];
		timeoutMs?: number;
	},
) {
	return client.requestJson<unknown>(
		"/api/autodraft/learning/train",
		{
			method: "POST",
			body: JSON.stringify({
				domain: args?.domain,
				domains: args?.domains,
			}),
		},
		args?.timeoutMs,
	);
}

export function requestAutoDraftLearningModels(
	client: AutoDraftApiClient,
	domain?: string,
) {
	const suffix = domain ? `?domain=${encodeURIComponent(domain)}` : "";
	return client.requestJson<unknown>(
		`/api/autodraft/learning/models${suffix}`,
		{
			method: "GET",
		},
	);
}

export function requestAutoDraftLearningEvaluations(
	client: AutoDraftApiClient,
	args?: {
		domain?: string;
		limit?: number;
	},
) {
	const params = new URLSearchParams();
	if (args?.domain) params.set("domain", args.domain);
	if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
		params.set("limit", String(Math.max(1, Math.trunc(args.limit))));
	}
	const suffix = params.toString() ? `?${params.toString()}` : "";
	return client.requestJson<unknown>(
		`/api/autodraft/learning/evaluations${suffix}`,
		{
			method: "GET",
		},
	);
}
