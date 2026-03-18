import type { AutoDraftApiClient } from "./autodraftApiClient";
import type { AutoDraftAction, MarkupInput } from "./autodraftService";

export function requestAutoDraftHealth(client: AutoDraftApiClient) {
	return client.requestJson<unknown>("/api/autodraft/health", {
		method: "GET",
	});
}

export function requestAutoDraftRules(client: AutoDraftApiClient) {
	return client.requestJson<unknown>("/api/autodraft/rules", {
		method: "GET",
	});
}

export function requestAutoDraftPlan(
	client: AutoDraftApiClient,
	markups: MarkupInput[],
) {
	return client.requestJson<unknown>("/api/autodraft/plan", {
		method: "POST",
		body: JSON.stringify({ markups }),
	});
}

export function requestAutoDraftExecute(
	client: AutoDraftApiClient,
	actions: AutoDraftAction[],
	options?: {
		dryRun?: boolean;
		backcheckRequestId?: string;
		backcheckOverrideReason?: string;
		backcheckFailCount?: number;
	},
) {
	return client.requestJson<unknown>("/api/autodraft/execute", {
		method: "POST",
		body: JSON.stringify({
			actions,
			dry_run: options?.dryRun ?? true,
			backcheck_request_id: options?.backcheckRequestId,
			backcheck_override_reason: options?.backcheckOverrideReason,
			backcheck_fail_count: options?.backcheckFailCount ?? 0,
		}),
	});
}

export function requestAutoDraftBackcheck(
	client: AutoDraftApiClient,
	actions: AutoDraftAction[],
	options?: {
		cadContext?: Record<string, unknown>;
		requireCadContext?: boolean;
	},
) {
	return client.requestJson<unknown>("/api/autodraft/backcheck", {
		method: "POST",
		body: JSON.stringify({
			actions,
			cad_context: options?.cadContext,
			require_cad_context: options?.requireCadContext ?? false,
		}),
	});
}
