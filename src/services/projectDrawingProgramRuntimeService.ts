import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import type { TitleBlockSyncProfile } from "@/features/project-setup/types";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type {
	ProjectDrawingProgramPlan,
	ProjectDrawingProgramRecord,
} from "@/services/projectDrawingProgramService";

interface DrawingProgramRuntimeResponse {
	success: boolean;
	message: string;
	requestId?: string;
	data?: {
		program: ProjectDrawingProgramRecord;
		workbookPath?: string;
		wdpPath?: string;
		createdFiles?: string[];
		renamedFiles?: Array<{
			fromRelativePath: string;
			toRelativePath: string;
		}>;
	};
	warnings?: string[];
	error?: string;
}

interface DrawingProgramRuntimePayload {
	projectId: string;
	projectRootPath: string;
	profile: TitleBlockSyncProfile;
	program: ProjectDrawingProgramRecord;
	plan?: ProjectDrawingProgramPlan;
}

class ProjectDrawingProgramRuntimeService {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor() {
		this.baseUrl =
			(import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000")
				.trim()
				.replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
	}

	private async getAccessToken() {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to resolve Supabase session for drawing program runtime service.",
					"ProjectDrawingProgramRuntimeService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.error(
				"Unexpected drawing program auth resolution error.",
				"ProjectDrawingProgramRuntimeService",
				error,
			);
			return null;
		}
	}

	private async buildHeaders() {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": `drawing-program-${Date.now()}`,
		};
		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
			return headers;
		}
		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}
		return headers;
	}

	private async requestJson(
		path: string,
		payload: DrawingProgramRuntimePayload,
	): Promise<DrawingProgramRuntimeResponse> {
		const headers = await this.buildHeaders();
		try {
			const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
				method: "POST",
				headers,
				credentials: "include",
				body: JSON.stringify(payload),
				timeoutMs: 120_000,
				requestName: "Drawing program runtime request",
			});
			const parsed = (await response
				.clone()
				.json()
				.catch(() => null)) as DrawingProgramRuntimeResponse | null;
			if (!response.ok) {
				return {
					success: false,
					message:
						parsed?.error ||
						parsed?.message ||
						(await parseResponseErrorMessage(
							response,
							`Drawing program request failed (${response.status})`,
						)),
					requestId: parsed?.requestId,
					warnings: parsed?.warnings || [],
					data: parsed?.data,
				};
			}
			if (parsed && typeof parsed.success === "boolean") {
				return parsed;
			}
			return {
				success: false,
				message: "Drawing program runtime returned an unexpected payload.",
			};
		} catch (error) {
			if (error instanceof FetchRequestError) {
				return {
					success: false,
					message: mapFetchErrorMessage(
						error,
						"Drawing program request failed.",
					),
				};
			}
			return {
				success: false,
				message: mapFetchErrorMessage(error, "Drawing program request failed."),
			};
		}
	}

	applyPlan(payload: DrawingProgramRuntimePayload) {
		return this.requestJson("/api/drawing-program/apply-plan", payload);
	}

	syncAcade(payload: DrawingProgramRuntimePayload) {
		return this.requestJson("/api/drawing-program/sync-acade", payload);
	}
}

export const projectDrawingProgramRuntimeService =
	new ProjectDrawingProgramRuntimeService();
