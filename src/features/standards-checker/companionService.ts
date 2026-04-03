import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import type { ProjectStandardsTicketResponse } from "./backendService";
import type {
	CheckResult,
	StandardsNativeReviewSummary,
	StandardsCategory,
} from "./standardsCheckerModels";

export interface StandardsCheckerCompanionRunData {
	results: CheckResult[];
	summary: StandardsNativeReviewSummary;
	dwsPaths: string[];
	inspectedDrawings: string[];
	layerAlerts: string[];
}

export interface StandardsCheckerCompanionResponse<TData> {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: TData;
	warnings?: string[];
	meta?: Record<string, unknown>;
}

const RUNTIME_CONTROL_BASE_URL = (
	import.meta.env.VITE_RUNTIME_CONTROL_PICKER_URL || "http://127.0.0.1:57421"
)
	.trim()
	.replace(/\/+$/, "");

export const STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE =
	"Suite Runtime Control is unavailable on this workstation. Start it, then try again. Standards defaults can still be saved without native review.";

class StandardsCheckerCompanionService {
	private async requestJson<T>(
		path: string,
		args: {
			ticket: ProjectStandardsTicketResponse;
			body?: Record<string, unknown>;
			timeoutMs?: number;
		},
	): Promise<StandardsCheckerCompanionResponse<T>> {
		try {
			const response = await fetchWithTimeout(
				`${RUNTIME_CONTROL_BASE_URL}${path}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						ticket: args.ticket.ticket,
						requestId: args.ticket.requestId,
						...(args.body || {}),
					}),
					timeoutMs: args.timeoutMs ?? 120_000,
					requestName: "Runtime Control standards review action",
					diagnosticsMode: "silent",
				},
			);

			const parsed = (await response
				.clone()
				.json()
				.catch(() => null)) as StandardsCheckerCompanionResponse<T> | null;

			if (!response.ok) {
				if (parsed && typeof parsed.success === "boolean") {
					return parsed;
				}
				throw new Error(
					await parseResponseErrorMessage(
						response,
						STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE,
					),
				);
			}

			if (!parsed) {
				throw new Error("Runtime Control returned an empty response.");
			}

			return parsed;
		} catch (error) {
			if (
				error instanceof FetchRequestError &&
				(error.kind === "network" ||
					error.kind === "timeout" ||
					error.kind === "aborted")
			) {
				throw new Error(
					mapFetchErrorMessage(
						error,
						STANDARDS_CHECKER_COMPANION_UNAVAILABLE_MESSAGE,
					),
				);
			}
			throw error;
		}
	}

	async runReview(
		ticket: ProjectStandardsTicketResponse,
		args: {
			projectId: string;
			projectRootPath: string;
			cadFamilyId: string | null;
			standardsCategory: StandardsCategory;
			selectedStandardIds: string[];
		},
	) {
		return await this.requestJson<StandardsCheckerCompanionRunData>(
			"/api/workstation/project-standards/run-review",
			{
				ticket,
				body: {
					projectId: args.projectId,
					projectRootPath: args.projectRootPath,
					cadFamilyId: args.cadFamilyId,
					standardsCategory: args.standardsCategory,
					selectedStandardIds: args.selectedStandardIds,
				},
				timeoutMs: 120_000,
			},
		);
	}
}

export const standardsCheckerCompanionService =
	new StandardsCheckerCompanionService();
