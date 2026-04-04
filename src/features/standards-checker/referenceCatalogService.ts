import {
	FetchRequestError,
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";

export interface AutodeskReferenceStandardFamily {
	id: string;
	label: string;
	kind: string;
	menuCount: number;
	totalEntryCount: number;
	topCategories: string[];
	fileNames: string[];
	includesLegacy: boolean;
}

interface AutodeskReferenceStandardsResponse {
	success?: boolean;
	requestId?: string;
	recommendedDefaults?: unknown;
	count?: unknown;
	standards?: unknown;
}

export interface AutodeskStandardsReferenceSummary {
	requestId: string | null;
	recommendedDefaults: string[];
	count: number;
	standards: AutodeskReferenceStandardFamily[];
}

function normalizeText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.map((entry) => normalizeText(entry))
				.filter((entry) => entry.length > 0)
		: [];
}

function normalizeFamily(
	value: unknown,
): AutodeskReferenceStandardFamily | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Record<string, unknown>;
	const id = normalizeText(candidate.id);
	const label = normalizeText(candidate.label);
	if (!id || !label) {
		return null;
	}

	return {
		id,
		label,
		kind: normalizeText(candidate.kind),
		menuCount:
			typeof candidate.menuCount === "number" ? candidate.menuCount : 0,
		totalEntryCount:
			typeof candidate.totalEntryCount === "number"
				? candidate.totalEntryCount
				: 0,
		topCategories: normalizeStringArray(candidate.topCategories),
		fileNames: normalizeStringArray(candidate.fileNames),
		includesLegacy: Boolean(candidate.includesLegacy),
	};
}

async function buildHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		Accept: "application/json",
	};

	try {
		const {
			data: { session },
			error,
		} = await supabase.auth.getSession();
		if (error) {
			logger.warn(
				"AutodeskReferenceCatalog",
				"Unable to resolve Supabase session for standards reference request",
				{ error: error.message || "Unknown auth error" },
			);
		} else if (session?.access_token) {
			headers.Authorization = `Bearer ${session.access_token}`;
			return headers;
		}
	} catch (error) {
		logger.warn(
			"AutodeskReferenceCatalog",
			"Unexpected auth lookup failure for standards reference request",
			{ error: error instanceof Error ? error.message : String(error) },
		);
	}

	const apiKey = String(import.meta.env.VITE_API_KEY || "").trim();
	if (apiKey) {
		headers["X-API-Key"] = apiKey;
	}

	return headers;
}

export async function fetchAutodeskStandardsReferenceSummary(): Promise<AutodeskStandardsReferenceSummary> {
	const response = await fetchWithTimeout("/api/autocad/reference/standards", {
		method: "GET",
		credentials: "include",
		headers: await buildHeaders(),
		requestName: "Autodesk standards reference request",
	});

	if (!response.ok) {
		try {
			throw new Error(
				await parseResponseErrorMessage(
					response,
					`Autodesk standards reference request failed with ${response.status}.`,
				),
			);
		} catch (error) {
			if (error instanceof FetchRequestError) {
				throw new Error(error.message);
			}
			throw error;
		}
	}

	const payload =
		(await response.json()) as AutodeskReferenceStandardsResponse | null;
	const standards = Array.isArray(payload?.standards)
		? payload.standards
				.map((entry) => normalizeFamily(entry))
				.filter(
					(entry): entry is AutodeskReferenceStandardFamily => entry !== null,
				)
		: [];

	return {
		requestId: normalizeText(payload?.requestId) || null,
		recommendedDefaults: normalizeStringArray(payload?.recommendedDefaults),
		count:
			typeof payload?.count === "number" ? payload.count : standards.length,
		standards,
	};
}
