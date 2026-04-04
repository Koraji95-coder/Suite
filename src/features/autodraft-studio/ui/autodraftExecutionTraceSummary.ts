import type {
	AutoDraftExecuteMeta,
	AutoDraftExecuteResponse,
	AutoDraftExecuteRevisionContext,
	AutoDraftExecuteWorkflowContext,
} from "./autodraftService";

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as RecordLike)
		: null;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readReceiptList(
	value: unknown,
): ReadonlyArray<Record<string, unknown>> {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(item): item is Record<string, unknown> =>
			Boolean(item) && typeof item === "object" && !Array.isArray(item),
	);
}

export type AutoDraftCommitCounts = {
	createdHandles: number;
	titleBlockUpdates: number;
	textReplacementUpdates: number;
	textDeleteUpdates: number;
	textSwapUpdates: number;
	dimensionTextUpdates: number;
};

export type AutoDraftCadContextSummary = {
	drawingName: string;
	drawingPath: string;
	activeLayer: string;
	activeLayout: string;
	activeSpace: string;
	readOnly: boolean | null;
	commandMask: number | null;
	layoutCount: number | null;
	blockCount: number | null;
	layerCount: number | null;
	modelSpaceCount: number | null;
	paperSpaceCount: number | null;
};

export type AutoDraftExecutionSummary = {
	requestId: string;
	jobId: string;
	providerPath: string;
	dryRun: boolean;
	status: string;
	accepted: number;
	skipped: number;
	message: string;
	counts: AutoDraftCommitCounts;
	cad: AutoDraftCadContextSummary;
	titleBlockUpdates: ReadonlyArray<Record<string, unknown>>;
	textReplacementUpdates: ReadonlyArray<Record<string, unknown>>;
	textDeleteUpdates: ReadonlyArray<Record<string, unknown>>;
	textSwapUpdates: ReadonlyArray<Record<string, unknown>>;
	dimensionTextUpdates: ReadonlyArray<Record<string, unknown>>;
	createdHandles: ReadonlyArray<string>;
};

export function summarizeAutoDraftExecution(
	response: AutoDraftExecuteResponse | null | undefined,
): AutoDraftExecutionSummary | null {
	if (!response) {
		return null;
	}

	const meta = (response.meta ?? {}) as AutoDraftExecuteMeta;
	const receipt = meta.executionReceipt ?? {};
	const cadRecord = asRecord(meta.cad) ?? {};

	const createdHandles = Array.isArray(receipt.createdHandles)
		? receipt.createdHandles
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
	const titleBlockUpdates = readReceiptList(receipt.titleBlockUpdates);
	const textReplacementUpdates = readReceiptList(receipt.textReplacementUpdates);
	const textDeleteUpdates = readReceiptList(receipt.textDeleteUpdates);
	const textSwapUpdates = readReceiptList(receipt.textSwapUpdates);
	const dimensionTextUpdates = readReceiptList(receipt.dimensionTextUpdates);

	return {
		requestId:
			asString(response.requestId) ||
			asString(meta.requestId) ||
			asString(receipt.requestId),
		jobId: asString(response.job_id) || asString(receipt.jobId),
		providerPath: asString(receipt.providerPath) || asString(meta.providerPath),
		dryRun:
			typeof receipt.dryRun === "boolean" ? receipt.dryRun : response.dry_run,
		status: asString(response.status) || asString(receipt.status),
		accepted:
			typeof receipt.accepted === "number"
				? receipt.accepted
				: response.accepted,
		skipped:
			typeof receipt.skipped === "number"
				? receipt.skipped
				: response.skipped,
		message: asString(response.message),
		counts: {
			createdHandles: createdHandles.length,
			titleBlockUpdates: titleBlockUpdates.length,
			textReplacementUpdates: textReplacementUpdates.length,
			textDeleteUpdates: textDeleteUpdates.length,
			textSwapUpdates: textSwapUpdates.length,
			dimensionTextUpdates: dimensionTextUpdates.length,
		},
		cad: {
			drawingName: asString(cadRecord.drawingName),
			drawingPath: asString(cadRecord.drawingPath),
			activeLayer: asString(cadRecord.activeLayer),
			activeLayout: asString(cadRecord.activeLayout),
			activeSpace: asString(cadRecord.activeSpace),
			readOnly:
				typeof cadRecord.readOnly === "boolean" ? cadRecord.readOnly : null,
			commandMask: asNumber(cadRecord.commandMask),
			layoutCount: asNumber(cadRecord.layoutCount),
			blockCount: asNumber(cadRecord.blockCount),
			layerCount: asNumber(cadRecord.layerCount),
			modelSpaceCount: asNumber(cadRecord.modelSpaceCount),
			paperSpaceCount: asNumber(cadRecord.paperSpaceCount),
		},
		titleBlockUpdates,
		textReplacementUpdates,
		textDeleteUpdates,
		textSwapUpdates,
		dimensionTextUpdates,
		createdHandles,
	};
}

function appendLine(target: string[], value: string) {
	const normalized = value.trim();
	if (normalized) {
		target.push(normalized);
	}
}

export function buildAutoDraftRevisionTraceNotes(args: {
	response: AutoDraftExecuteResponse;
	workflowContext?: AutoDraftExecuteWorkflowContext;
	revisionContext?: AutoDraftExecuteRevisionContext;
}): string {
	const { response, workflowContext, revisionContext } = args;
	const summary = summarizeAutoDraftExecution(response);
	const lines: string[] = [];

	appendLine(lines, revisionContext?.notes ?? "");
	appendLine(lines, response.message ?? "");

	if (summary) {
		appendLine(lines, summary.status ? `Status: ${summary.status}` : "");
		appendLine(lines, `Accepted: ${summary.accepted}`);
		appendLine(lines, `Skipped: ${summary.skipped}`);
		appendLine(lines, summary.requestId ? `Request ID: ${summary.requestId}` : "");
		appendLine(lines, summary.jobId ? `Job ID: ${summary.jobId}` : "");
		appendLine(
			lines,
			summary.providerPath ? `Provider: ${summary.providerPath}` : "",
		);
		appendLine(
			lines,
			summary.dryRun ? "Mode: preview" : "Mode: commit",
		);
		appendLine(
			lines,
			summary.cad.drawingName ? `Drawing: ${summary.cad.drawingName}` : "",
		);
		appendLine(
			lines,
			summary.cad.activeLayer ? `Layer: ${summary.cad.activeLayer}` : "",
		);
		appendLine(
			lines,
			summary.cad.activeLayout
				? `Layout: ${summary.cad.activeLayout}`
				: "",
		);
		appendLine(
			lines,
			summary.cad.activeSpace ? `Space: ${summary.cad.activeSpace}` : "",
		);
		appendLine(
			lines,
			summary.counts.createdHandles > 0
				? `Created handles: ${summary.createdHandles.join(", ")}`
				: "",
		);
		appendLine(
			lines,
			summary.counts.titleBlockUpdates > 0
				? `Title block updates: ${summary.counts.titleBlockUpdates}`
				: "",
		);
		appendLine(
			lines,
			summary.counts.textReplacementUpdates > 0
				? `Text replacement updates: ${summary.counts.textReplacementUpdates}`
				: "",
		);
		appendLine(
			lines,
			summary.counts.textDeleteUpdates > 0
				? `Text deletions: ${summary.counts.textDeleteUpdates}`
				: "",
		);
		appendLine(
			lines,
			summary.counts.textSwapUpdates > 0
				? `Text swaps: ${summary.counts.textSwapUpdates}`
				: "",
		);
		appendLine(
			lines,
			summary.counts.dimensionTextUpdates > 0
				? `Dimension text updates: ${summary.counts.dimensionTextUpdates}`
				: "",
		);
	}

	appendLine(
		lines,
		asString(workflowContext?.lane) ? `Workflow lane: ${workflowContext?.lane}` : "",
	);
	appendLine(
		lines,
		asString(workflowContext?.phase)
			? `Workflow phase: ${workflowContext?.phase}`
			: "",
	);

	return lines.join("\n");
}

export function buildAutoDraftExecutionIssueSummary(
	response: AutoDraftExecuteResponse,
): string {
	const summary = summarizeAutoDraftExecution(response);
	if (!summary) {
		return response.message?.trim() || "AutoDraft execution receipt recorded.";
	}

	const detailParts: string[] = [];
	if (summary.counts.titleBlockUpdates > 0) {
		detailParts.push(`${summary.counts.titleBlockUpdates} title block update(s)`);
	}
	if (summary.counts.textReplacementUpdates > 0) {
		detailParts.push(
			`${summary.counts.textReplacementUpdates} text replacement update(s)`,
		);
	}
	if (summary.counts.textDeleteUpdates > 0) {
		detailParts.push(`${summary.counts.textDeleteUpdates} text deletion(s)`);
	}
	if (summary.counts.textSwapUpdates > 0) {
		detailParts.push(`${summary.counts.textSwapUpdates} text swap update(s)`);
	}
	if (summary.counts.dimensionTextUpdates > 0) {
		detailParts.push(`${summary.counts.dimensionTextUpdates} dimension update(s)`);
	}
	if (summary.counts.createdHandles > 0) {
		detailParts.push(`${summary.counts.createdHandles} created handle(s)`);
	}

	const prefix = summary.dryRun ? "AutoDraft preview" : "AutoDraft commit";
	if (detailParts.length > 0) {
		return `${prefix}: ${detailParts.join(", ")}.`;
	}
	return response.message?.trim() || `${prefix} receipt recorded.`;
}
