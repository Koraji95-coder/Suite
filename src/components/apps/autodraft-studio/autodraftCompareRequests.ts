import type { AutoDraftApiClient } from "./autodraftApiClient";
import type {
	AutoDraftAgentReviewMode,
	AutoDraftCalibrationMode,
	AutoDraftCompareEngine,
	AutoDraftComparePoint,
	AutoDraftComparePrepareResponse,
	AutoDraftCompareResponse,
	AutoDraftCompareRoi,
	AutoDraftCompareFeedbackItemInput,
	AutoDraftPreparedMarkup,
	AutoDraftReplacementTuning,
	AutoDraftToleranceProfile,
} from "./autodraftService";

export function requestAutoDraftPrepareCompare(
	client: AutoDraftApiClient,
	args: {
		file: File;
		pageIndex: number;
		timeoutMs: number;
	},
) {
	const formData = new FormData();
	formData.append("pdf", args.file);
	formData.append("page_index", String(Math.max(0, Math.round(args.pageIndex))));
	return client.requestJson<unknown>(
		"/api/autodraft/compare/prepare",
		{
			method: "POST",
			body: formData,
		},
		args.timeoutMs,
		{ jsonContentType: false },
	);
}

export function requestAutoDraftRunCompare(
	client: AutoDraftApiClient,
	args: {
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
		timeoutMs: number;
	},
) {
	return client.requestJson<unknown>(
		"/api/autodraft/compare",
		{
			method: "POST",
			body: JSON.stringify({
				engine: args.engine,
				tolerance_profile: args.toleranceProfile,
				calibration_mode: args.calibrationMode ?? "auto",
				agent_review_mode: args.agentReviewMode ?? "pre",
				manual_override: args.manualOverride ?? false,
				markups: args.markups,
				pdf_points: args.pdfPoints ?? [],
				cad_points: args.cadPoints ?? [],
				roi: args.roi,
				calibration_seed: args.calibrationSeed,
				cad_context: args.cadContext,
				replacement_tuning: args.replacementTuning,
			}),
		},
		args.timeoutMs,
	);
}

export function requestAutoDraftSubmitCompareFeedback(
	client: AutoDraftApiClient,
	args: {
		requestId?: string;
		items: AutoDraftCompareFeedbackItemInput[];
	},
) {
	return client.requestJson<unknown>("/api/autodraft/compare/feedback", {
		method: "POST",
		body: JSON.stringify({
			requestId: args.requestId,
			items: args.items,
		}),
	});
}

export function requestAutoDraftExportCompareFeedback(client: AutoDraftApiClient) {
	return client.requestJson<unknown>("/api/autodraft/compare/feedback/export", {
		method: "GET",
	});
}

export function requestAutoDraftImportCompareFeedback(
	client: AutoDraftApiClient,
	args: {
		mode?: "merge" | "replace";
		events?: unknown[];
		pairs?: unknown[];
		metrics?: unknown[];
	},
) {
	return client.requestJson<unknown>("/api/autodraft/compare/feedback/import", {
		method: "POST",
		body: JSON.stringify({
			mode: args.mode ?? "merge",
			events: args.events ?? [],
			pairs: args.pairs ?? [],
			metrics: args.metrics ?? [],
		}),
	});
}

export function requestAutoDraftExportReviewedRunBundle(
	client: AutoDraftApiClient,
	args: {
		prepare: AutoDraftComparePrepareResponse;
		compare: AutoDraftCompareResponse;
		label?: string;
		notes?: string;
		timeoutMs: number;
	},
) {
	return client.requestJson<unknown>(
		"/api/autodraft/compare/reviewed-run/export",
		{
			method: "POST",
			body: JSON.stringify({
				requestId: args.compare.requestId,
				prepare: args.prepare,
				compare: args.compare,
				label: args.label,
				notes: args.notes,
			}),
		},
		args.timeoutMs,
	);
}
