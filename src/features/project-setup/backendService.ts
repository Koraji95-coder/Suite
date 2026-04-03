import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import type { TitleBlockSyncPayload, TitleBlockSyncResponse } from "./types";

export type ProjectSetupProfileRow =
	Database["public"]["Tables"]["project_title_block_profiles"]["Row"];

export interface ProjectSetupTicketResponse {
	ok: boolean;
	ticket: string;
	requestId: string;
	action: string;
	issuedAt: number;
	expiresAt: number;
	ttlSeconds: number;
	projectId?: string | null;
}

interface ProjectSetupProfileResponse {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: ProjectSetupProfileRow;
	warnings?: string[];
	meta?: Record<string, unknown>;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

class ProjectSetupBackendService {
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
					"ProjectSetupBackendService",
					"Unable to resolve Supabase session",
					{ error: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.error(
				"ProjectSetupBackendService",
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
			query?: Record<string, string | null | undefined>;
		},
	): Promise<T> {
		const method = options?.method || "GET";
		const headers = await this.buildHeaders({
			includeContentType:
				options?.includeContentType ?? method !== "GET",
		});
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(options?.query || {})) {
			if (!normalizeText(value)) continue;
			query.set(key, String(value));
		}
		const suffix = query.toString() ? `?${query.toString()}` : "";

		const response = await fetchWithTimeout(`${this.baseUrl}${path}${suffix}`, {
			method,
			headers,
			credentials: "include",
			body: method === "GET" ? undefined : JSON.stringify(options?.body ?? {}),
			timeoutMs: options?.timeoutMs ?? 30_000,
			requestName: "Project setup backend request",
		});
		const parsed = (await response.clone().json().catch(() => null)) as T | null;
		if (!response.ok) {
			throw new Error(
				await parseResponseErrorMessage(
					response,
					"Project setup backend request failed.",
				),
			);
		}
		if (parsed === null) {
			throw new Error("Project setup backend returned an empty response.");
		}
		return parsed;
	}

	async issueTicket(args: {
		action: string;
		projectId?: string | null;
		requestId?: string | null;
		ttlSeconds?: number;
	}): Promise<ProjectSetupTicketResponse> {
		try {
			return await this.requestJson<ProjectSetupTicketResponse>(
				"/api/project-setup/tickets",
				{
					method: "POST",
					body: {
						action: args.action,
						projectId: args.projectId ?? null,
						requestId:
							args.requestId ?? `project-setup-${Date.now()}`,
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
						"Unable to issue a local project-setup ticket.",
					),
				);
			}
			throw error;
		}
	}

	async fetchProfile(args: {
		projectId: string;
		projectRootPath?: string | null;
	}): Promise<{ data: ProjectSetupProfileRow; error: Error | null }> {
		try {
			const response = await this.requestJson<ProjectSetupProfileResponse>(
				`/api/project-setup/projects/${encodeURIComponent(args.projectId)}/profile`,
				{
					query: {
						projectRootPath: args.projectRootPath ?? null,
					},
				},
			);
			if (!response.success || !response.data) {
				return {
					data: {} as ProjectSetupProfileRow,
					error: new Error(response.message || "Failed to load project setup profile."),
				};
			}
			return {
				data: response.data,
				error: null,
			};
		} catch (error) {
			return {
				data: {} as ProjectSetupProfileRow,
				error:
					error instanceof Error
						? error
						: new Error("Failed to load project setup profile."),
			};
		}
	}

	async saveProfile(
		projectId: string,
		payload: Record<string, unknown>,
	): Promise<ProjectSetupProfileRow> {
		const response = await this.requestJson<ProjectSetupProfileResponse>(
			`/api/project-setup/projects/${encodeURIComponent(projectId)}/profile`,
			{
				method: "PUT",
				body: payload,
			},
		);
		if (!response.success || !response.data) {
			throw new Error(response.message || "Failed to save project setup profile.");
		}
		return response.data;
	}

	async buildPreview(
		payload: TitleBlockSyncPayload & {
			scanSnapshot?: unknown | null;
		},
	): Promise<TitleBlockSyncResponse> {
		return await this.requestJson<TitleBlockSyncResponse>(
			"/api/project-setup/preview",
			{
				method: "POST",
				body: payload,
				timeoutMs: 120_000,
			},
		);
	}

	async recordResult(payload: Record<string, unknown>) {
		try {
			await this.requestJson<{ ok: boolean; requestId?: string; message?: string }>(
				"/api/project-setup/results",
				{
					method: "POST",
					body: payload,
				},
			);
		} catch (error) {
			logger.warn(
				"ProjectSetupBackendService",
				"Unable to record project setup local action result.",
				{ error: error instanceof Error ? error.message : String(error) },
			);
		}
	}
}

export const projectSetupBackendService = new ProjectSetupBackendService();
