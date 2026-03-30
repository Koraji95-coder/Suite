import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";

export interface TitleBlockSyncProfile {
	blockName: string;
	projectRootPath: string | null;
	acadeProjectFilePath?: string | null;
	acadeLine1: string;
	acadeLine2: string;
	acadeLine4: string;
	signerDrawnBy: string;
	signerCheckedBy: string;
	signerEngineer: string;
}

export interface TitleBlockEditableFields {
	scale: string;
	drawnBy: string;
	drawnDate: string;
	checkedBy: string;
	checkedDate: string;
	engineer: string;
	engineerDate: string;
}

export interface TitleBlockSyncPendingWrite {
	attributeTag: string;
	previousValue: string;
	nextValue: string;
}

export interface TitleBlockRevisionDisplayRow {
	revision: string;
	description: string;
	by: string;
	checkedBy: string;
	date: string;
}

export interface TitleBlockSyncRow {
	id: string;
	fileName: string;
	relativePath: string;
	absolutePath: string;
	fileType: string;
	filenameDrawingNumber: string;
	filenameTitle: string;
	filenameRevision: string;
	titleBlockFound: boolean;
	effectiveBlockName: string;
	layoutName: string;
	titleBlockHandle: string;
	hasWdTbConflict: boolean;
	currentAttributes: Record<string, string>;
	editableFields: TitleBlockEditableFields;
	issues: string[];
	warnings: string[];
	revisionEntryCount: number;
	drawingNumber: string;
	drawingTitle: string;
	acadeValues: Record<string, string>;
	suiteUpdates: Record<string, string>;
	pendingSuiteWrites: TitleBlockSyncPendingWrite[];
	pendingAcadeWrites: TitleBlockSyncPendingWrite[];
	revisionRows: TitleBlockRevisionDisplayRow[];
}

export interface TitleBlockSyncSummary {
	totalFiles: number;
	drawingFiles: number;
	flaggedFiles: number;
	suiteWriteCount: number;
	acadeWriteCount: number;
	wdTbConflictCount: number;
}

export interface TitleBlockSyncArtifacts {
	wdtPath: string;
	wdlPath: string;
	wdpPath?: string;
	wdtText: string;
	wdlText: string;
	wdpText?: string;
	wdpState?: "existing" | "starter";
}

export interface TitleBlockSyncPayload {
	projectId: string;
	projectRootPath: string;
	profile: TitleBlockSyncProfile;
	revisionEntries: DrawingRevisionRegisterRow[];
	rows?: TitleBlockSyncRow[];
	selectedRelativePaths?: string[];
	triggerAcadeUpdate?: boolean;
}

export interface TitleBlockSyncResponse {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: {
		projectRootPath: string;
		profile: TitleBlockSyncProfile;
		drawings: TitleBlockSyncRow[];
		summary: TitleBlockSyncSummary;
		artifacts: TitleBlockSyncArtifacts;
		apply?: Record<string, unknown>;
		selectedRelativePaths?: string[];
	};
	warnings?: string[];
	meta?: Record<string, unknown>;
}

function normalizeTitleBlockWorkflowMessage(message: string) {
	const normalized = String(message || "").trim();
	if (!normalized) {
		return "";
	}

	const lower = normalized.toLowerCase();

	if (
		lower.includes("autocad scan bridge unavailable") ||
		lower.includes("autocad bridge is not configured") ||
		(lower.includes("filename-only fallback") && lower.includes("dwg metadata"))
	) {
		return "Live drawing metadata is not connected right now, so Suite is pairing drawing rows by filename until the DWG bridge is available.";
	}

	if (lower.includes("project_title_block_profiles")) {
		return "";
	}

	if (lower.includes("drawing_revision_register_entries")) {
		return "Hosted revision history is unavailable right now, so Suite is using local revision data where available.";
	}

	return normalized;
}

export function normalizeTitleBlockWorkflowWarnings(warnings: string[]) {
	const uniqueWarnings = new Set<string>();
	for (const warning of warnings) {
		const normalized = normalizeTitleBlockWorkflowMessage(warning);
		if (normalized) {
			uniqueWarnings.add(normalized);
		}
	}
	return Array.from(uniqueWarnings);
}

class TitleBlockSyncService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl =
			(import.meta.env.VITE_COORDINATES_BACKEND_URL || "http://localhost:5000")
				.trim()
				.replace(/\/+$/, "");
		this.apiKey = import.meta.env.VITE_API_KEY ?? "";
	}

	private async getAccessToken(): Promise<string | null> {
		try {
			const {
				data: { session },
				error,
			} = await supabase.auth.getSession();
			if (error) {
				logger.warn(
					"Unable to read Supabase session for title block sync auth",
					"TitleBlockSyncService",
					{ message: error.message || "Unknown auth error" },
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.error(
				"Unexpected error while resolving title block sync auth",
				"TitleBlockSyncService",
				error,
			);
			return null;
		}
	}

	private async buildHeaders(): Promise<Record<string, string>> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": `title-block-${Date.now()}`,
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
		payload: TitleBlockSyncPayload,
	): Promise<TitleBlockSyncResponse> {
		const headers = await this.buildHeaders();
		try {
			const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
				method: "POST",
				headers,
				credentials: "include",
				body: JSON.stringify(payload),
				timeoutMs: 120_000,
				requestName: "Title block sync request",
			});

			const parsed = (await response
				.clone()
				.json()
				.catch(() => null)) as TitleBlockSyncResponse | null;

			if (!response.ok) {
				return {
					success: false,
					code: parsed?.code || "REQUEST_FAILED",
					message: normalizeTitleBlockWorkflowMessage(
						parsed?.message ||
						(await parseResponseErrorMessage(
							response,
							`Title block sync request failed (${response.status})`,
						)),
					),
					requestId: parsed?.requestId,
					warnings: normalizeTitleBlockWorkflowWarnings(parsed?.warnings || []),
					meta: parsed?.meta,
					data: parsed?.data,
				};
			}

			if (parsed && typeof parsed.success === "boolean") {
				return {
					...parsed,
					message: normalizeTitleBlockWorkflowMessage(parsed.message),
					warnings: normalizeTitleBlockWorkflowWarnings(parsed.warnings || []),
				};
			}

			return {
				success: false,
				code: "INVALID_RESPONSE",
				message: "Title block sync returned an unexpected payload.",
			};
		} catch (error) {
			if (error instanceof FetchRequestError) {
				return {
					success: false,
					code: error.kind.toUpperCase(),
					message: mapFetchErrorMessage(error, "Title block sync request failed."),
				};
			}
			return {
				success: false,
				code: "NETWORK_ERROR",
				message: mapFetchErrorMessage(error, "Title block sync request failed."),
			};
		}
	}

	scan(payload: TitleBlockSyncPayload) {
		return this.requestJson("/api/title-block-sync/scan", payload);
	}

	preview(payload: TitleBlockSyncPayload) {
		return this.requestJson("/api/title-block-sync/preview", payload);
	}

	ensureArtifacts(payload: TitleBlockSyncPayload) {
		return this.requestJson("/api/title-block-sync/ensure-artifacts", payload);
	}

	openProject(payload: TitleBlockSyncPayload) {
		return this.requestJson("/api/title-block-sync/open-project", payload);
	}

	apply(payload: TitleBlockSyncPayload) {
		return this.requestJson("/api/title-block-sync/apply", payload);
	}
}

export const titleBlockSyncService = new TitleBlockSyncService();
