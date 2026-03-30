import {
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";

export interface TerminalAuthoringPathPoint {
	x: number;
	y: number;
}

export type TerminalAuthoringOperationType =
	| "label-upsert"
	| "route-insert"
	| "route-update"
	| "unresolved";

export interface TerminalAuthoringPreviewOperation {
	operationId: string;
	rowId: string;
	source: "strip" | "connection";
	operationType: TerminalAuthoringOperationType;
	drawingPath: string | null;
	drawingName: string | null;
	relativePath: string | null;
	panelId: string | null;
	side: string | null;
	stripId: string | null;
	terminalCount: number | null;
	labels: string[] | null;
	routeRef: string | null;
	routeType: "conductor" | "jumper" | null;
	cableType: string | null;
	wireFunction: string | null;
	annotateRef: boolean | null;
	fromStripId: string | null;
	fromTerminal: number | null;
	toStripId: string | null;
	toTerminal: number | null;
	stripKey: string | null;
	routeKey: string | null;
	before: string | null;
	after: string | null;
	detail: string;
	warning: string | null;
	path: TerminalAuthoringPathPoint[];
}

export interface TerminalAuthoringPreviewDrawingSummary {
	drawingPath: string;
	drawingName: string;
	relativePath: string | null;
	operationCount: number;
	stripUpdateCount: number;
	routeUpsertCount: number;
	unresolvedCount: number;
	warnings: string[];
}

export interface TerminalAuthoringPreviewResponse {
	requestId: string | null;
	scheduleSnapshotId: string | null;
	operationCount: number;
	stripUpdateCount: number;
	routeUpsertCount: number;
	unresolvedCount: number;
	warnings: string[];
	drawings: TerminalAuthoringPreviewDrawingSummary[];
	operations: TerminalAuthoringPreviewOperation[];
	message: string;
}

export interface TerminalAuthoringApplyDrawingResult {
	drawingPath: string;
	drawingName: string;
	relativePath: string | null;
	stripUpdates: number;
	routeUpserts: number;
	updated: number;
	warnings: string[];
}

export interface TerminalAuthoringApplyResponse {
	requestId: string | null;
	changedDrawingCount: number;
	terminalStripUpdateCount: number;
	managedRouteUpsertCount: number;
	reportId: string;
	reportFilename: string;
	downloadUrl: string;
	warnings: string[];
	drawings: TerminalAuthoringApplyDrawingResult[];
	message: string;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

function toTextArray(value: unknown) {
	return Array.isArray(value)
		? value.map((entry) => normalizeText(entry)).filter(Boolean)
		: [];
}

function toPathPoints(value: unknown): TerminalAuthoringPathPoint[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => {
			if (!entry || typeof entry !== "object") {
				return null;
			}
			const candidate = entry as Partial<TerminalAuthoringPathPoint>;
			const x = Number(candidate.x);
			const y = Number(candidate.y);
			return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
		})
		.filter((entry): entry is TerminalAuthoringPathPoint => entry !== null);
}

function toPreviewOperation(value: unknown): TerminalAuthoringPreviewOperation | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<TerminalAuthoringPreviewOperation>;
	const operationId = normalizeText(candidate.operationId);
	if (!operationId) {
		return null;
	}
	const source =
		normalizeText(candidate.source).toLowerCase() === "connection"
			? "connection"
			: "strip";
	const operationTypeRaw = normalizeText(candidate.operationType).toLowerCase();
	const operationType: TerminalAuthoringOperationType =
		operationTypeRaw === "route-insert" ||
		operationTypeRaw === "route-update" ||
		operationTypeRaw === "unresolved"
			? operationTypeRaw
			: "label-upsert";
	const routeType =
		normalizeText(candidate.routeType).toLowerCase() === "jumper"
			? "jumper"
			: normalizeText(candidate.routeType)
				? "conductor"
				: null;
	return {
		operationId,
		rowId: normalizeText(candidate.rowId),
		source,
		operationType,
		drawingPath: normalizeNullableText(candidate.drawingPath),
		drawingName: normalizeNullableText(candidate.drawingName),
		relativePath: normalizeNullableText(candidate.relativePath),
		panelId: normalizeNullableText(candidate.panelId),
		side: normalizeNullableText(candidate.side),
		stripId: normalizeNullableText(candidate.stripId),
		terminalCount: Number.isFinite(Number(candidate.terminalCount))
			? Number(candidate.terminalCount)
			: null,
		labels: Array.isArray(candidate.labels)
			? candidate.labels.map((entry) => String(entry ?? ""))
			: null,
		routeRef: normalizeNullableText(candidate.routeRef),
		routeType,
		cableType: normalizeNullableText(candidate.cableType),
		wireFunction: normalizeNullableText(candidate.wireFunction),
		annotateRef:
			typeof candidate.annotateRef === "boolean" ? candidate.annotateRef : null,
		fromStripId: normalizeNullableText(candidate.fromStripId),
		fromTerminal: Number.isFinite(Number(candidate.fromTerminal))
			? Number(candidate.fromTerminal)
			: null,
		toStripId: normalizeNullableText(candidate.toStripId),
		toTerminal: Number.isFinite(Number(candidate.toTerminal))
			? Number(candidate.toTerminal)
			: null,
		stripKey: normalizeNullableText(candidate.stripKey),
		routeKey: normalizeNullableText(candidate.routeKey),
		before: normalizeNullableText(candidate.before),
		after: normalizeNullableText(candidate.after),
		detail: normalizeText(candidate.detail),
		warning: normalizeNullableText(candidate.warning),
		path: toPathPoints(candidate.path),
	};
}

function toPreviewDrawingSummary(
	value: unknown,
): TerminalAuthoringPreviewDrawingSummary | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<TerminalAuthoringPreviewDrawingSummary>;
	const drawingPath = normalizeText(candidate.drawingPath);
	if (!drawingPath) {
		return null;
	}
	return {
		drawingPath,
		drawingName:
			normalizeText(candidate.drawingName) ||
			drawingPath.split(/[\\/]/).pop() ||
			drawingPath,
		relativePath: normalizeNullableText(candidate.relativePath),
		operationCount: Math.max(0, Number(candidate.operationCount || 0)),
		stripUpdateCount: Math.max(0, Number(candidate.stripUpdateCount || 0)),
		routeUpsertCount: Math.max(0, Number(candidate.routeUpsertCount || 0)),
		unresolvedCount: Math.max(0, Number(candidate.unresolvedCount || 0)),
		warnings: toTextArray(candidate.warnings),
	};
}

function toApplyDrawingResult(
	value: unknown,
): TerminalAuthoringApplyDrawingResult | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<TerminalAuthoringApplyDrawingResult>;
	const drawingPath = normalizeText(candidate.drawingPath);
	if (!drawingPath) {
		return null;
	}
	return {
		drawingPath,
		drawingName:
			normalizeText(candidate.drawingName) ||
			drawingPath.split(/[\\/]/).pop() ||
			drawingPath,
		relativePath: normalizeNullableText(candidate.relativePath),
		stripUpdates: Math.max(0, Number(candidate.stripUpdates || 0)),
		routeUpserts: Math.max(0, Number(candidate.routeUpserts || 0)),
		updated: Math.max(0, Number(candidate.updated || 0)),
		warnings: toTextArray(candidate.warnings),
	};
}

function buildFilenameFromDisposition(
	contentDisposition: string | null,
	fallbackFilename: string,
) {
	const match = contentDisposition?.match(/filename=\"?([^\";]+)\"?/i);
	return match?.[1] || fallbackFilename;
}

async function downloadResponseAsFile(
	response: Response,
	fallbackFilename: string,
) {
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = buildFilenameFromDisposition(
		response.headers.get("content-disposition"),
		fallbackFilename,
	);
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

class ProjectTerminalAuthoringService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl =
			(import.meta.env.VITE_COORDINATES_BACKEND_URL ||
				import.meta.env.VITE_BACKEND_URL ||
				"http://localhost:5000")
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
					"Unable to read Supabase session for terminal authoring auth.",
					"ProjectTerminalAuthoringService",
					error,
				);
				return null;
			}
			return session?.access_token || null;
		} catch (error) {
			logger.warn(
				"Unexpected error while resolving terminal authoring auth.",
				"ProjectTerminalAuthoringService",
				error,
			);
			return null;
		}
	}

	private async buildHeaders() {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": `terminal-authoring-${Date.now()}`,
		};
		const accessToken = await this.getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		} else if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}
		return headers;
	}

	async previewProjectScope(
		payload: Record<string, unknown>,
	): Promise<TerminalAuthoringPreviewResponse> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/conduit-route/terminal-authoring/project-preview`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 240_000,
					requestName: "Project terminal authoring preview",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(
						body?.error || body?.message || "Project terminal preview failed.",
					),
				);
			}
			const operations = Array.isArray(body?.operations)
				? body.operations
						.map((entry: unknown) => toPreviewOperation(entry))
						.filter(
							(
								entry: TerminalAuthoringPreviewOperation | null,
							): entry is TerminalAuthoringPreviewOperation => entry !== null,
						)
				: [];
			return {
				requestId: normalizeNullableText(body?.requestId),
				scheduleSnapshotId: normalizeNullableText(body?.scheduleSnapshotId),
				operationCount: Math.max(
					0,
					Number(body?.operationCount ?? operations.length),
				),
				stripUpdateCount: Math.max(0, Number(body?.stripUpdateCount ?? 0)),
				routeUpsertCount: Math.max(0, Number(body?.routeUpsertCount ?? 0)),
				unresolvedCount: Math.max(0, Number(body?.unresolvedCount ?? 0)),
				warnings: toTextArray(body?.warnings),
				drawings: Array.isArray(body?.drawings)
					? body.drawings
							.map((entry: unknown) => toPreviewDrawingSummary(entry))
							.filter(
								(
									entry: TerminalAuthoringPreviewDrawingSummary | null,
								): entry is TerminalAuthoringPreviewDrawingSummary =>
									entry !== null,
							)
					: [],
				operations,
				message:
					normalizeNullableText(body?.message) ||
					"Project terminal authoring preview completed.",
			} satisfies TerminalAuthoringPreviewResponse;
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Project terminal authoring preview failed."),
			);
		}
	}

	async applyProjectScope(
		payload: Record<string, unknown>,
	): Promise<TerminalAuthoringApplyResponse> {
		try {
			const headers = await this.buildHeaders();
			const response = await fetchWithTimeout(
				`${this.baseUrl}/api/conduit-route/terminal-authoring/project-apply`,
				{
					method: "POST",
					credentials: "include",
					headers,
					body: JSON.stringify(payload),
					timeoutMs: 240_000,
					requestName: "Project terminal authoring apply",
					throwOnHttpError: true,
				},
			);
			const body = await response.json();
			if (!body?.success) {
				throw new Error(
					String(body?.error || body?.message || "Project terminal apply failed."),
				);
			}
			const reportId = normalizeText(body?.reportId);
			if (!reportId) {
				throw new Error(
					"Project terminal authoring apply did not return a report id.",
				);
			}
			const reportFilename =
				normalizeText(body?.reportFilename) ||
				"terminal_authoring_audit_report.xlsx";
			return {
				requestId: normalizeNullableText(body?.requestId),
				changedDrawingCount: Math.max(
					0,
					Number(body?.changedDrawingCount ?? 0),
				),
				terminalStripUpdateCount: Math.max(
					0,
					Number(body?.terminalStripUpdateCount ?? 0),
				),
				managedRouteUpsertCount: Math.max(
					0,
					Number(body?.managedRouteUpsertCount ?? 0),
				),
				reportId,
				reportFilename,
				downloadUrl:
					normalizeText(body?.downloadUrl) ||
					`/api/conduit-route/reports/${encodeURIComponent(reportId)}`,
				warnings: toTextArray(body?.warnings),
				drawings: Array.isArray(body?.drawings)
					? body.drawings
							.map((entry: unknown) => toApplyDrawingResult(entry))
							.filter(
								(
									entry: TerminalAuthoringApplyDrawingResult | null,
								): entry is TerminalAuthoringApplyDrawingResult =>
									entry !== null,
							)
					: [],
				message:
					normalizeNullableText(body?.message) ||
					"Project terminal authoring apply completed.",
			} satisfies TerminalAuthoringApplyResponse;
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Project terminal authoring apply failed."),
			);
		}
	}

	async downloadReport(reportId: string, fallbackFilename?: string) {
		const normalizedReportId = normalizeText(reportId);
		if (!normalizedReportId) {
			throw new Error("Report id is required.");
		}
		const headers = await this.buildHeaders();
		const response = await fetchWithTimeout(
			`${this.baseUrl}/api/conduit-route/reports/${encodeURIComponent(normalizedReportId)}`,
			{
				method: "GET",
				credentials: "include",
				headers,
				timeoutMs: 120_000,
				requestName: "Terminal authoring report download",
			},
		);
		if (!response.ok) {
			throw new Error(
				await parseResponseErrorMessage(
					response,
					"Unable to download terminal authoring report.",
				),
			);
		}
		await downloadResponseAsFile(
			response,
			fallbackFilename || "terminal_authoring_audit_report.xlsx",
		);
	}
}

export const projectTerminalAuthoringService =
	new ProjectTerminalAuthoringService();
