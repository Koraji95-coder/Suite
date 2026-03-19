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
		workflowContext?: {
			projectId?: string;
			projectName?: string;
			lane?: string;
			phase?: string;
			workflowId?: string;
			itemId?: string;
			summary?: string;
		};
		revisionContext?: {
			projectId?: string;
			fileId?: string;
			drawingNumber?: string;
			title?: string;
			revision?: string;
			previousRevision?: string;
			issueSummary?: string;
			notes?: string;
		};
	},
) {
	const workflowContext = options?.workflowContext
		? {
				project_id: options.workflowContext.projectId,
				project_name: options.workflowContext.projectName,
				lane: options.workflowContext.lane,
				phase: options.workflowContext.phase,
				workflow_id: options.workflowContext.workflowId,
				item_id: options.workflowContext.itemId,
				summary: options.workflowContext.summary,
			}
		: undefined;
	const revisionContext = options?.revisionContext
		? {
				project_id: options.revisionContext.projectId,
				file_id: options.revisionContext.fileId,
				drawing_number: options.revisionContext.drawingNumber,
				title: options.revisionContext.title,
				revision: options.revisionContext.revision,
				previous_revision: options.revisionContext.previousRevision,
				issue_summary: options.revisionContext.issueSummary,
				notes: options.revisionContext.notes,
			}
		: undefined;
	return client.requestJson<unknown>("/api/autodraft/execute", {
		method: "POST",
		body: JSON.stringify({
			actions,
			dry_run: options?.dryRun ?? true,
			backcheck_request_id: options?.backcheckRequestId,
			backcheck_override_reason: options?.backcheckOverrideReason,
			backcheck_fail_count: options?.backcheckFailCount ?? 0,
			workflow_context: workflowContext,
			revision_context: revisionContext,
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
