import { fetchWithTimeout, mapFetchErrorMessage } from "@/lib/fetchWithTimeout";

export interface CadReplaceRule {
	id: string;
	find: string;
	replace: string;
	useRegex: boolean;
	matchCase: boolean;
}

export interface CadPreviewMatch {
	file: string;
	line: number;
	before: string;
	after: string;
	ruleId: string;
	handle?: string;
	entityType?: string;
	layoutName?: string | null;
	blockName?: string | null;
	attributeTag?: string | null;
	currentValue?: string;
	nextValue?: string;
	drawingPath?: string | null;
	drawingName?: string | null;
	relativePath?: string | null;
	groupKey?: string | null;
	matchKey?: string | null;
}

export interface CadPreviewDrawingSummary {
	drawingPath: string;
	drawingName: string;
	relativePath: string | null;
	matchCount: number;
}

export interface CadPreviewResponse {
	requestId: string | null;
	matches: CadPreviewMatch[];
	matchCount: number;
	warnings: string[];
	drawingName: string | null;
	drawings: CadPreviewDrawingSummary[];
	message: string;
}

export interface CadProjectApplyDrawingResult {
	drawingPath: string;
	drawingName: string;
	relativePath: string | null;
	updated: number;
	skipped: number;
	warnings: string[];
}

export interface CadProjectApplyResponse {
	requestId: string | null;
	updated: number;
	changedDrawingCount: number;
	changedItemCount: number;
	warnings: string[];
	reportId: string;
	reportFilename: string;
	downloadUrl: string;
	drawings: CadProjectApplyDrawingResult[];
	message: string;
}

export type DrawingCleanupEntryMode = "current_drawing" | "import_file";

export type DrawingCleanupPreset =
	| "full"
	| "text"
	| "blocks"
	| "layers"
	| "overlap"
	| "import_full";

export interface DrawingCleanupFixItem {
	id: string;
	label: string;
	description: string;
	count: number;
	selected: boolean;
	kind: "deterministic" | "review" | string;
}

export interface DrawingCleanupSummary {
	entryMode: DrawingCleanupEntryMode;
	preset: DrawingCleanupPreset;
	deterministicCandidateCount: number;
	reviewCandidateCount: number;
	layerCandidateCount: number;
	blockCandidateCount: number;
	textCandidateCount: number;
	textLayerReviewCount: number;
	overlapReviewCount: number;
	appliedDeterministicCount: number;
	appliedReviewCount: number;
	saved: boolean;
	appliedLayerChanges: number;
	appliedBlockChanges: number;
	appliedTextChanges: number;
	appliedTextLayerReviewChanges: number;
	appliedOverlapReviewChanges: number;
}

export interface DrawingCleanupDrawing {
	name: string;
	path: string | null;
	outputPath: string | null;
	saveDrawing: boolean;
}

export interface DrawingCleanupResponse {
	success: boolean;
	code: string;
	message: string;
	requestId: string | null;
	warnings: string[];
	meta: Record<string, unknown>;
	summary: DrawingCleanupSummary | null;
	deterministicFixes: DrawingCleanupFixItem[];
	reviewQueue: DrawingCleanupFixItem[];
	drawing: DrawingCleanupDrawing | null;
}

let batchSessionReady = false;

function toNullableText(value: unknown) {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}

function toTextArray(value: unknown) {
	return Array.isArray(value)
		? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
		: [];
}

function toPreviewMatch(value: unknown): CadPreviewMatch | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadPreviewMatch>;
	return {
		file: String(candidate.file ?? "").trim(),
		line: Number(candidate.line ?? 0) || 0,
		before: String(candidate.before ?? ""),
		after: String(candidate.after ?? ""),
		ruleId: String(candidate.ruleId ?? "").trim(),
		handle: toNullableText(candidate.handle) ?? undefined,
		entityType: toNullableText(candidate.entityType) ?? undefined,
		layoutName: toNullableText(candidate.layoutName),
		blockName: toNullableText(candidate.blockName),
		attributeTag: toNullableText(candidate.attributeTag),
		currentValue:
			typeof candidate.currentValue === "string"
				? candidate.currentValue
				: undefined,
		nextValue:
			typeof candidate.nextValue === "string" ? candidate.nextValue : undefined,
		drawingPath: toNullableText(candidate.drawingPath),
		drawingName: toNullableText(candidate.drawingName),
		relativePath: toNullableText(candidate.relativePath),
		groupKey: toNullableText(candidate.groupKey),
		matchKey: toNullableText(candidate.matchKey),
	};
}

function toPreviewDrawingSummary(
	value: unknown,
): CadPreviewDrawingSummary | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadPreviewDrawingSummary>;
	const drawingPath = String(candidate.drawingPath ?? "").trim();
	if (!drawingPath) {
		return null;
	}
	return {
		drawingPath,
		drawingName:
			String(candidate.drawingName ?? "").trim() ||
			drawingPath.split(/[\\/]/).pop() ||
			drawingPath,
		relativePath: toNullableText(candidate.relativePath),
		matchCount: Math.max(0, Number(candidate.matchCount ?? 0) || 0),
	};
}

function toApplyDrawingResult(
	value: unknown,
): CadProjectApplyDrawingResult | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<CadProjectApplyDrawingResult>;
	const drawingPath = String(candidate.drawingPath ?? "").trim();
	if (!drawingPath) {
		return null;
	}
	return {
		drawingPath,
		drawingName:
			String(candidate.drawingName ?? "").trim() ||
			drawingPath.split(/[\\/]/).pop() ||
			drawingPath,
		relativePath: toNullableText(candidate.relativePath),
		updated: Math.max(0, Number(candidate.updated ?? 0) || 0),
		skipped: Math.max(0, Number(candidate.skipped ?? 0) || 0),
		warnings: toTextArray(candidate.warnings),
	};
}

function toCleanupFixItem(value: unknown): DrawingCleanupFixItem | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<DrawingCleanupFixItem>;
	const id = String(candidate.id ?? "").trim();
	if (!id) {
		return null;
	}
	return {
		id,
		label: String(candidate.label ?? "").trim() || id,
		description: String(candidate.description ?? "").trim(),
		count: Math.max(0, Number(candidate.count ?? 0) || 0),
		selected: candidate.selected === true,
		kind: String(candidate.kind ?? "").trim() || "deterministic",
	};
}

function toCleanupDrawing(value: unknown): DrawingCleanupDrawing | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<DrawingCleanupDrawing>;
	const name = String(candidate.name ?? "").trim();
	if (!name) {
		return null;
	}
	return {
		name,
		path: toNullableText(candidate.path),
		outputPath: toNullableText(candidate.outputPath),
		saveDrawing: candidate.saveDrawing === true,
	};
}

function toCleanupSummary(value: unknown): DrawingCleanupSummary | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<DrawingCleanupSummary>;
	const entryMode =
		candidate.entryMode === "import_file" ? "import_file" : "current_drawing";
	const preset = (
		[
			"full",
			"text",
			"blocks",
			"layers",
			"overlap",
			"import_full",
		] as const
	).includes(candidate.preset as DrawingCleanupPreset)
		? (candidate.preset as DrawingCleanupPreset)
		: "full";
	return {
		entryMode,
		preset,
		deterministicCandidateCount: Math.max(
			0,
			Number(candidate.deterministicCandidateCount ?? 0) || 0,
		),
		reviewCandidateCount: Math.max(
			0,
			Number(candidate.reviewCandidateCount ?? 0) || 0,
		),
		layerCandidateCount: Math.max(
			0,
			Number(candidate.layerCandidateCount ?? 0) || 0,
		),
		blockCandidateCount: Math.max(
			0,
			Number(candidate.blockCandidateCount ?? 0) || 0,
		),
		textCandidateCount: Math.max(
			0,
			Number(candidate.textCandidateCount ?? 0) || 0,
		),
		textLayerReviewCount: Math.max(
			0,
			Number(candidate.textLayerReviewCount ?? 0) || 0,
		),
		overlapReviewCount: Math.max(
			0,
			Number(candidate.overlapReviewCount ?? 0) || 0,
		),
		appliedDeterministicCount: Math.max(
			0,
			Number(candidate.appliedDeterministicCount ?? 0) || 0,
		),
		appliedReviewCount: Math.max(
			0,
			Number(candidate.appliedReviewCount ?? 0) || 0,
		),
		saved: candidate.saved === true,
		appliedLayerChanges: Math.max(
			0,
			Number(candidate.appliedLayerChanges ?? 0) || 0,
		),
		appliedBlockChanges: Math.max(
			0,
			Number(candidate.appliedBlockChanges ?? 0) || 0,
		),
		appliedTextChanges: Math.max(
			0,
			Number(candidate.appliedTextChanges ?? 0) || 0,
		),
		appliedTextLayerReviewChanges: Math.max(
			0,
			Number(candidate.appliedTextLayerReviewChanges ?? 0) || 0,
		),
		appliedOverlapReviewChanges: Math.max(
			0,
			Number(candidate.appliedOverlapReviewChanges ?? 0) || 0,
		),
	};
}

function toCleanupResponse(payload: unknown): DrawingCleanupResponse {
	const record =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: {};
	const data =
		record.data && typeof record.data === "object"
			? (record.data as Record<string, unknown>)
			: {};
	const deterministicFixes = Array.isArray(data.deterministicFixes)
		? data.deterministicFixes
				.map((entry) => toCleanupFixItem(entry))
				.filter(
					(entry: DrawingCleanupFixItem | null): entry is DrawingCleanupFixItem =>
						entry !== null,
				)
		: [];
	const reviewQueue = Array.isArray(data.reviewQueue)
		? data.reviewQueue
				.map((entry) => toCleanupFixItem(entry))
				.filter(
					(entry: DrawingCleanupFixItem | null): entry is DrawingCleanupFixItem =>
						entry !== null,
				)
		: [];
	return {
		success: record.success === true,
		code: String(record.code ?? "").trim(),
		message: toNullableText(record.message) || "Drawing cleanup request completed.",
		requestId: toNullableText(record.requestId),
		warnings: toTextArray(record.warnings),
		meta:
			record.meta && typeof record.meta === "object"
				? (record.meta as Record<string, unknown>)
				: {},
		summary: toCleanupSummary(data.summary),
		deterministicFixes,
		reviewQueue,
		drawing: toCleanupDrawing(data.drawing),
	};
}

function buildFilenameFromDisposition(
	contentDisposition: string | null,
	fallbackFilename: string,
) {
	const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
	return match?.[1] || fallbackFilename;
}

async function downloadResponseAsFile(
	response: Response,
	fallbackFilename: string,
) {
	const blob = await response.blob();
	const filename = buildFilenameFromDisposition(
		response.headers.get("content-disposition"),
		fallbackFilename,
	);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

export function buildCadPreviewKey(match: CadPreviewMatch, index: number) {
	return [
		match.drawingPath || match.file,
		match.handle || "",
		match.attributeTag || "",
		match.ruleId,
		match.before,
		index,
	].join("::");
}

export function buildCadUtilityQueueItemId(drawingPath: string) {
	return `cad-utils:${drawingPath.trim().toLowerCase()}`;
}

export function isAbsoluteWindowsPath(path: string) {
	return /^[a-z]:[\\/]/i.test(path.trim()) || /^\\\\/.test(path.trim());
}

export const cadBatchFindReplaceService = {
	async ensureBatchSession() {
		if (batchSessionReady) {
			return;
		}
		await fetchWithTimeout("/api/batch-find-replace/session", {
			method: "POST",
			credentials: "include",
			timeoutMs: 15_000,
			requestName: "Batch session request",
			throwOnHttpError: true,
		});
		batchSessionReady = true;
	},

	async previewActiveDrawing(args: {
		rules: CadReplaceRule[];
		blockNameHint?: string | null;
	}): Promise<CadPreviewResponse> {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/preview",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: args.rules,
						blockNameHint: args.blockNameHint ?? "",
					}),
					timeoutMs: 120_000,
					requestName: "CAD batch preview request",
					throwOnHttpError: true,
				},
			);
			const payload = await response.json();
			if (!payload?.success) {
				throw new Error(
					String(payload?.error || payload?.message || "CAD preview failed."),
				);
			}
			const matches = Array.isArray(payload?.matches)
				? payload.matches
						.map((entry: unknown) => toPreviewMatch(entry))
						.filter(
							(entry: CadPreviewMatch | null): entry is CadPreviewMatch =>
								entry !== null,
						)
				: [];
			const drawings =
				Array.isArray(payload?.drawings) && payload.drawings.length > 0
					? payload.drawings
							.map((entry: unknown) => toPreviewDrawingSummary(entry))
							.filter(
								(
									entry: CadPreviewDrawingSummary | null,
								): entry is CadPreviewDrawingSummary => entry !== null,
							)
					: [];
			return {
				requestId: toNullableText(payload?.requestId),
				matches,
				matchCount: Math.max(
					0,
					Number(payload?.matchCount ?? matches.length) || 0,
				),
				warnings: toTextArray(payload?.warnings),
				drawingName: toNullableText(payload?.drawingName),
				drawings,
				message:
					toNullableText(payload?.message) || "CAD batch preview completed.",
			};
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "CAD preview failed."));
		}
	},

	async applyActiveDrawing(args: {
		matches: CadPreviewMatch[];
		blockNameHint?: string | null;
	}) {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/apply",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						matches: args.matches,
						blockNameHint: args.blockNameHint ?? "",
					}),
					timeoutMs: 120_000,
					requestName: "CAD batch apply request",
					throwOnHttpError: true,
				},
			);
			await downloadResponseAsFile(
				response,
				"cad_batch_find_replace_changes.xlsx",
			);
			return {
				message: "CAD apply completed. Excel change report downloaded.",
			};
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "CAD apply failed."));
		}
	},

	async previewProjectScope(args: {
		rules: CadReplaceRule[];
		selectedDrawingPaths: string[];
		drawingRootPath?: string | null;
		projectRootPath?: string | null;
		blockNameHint?: string | null;
	}): Promise<CadPreviewResponse> {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/project-preview",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules: args.rules,
						selectedDrawingPaths: args.selectedDrawingPaths,
						drawingRootPath: args.drawingRootPath ?? null,
						projectRootPath: args.projectRootPath ?? null,
						blockNameHint: args.blockNameHint ?? "",
					}),
					timeoutMs: 180_000,
					requestName: "Project CAD preview request",
					throwOnHttpError: true,
				},
			);
			const payload = await response.json();
			if (!payload?.success) {
				throw new Error(
					String(
						payload?.error || payload?.message || "Project CAD preview failed.",
					),
				);
			}
			const matches = Array.isArray(payload?.matches)
				? payload.matches
						.map((entry: unknown) => toPreviewMatch(entry))
						.filter(
							(entry: CadPreviewMatch | null): entry is CadPreviewMatch =>
								entry !== null,
						)
				: [];
			const drawings = Array.isArray(payload?.drawings)
				? payload.drawings
						.map((entry: unknown) => toPreviewDrawingSummary(entry))
						.filter(
							(
								entry: CadPreviewDrawingSummary | null,
							): entry is CadPreviewDrawingSummary => entry !== null,
						)
				: [];
			return {
				requestId: toNullableText(payload?.requestId),
				matches,
				matchCount: Math.max(
					0,
					Number(payload?.matchCount ?? matches.length) || 0,
				),
				warnings: toTextArray(payload?.warnings),
				drawingName: null,
				drawings,
				message:
					toNullableText(payload?.message) || "Project CAD preview completed.",
			};
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Project CAD preview failed."),
			);
		}
	},

	async applyProjectScope(args: {
		matches: CadPreviewMatch[];
		blockNameHint?: string | null;
	}): Promise<CadProjectApplyResponse> {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/project-apply",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						matches: args.matches,
						blockNameHint: args.blockNameHint ?? "",
					}),
					timeoutMs: 180_000,
					requestName: "Project CAD apply request",
					throwOnHttpError: true,
				},
			);
			const payload = await response.json();
			if (!payload?.success) {
				throw new Error(
					String(
						payload?.error || payload?.message || "Project CAD apply failed.",
					),
				);
			}
			const reportId = String(payload?.reportId ?? "").trim();
			if (!reportId) {
				throw new Error("Project CAD apply did not return a report id.");
			}
			const reportFilename =
				String(payload?.reportFilename ?? "").trim() ||
				"cad_project_batch_find_replace_changes.xlsx";
			const downloadUrl =
				String(payload?.downloadUrl ?? "").trim() ||
				`/api/batch-find-replace/reports/${encodeURIComponent(reportId)}`;
			return {
				requestId: toNullableText(payload?.requestId),
				updated: Math.max(0, Number(payload?.updated ?? 0) || 0),
				changedDrawingCount: Math.max(
					0,
					Number(payload?.changedDrawingCount ?? 0) || 0,
				),
				changedItemCount: Math.max(
					0,
					Number(payload?.changedItemCount ?? payload?.updated ?? 0) || 0,
				),
				warnings: toTextArray(payload?.warnings),
				reportId,
				reportFilename,
				downloadUrl,
				drawings: Array.isArray(payload?.drawings)
					? payload.drawings
							.map((entry: unknown) => toApplyDrawingResult(entry))
							.filter(
								(
									entry: CadProjectApplyDrawingResult | null,
								): entry is CadProjectApplyDrawingResult => entry !== null,
							)
					: [],
				message:
					toNullableText(payload?.message) || "Project CAD apply completed.",
			};
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "Project CAD apply failed."));
		}
	},

	async previewDrawingCleanup(args: {
		entryMode: DrawingCleanupEntryMode;
		preset: DrawingCleanupPreset;
		sourcePath?: string | null;
		saveDrawing?: boolean;
		timeoutMs?: number;
	}): Promise<DrawingCleanupResponse> {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/cleanup-preview",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entryMode: args.entryMode,
						preset: args.preset,
						sourcePath: args.sourcePath ?? "",
						saveDrawing: args.saveDrawing === true,
						timeoutMs: args.timeoutMs ?? 90_000,
					}),
					timeoutMs: Math.max(30_000, args.timeoutMs ?? 90_000),
					requestName: "Drawing cleanup preview request",
					throwOnHttpError: false,
				},
			);
			const payload = await response.json().catch(() => ({}));
			const parsed = toCleanupResponse(payload);
			if (!response.ok || !parsed.success) {
				throw new Error(parsed.message || "Drawing cleanup preview failed.");
			}
			return parsed;
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Drawing cleanup preview failed."),
			);
		}
	},

	async applyDrawingCleanup(args: {
		entryMode: DrawingCleanupEntryMode;
		preset: DrawingCleanupPreset;
		sourcePath?: string | null;
		saveDrawing?: boolean;
		timeoutMs?: number;
		selectedFixIds: string[];
		approvedReviewIds: string[];
	}): Promise<DrawingCleanupResponse> {
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				"/api/batch-find-replace/cad/cleanup-apply",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entryMode: args.entryMode,
						preset: args.preset,
						sourcePath: args.sourcePath ?? "",
						saveDrawing: args.saveDrawing === true,
						timeoutMs: args.timeoutMs ?? 90_000,
						selectedFixIds: args.selectedFixIds,
						approvedReviewIds: args.approvedReviewIds,
					}),
					timeoutMs: Math.max(30_000, args.timeoutMs ?? 90_000),
					requestName: "Drawing cleanup apply request",
					throwOnHttpError: false,
				},
			);
			const payload = await response.json().catch(() => ({}));
			const parsed = toCleanupResponse(payload);
			if (!response.ok || !parsed.success) {
				throw new Error(parsed.message || "Drawing cleanup apply failed.");
			}
			return parsed;
		} catch (error) {
			throw new Error(mapFetchErrorMessage(error, "Drawing cleanup apply failed."));
		}
	},

	async downloadReport(reportId: string, fallbackFilename?: string) {
		const normalizedReportId = String(reportId).trim();
		if (!normalizedReportId) {
			throw new Error("Report id is required.");
		}
		try {
			await this.ensureBatchSession();
			const response = await fetchWithTimeout(
				`/api/batch-find-replace/reports/${encodeURIComponent(normalizedReportId)}`,
				{
					method: "GET",
					credentials: "include",
					timeoutMs: 120_000,
					requestName: "CAD report download",
					throwOnHttpError: true,
				},
			);
			await downloadResponseAsFile(
				response,
				fallbackFilename || "cad_batch_find_replace_changes.xlsx",
			);
		} catch (error) {
			throw new Error(
				mapFetchErrorMessage(error, "Unable to download CAD report."),
			);
		}
	},
};
