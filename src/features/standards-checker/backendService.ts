import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	CheckResult,
	ProjectStandardsLatestReview,
	ProjectStandardsProfile,
	ProjectStandardsProfileInput,
	StandardsNativeReviewSummary,
} from "./standardsCheckerModels";

interface ProjectStandardsProfileResponse {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: ProjectStandardsProfile;
	warnings?: string[];
	meta?: Record<string, unknown>;
}

export interface ProjectStandardsTicketResponse {
	ok: boolean;
	ticket: string;
	requestId: string;
	action: string;
	issuedAt: number;
	expiresAt: number;
	ttlSeconds: number;
	projectId?: string | null;
}

interface ProjectStandardsLatestReviewResponse {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: ProjectStandardsLatestReview;
	warnings?: string[];
	meta?: Record<string, unknown>;
}

function normalizeText(value: unknown): string {
	return String(value ?? "").trim();
}

class StandardsCheckerBackendService {
	private readonly baseUrl = (
		import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000"
	)
		.trim()
		.replace(/\/+$/, "");

	private readonly apiKey = import.meta.env.VITE_API_KEY ?? "";

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"StandardsCheckerBackendService",
					"Unable to resolve Supabase session",
					{ error: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.error(
				"StandardsCheckerBackendService",
				"Unexpected auth lookup failure",
				error,
			);
			return null;
		}
	}

	private async buildHeaders(options?: {
		includeContentType?: boolean;
	}): Promise<Record<string, string>> {
		const headers: Record<string, string> = {};
		if (options?.includeContentType !== false) {
			headers["Content-Type"] = "application/json";
		}
		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		} else if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}
		return headers;
	}

	private async requestJson<T>(
		path: string,
		options?: {
			method?: "GET" | "POST" | "PUT";
			body?: unknown;
			timeoutMs?: number;
			includeContentType?: boolean;
		},
	): Promise<T> {
		const method = options?.method || "GET";
		const headers = await this.buildHeaders({
			includeContentType: options?.includeContentType ?? method !== "GET",
		});
		const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
			method,
			headers,
			credentials: "include",
			body: method === "GET" ? undefined : JSON.stringify(options?.body ?? {}),
			timeoutMs: options?.timeoutMs ?? 30_000,
			requestName: "Project standards backend request",
		});
		const parsed = (await response.clone().json().catch(() => null)) as T | null;
		if (!response.ok) {
			throw new Error(
				await parseResponseErrorMessage(
					response,
					"Project standards backend request failed.",
				),
			);
		}
		if (parsed === null) {
			throw new Error("Project standards backend returned an empty response.");
		}
		return parsed;
	}

	async fetchProfile(
		projectId: string,
	): Promise<{ data: ProjectStandardsProfile | null; error: Error | null }> {
		try {
			const response = await this.requestJson<ProjectStandardsProfileResponse>(
				`/api/project-standards/projects/${encodeURIComponent(projectId)}/profile`,
			);
			if (!response.success || !response.data) {
				return {
					data: null,
					error: new Error(
						response.message || "Failed to load project standards profile.",
					),
				};
			}
			return {
				data: response.data,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error:
					error instanceof Error
						? error
						: new Error("Failed to load project standards profile."),
			};
		}
	}

	async fetchLatestReview(
		projectId: string,
	): Promise<{ data: ProjectStandardsLatestReview | null; error: Error | null }> {
		try {
			const response = await this.requestJson<ProjectStandardsLatestReviewResponse>(
				`/api/project-standards/projects/${encodeURIComponent(projectId)}/latest-review`,
			);
			if (!response.success || !response.data) {
				return {
					data: null,
					error: new Error(
						response.message || "Failed to load latest native standards review.",
					),
				};
			}
			return {
				data: response.data,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error:
					error instanceof Error
						? error
						: new Error("Failed to load latest native standards review."),
			};
		}
	}

	async saveProfile(
		projectId: string,
		payload: ProjectStandardsProfileInput,
	): Promise<ProjectStandardsProfile> {
		try {
			const response = await this.requestJson<ProjectStandardsProfileResponse>(
				`/api/project-standards/projects/${encodeURIComponent(projectId)}/profile`,
				{
					method: "PUT",
					body: payload,
				},
			);
			if (!response.success || !response.data) {
				throw new Error(
					response.message || "Failed to save project standards profile.",
				);
			}
			return response.data;
		} catch (error) {
			if (error instanceof FetchRequestError) {
				throw new Error(
					mapFetchErrorMessage(
						error,
						"Unable to save project standards defaults.",
					),
				);
			}
			throw error instanceof Error
				? error
				: new Error(normalizeText(error) || "Failed to save project standards profile.");
		}
	}

	async issueTicket(args: {
		action: string;
		projectId?: string | null;
		requestId?: string | null;
		ttlSeconds?: number;
	}): Promise<ProjectStandardsTicketResponse> {
		try {
			return await this.requestJson<ProjectStandardsTicketResponse>(
				"/api/project-standards/tickets",
				{
					method: "POST",
					body: {
						action: args.action,
						projectId: args.projectId ?? null,
						requestId:
							args.requestId ?? `project-standards-${Date.now()}`,
						origin:
							typeof window !== "undefined"
								? window.location.origin
								: "",
						ttlSeconds: args.ttlSeconds ?? 180,
					},
				},
			);
		} catch (error) {
			if (error instanceof FetchRequestError) {
				throw new Error(
					mapFetchErrorMessage(
						error,
						"Unable to issue a local standards-review ticket.",
					),
				);
			}
			throw error;
		}
	}

	async recordResult(payload: {
		projectId: string;
		requestId?: string | null;
		cadFamilyId?: string | null;
		standardsCategory: string;
		selectedStandardIds: string[];
		results: CheckResult[];
		warnings?: string[];
		summary?: StandardsNativeReviewSummary | null;
		meta?: Record<string, unknown> | null;
	}): Promise<ProjectStandardsLatestReview | null> {
		try {
			const response =
				await this.requestJson<ProjectStandardsLatestReviewResponse>(
					"/api/project-standards/results",
					{
						method: "POST",
						body: {
							projectId: payload.projectId,
							requestId: payload.requestId ?? null,
							recordedAt: new Date().toISOString(),
							cadFamilyId: payload.cadFamilyId ?? null,
							standardsCategory: payload.standardsCategory,
							selectedStandardIds: payload.selectedStandardIds,
							results: payload.results,
							warnings: payload.warnings ?? [],
							summary: payload.summary ?? {},
							meta: payload.meta ?? {},
						},
					},
				);
			if (!response.success || !response.data) {
				throw new Error(
					response.message || "Failed to record native standards review.",
				);
			}
			return response.data;
		} catch (error) {
			logger.warn(
				"StandardsCheckerBackendService",
				"Unable to record native standards review.",
				{ error: error instanceof Error ? error.message : String(error) },
			);
			return null;
		}
	}
}

export const standardsCheckerBackendService =
	new StandardsCheckerBackendService();
