import { mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import { projectSetupBackendService } from "@/features/project-setup";
import { standardsCheckerBackendService } from "./backendService";
import {
	STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE,
	standardsCheckerCompanionService,
} from "./companionService";
import type {
	CheckResult,
	StandardsCategory,
	StandardsNativeReviewSummary,
} from "./standardsCheckerModels";

export interface StandardsCheckerRunOutcome {
	success: boolean;
	code: string;
	message: string;
	requestId?: string;
	results: CheckResult[];
	warnings: string[];
	summary: StandardsNativeReviewSummary | null;
	meta?: Record<string, unknown>;
}

function buildFailureResults(
	selectedStandardIds: string[],
	message: string,
	code = "NATIVE_REVIEW_FAILED",
): CheckResult[] {
	return selectedStandardIds.map((standardId) => ({
		standardId,
		status: "fail",
		message,
		meta: {
			code,
		},
	}));
}

class StandardsCheckerActionService {
	async runReview(args: {
		projectId: string;
		cadFamilyId: string | null;
		standardsCategory: StandardsCategory;
		selectedStandardIds: string[];
	}): Promise<StandardsCheckerRunOutcome> {
		if (!args.projectId) {
			return {
				success: false,
				code: "INVALID_REQUEST",
				message: "Select a project before running native standards review.",
				results: buildFailureResults(
					args.selectedStandardIds,
					"Select a project before running native standards review.",
					"INVALID_REQUEST",
				),
				warnings: [],
				summary: null,
			};
		}

		if (args.selectedStandardIds.length === 0) {
			return {
				success: false,
				code: "INVALID_REQUEST",
				message: "Select at least one standard before running review.",
				results: [],
				warnings: [],
				summary: null,
			};
		}

		const profile = await projectSetupBackendService.fetchProfile({
			projectId: args.projectId,
			projectRootPath: null,
		});
		const projectRootPath = String(profile.data?.project_root_path || "").trim();
		if (!projectRootPath) {
			const message =
				"Project setup must capture a project root before native standards review can run.";
			return {
				success: false,
				code: "PROJECT_ROOT_REQUIRED",
				message,
				results: buildFailureResults(
					args.selectedStandardIds,
					message,
					"PROJECT_ROOT_REQUIRED",
				),
				warnings: [],
				summary: null,
			};
		}

		let ticket;
		try {
			ticket = await standardsCheckerBackendService.issueTicket({
				action: "run-review",
				projectId: args.projectId,
				requestId: `project-standards-${args.projectId}-${Date.now()}`,
			});
		} catch (error) {
			const message = mapFetchErrorMessage(
				error,
				"Unable to prepare a local standards-review ticket.",
			);
			return {
				success: false,
				code: "TICKET_ISSUE_FAILED",
				message,
				results: buildFailureResults(
					args.selectedStandardIds,
					message,
					"TICKET_ISSUE_FAILED",
				),
				warnings: [],
				summary: null,
			};
		}

		let response;
		try {
			response = await standardsCheckerCompanionService.runReview(ticket, {
				projectId: args.projectId,
				projectRootPath,
				cadFamilyId: args.cadFamilyId,
				standardsCategory: args.standardsCategory,
				selectedStandardIds: args.selectedStandardIds,
			});
		} catch (error) {
			const message = mapFetchErrorMessage(
				error,
				STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE,
			);
			return {
				success: false,
				code: "LOCAL_RUNTIME_UNAVAILABLE",
				message,
				results: buildFailureResults(
					args.selectedStandardIds,
					message,
					"LOCAL_RUNTIME_UNAVAILABLE",
				),
				warnings: [],
				summary: null,
			};
		}

		const outcome: StandardsCheckerRunOutcome = {
			success: response.success,
			code: response.code || (response.success ? "" : "NATIVE_REVIEW_FAILED"),
			message:
				String(response.message || "").trim() ||
				(response.success
					? "Native standards review completed."
					: "Native standards review failed."),
			requestId: response.requestId,
			results:
				response.data?.results && response.data.results.length > 0
					? response.data.results
					: buildFailureResults(
							args.selectedStandardIds,
							String(response.message || "").trim() ||
								"Native standards review failed.",
							response.code || "NATIVE_REVIEW_FAILED",
						),
			warnings: response.warnings ?? [],
			summary: response.data?.summary ?? null,
			meta: response.meta,
		};

		await standardsCheckerBackendService.recordResult({
			projectId: args.projectId,
			requestId: outcome.requestId ?? null,
			cadFamilyId: args.cadFamilyId,
			standardsCategory: args.standardsCategory,
			selectedStandardIds: args.selectedStandardIds,
			results: outcome.results,
			warnings: outcome.warnings,
			summary: outcome.summary ?? {},
			meta: {
				...(outcome.meta || {}),
				projectRootPath,
			},
		});

		return outcome;
	}
}

export const standardsCheckerActionService =
	new StandardsCheckerActionService();
