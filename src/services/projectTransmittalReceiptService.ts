import type {
	OutputFormat,
	StandardDocumentSourceMode,
	TransmittalType,
} from "@/components/apps/transmittal-builder/transmittalBuilderModels";
import { logger } from "@/lib/logger";
import { loadSetting, saveSetting } from "@/settings/userSettings";

export interface ProjectTransmittalReceiptOutput {
	label: string;
	filename: string;
	size: number;
	createdAt: string;
}

export interface ProjectTransmittalReceiptRecord {
	id: string;
	projectId: string;
	projectName: string;
	projectNumber: string;
	transmittalType: TransmittalType;
	transmittalNumber: string;
	description: string;
	date: string;
	outputFormat: OutputFormat;
	standardDocumentSource: StandardDocumentSourceMode | null;
	projectMetadataLoadedAt: string | null;
	outputs: ProjectTransmittalReceiptOutput[];
	documentCount: number;
	reviewedDocumentCount: number;
	pendingReviewCount: number;
	cidDocumentCount: number;
	contactCount: number;
	fileSummary: {
		template: string;
		index: string;
		documents: string;
		report: string;
	};
	optionSummary: Array<{
		label: string;
		value: string;
	}>;
	generatedMessage: string;
	generatedAt: string;
}

export interface ProjectTransmittalReceiptInput {
	projectId: string;
	projectName: string;
	projectNumber: string;
	transmittalType: TransmittalType;
	transmittalNumber: string;
	description?: string;
	date: string;
	outputFormat: OutputFormat;
	standardDocumentSource?: StandardDocumentSourceMode | null;
	projectMetadataLoadedAt?: string | null;
	outputs: ProjectTransmittalReceiptOutput[];
	documentCount: number;
	reviewedDocumentCount: number;
	pendingReviewCount: number;
	cidDocumentCount: number;
	contactCount: number;
	fileSummary: {
		template: string;
		index: string;
		documents: string;
		report: string;
	};
	optionSummary: Array<{
		label: string;
		value: string;
	}>;
	generatedMessage: string;
}

const RECEIPT_SETTING_KEY = "project_transmittal_receipts_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-transmittal-receipts";

function createId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `transmittal-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeOutputFormat(value: unknown): OutputFormat {
	switch (normalizeText(value).toLowerCase()) {
		case "docx":
			return "docx";
		case "pdf":
			return "pdf";
		default:
			return "both";
	}
}

function normalizeTransmittalType(value: unknown): TransmittalType {
	return normalizeText(value).toLowerCase() === "cid" ? "cid" : "standard";
}

function normalizeSourceMode(
	value: unknown,
): StandardDocumentSourceMode | null {
	const normalized = normalizeText(value).toLowerCase();
	if (normalized === "project_metadata") {
		return "project_metadata";
	}
	if (normalized === "pdf_analysis") {
		return "pdf_analysis";
	}
	return null;
}

function normalizeDate(value: unknown) {
	const normalized = normalizeText(value);
	return normalized || null;
}

function normalizeOutput(
	value: unknown,
): ProjectTransmittalReceiptOutput | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectTransmittalReceiptOutput>;
	const filename = normalizeText(candidate.filename);
	if (!filename) {
		return null;
	}
	return {
		label: normalizeText(candidate.label) || "Output",
		filename,
		size: Math.max(0, Number(candidate.size || 0)),
		createdAt: normalizeDate(candidate.createdAt) || new Date().toISOString(),
	};
}

function normalizeOptionSummary(
	value: unknown,
): Array<{ label: string; value: string }> {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => {
			if (!entry || typeof entry !== "object") {
				return null;
			}
			const candidate = entry as { label?: unknown; value?: unknown };
			const label = normalizeText(candidate.label);
			if (!label) {
				return null;
			}
			return {
				label,
				value: normalizeText(candidate.value) || "None",
			};
		})
		.filter(
			(entry): entry is { label: string; value: string } => entry !== null,
		);
}

function normalizeRecord(
	value: unknown,
): ProjectTransmittalReceiptRecord | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<ProjectTransmittalReceiptRecord>;
	const projectId = normalizeText(candidate.projectId);
	if (!projectId) {
		return null;
	}
	const generatedAt =
		normalizeDate(candidate.generatedAt) || new Date().toISOString();
	return {
		id: normalizeText(candidate.id) || createId(),
		projectId,
		projectName: normalizeText(candidate.projectName),
		projectNumber: normalizeText(candidate.projectNumber),
		transmittalType: normalizeTransmittalType(candidate.transmittalType),
		transmittalNumber: normalizeText(candidate.transmittalNumber),
		description: normalizeText(candidate.description),
		date: normalizeText(candidate.date),
		outputFormat: normalizeOutputFormat(candidate.outputFormat),
		standardDocumentSource: normalizeSourceMode(
			candidate.standardDocumentSource,
		),
		projectMetadataLoadedAt: normalizeDate(candidate.projectMetadataLoadedAt),
		outputs: Array.isArray(candidate.outputs)
			? candidate.outputs
					.map((entry) => normalizeOutput(entry))
					.filter(
						(entry): entry is ProjectTransmittalReceiptOutput => entry !== null,
					)
			: [],
		documentCount: Math.max(0, Number(candidate.documentCount || 0)),
		reviewedDocumentCount: Math.max(
			0,
			Number(candidate.reviewedDocumentCount || 0),
		),
		pendingReviewCount: Math.max(0, Number(candidate.pendingReviewCount || 0)),
		cidDocumentCount: Math.max(0, Number(candidate.cidDocumentCount || 0)),
		contactCount: Math.max(0, Number(candidate.contactCount || 0)),
		fileSummary: {
			template: normalizeText(candidate.fileSummary?.template),
			index: normalizeText(candidate.fileSummary?.index),
			documents: normalizeText(candidate.fileSummary?.documents),
			report: normalizeText(candidate.fileSummary?.report),
		},
		optionSummary: normalizeOptionSummary(candidate.optionSummary),
		generatedMessage: normalizeText(candidate.generatedMessage),
		generatedAt,
	};
}

function sortReceipts(entries: ProjectTransmittalReceiptRecord[]) {
	return [...entries].sort((left, right) =>
		right.generatedAt.localeCompare(left.generatedAt),
	);
}

function buildLocalStorageKey(projectId: string) {
	return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function readLocalReceipts(
	projectId: string,
): ProjectTransmittalReceiptRecord[] {
	if (typeof localStorage === "undefined") {
		return [];
	}
	try {
		const raw = localStorage.getItem(buildLocalStorageKey(projectId));
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		return sortReceipts(
			parsed
				.map((entry) => normalizeRecord(entry))
				.filter(
					(entry): entry is ProjectTransmittalReceiptRecord => entry !== null,
				),
		);
	} catch (error) {
		logger.warn(
			"Unable to read local transmittal receipt cache.",
			"ProjectTransmittalReceiptService",
			error,
		);
		return [];
	}
}

function writeLocalReceipts(
	projectId: string,
	entries: ProjectTransmittalReceiptRecord[],
) {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(
			buildLocalStorageKey(projectId),
			JSON.stringify(sortReceipts(entries)),
		);
	} catch (error) {
		logger.warn(
			"Unable to persist local transmittal receipt cache.",
			"ProjectTransmittalReceiptService",
			error,
		);
	}
}

async function persistReceipts(
	projectId: string,
	entries: ProjectTransmittalReceiptRecord[],
): Promise<Error | null> {
	const sorted = sortReceipts(entries);
	const result = await saveSetting(RECEIPT_SETTING_KEY, sorted, projectId);
	writeLocalReceipts(projectId, sorted);
	if (!result.success) {
		return new Error(
			result.error ||
				"Unable to persist transmittal receipts to project settings.",
		);
	}
	return null;
}

export const projectTransmittalReceiptService = {
	async fetchReceipts(projectId: string): Promise<{
		data: ProjectTransmittalReceiptRecord[];
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(projectId);
		if (!normalizedProjectId) {
			return {
				data: [],
				error: new Error("Project id is required."),
			};
		}

		const localFallback = readLocalReceipts(normalizedProjectId);
		try {
			const stored = await loadSetting<unknown>(
				RECEIPT_SETTING_KEY,
				normalizedProjectId,
				null,
			);
			if (stored === null) {
				return { data: localFallback, error: null };
			}
			if (!Array.isArray(stored)) {
				return {
					data: localFallback,
					error: new Error("Stored transmittal receipt data is invalid."),
				};
			}
			const normalized = sortReceipts(
				stored
					.map((entry) => normalizeRecord(entry))
					.filter(
						(entry): entry is ProjectTransmittalReceiptRecord => entry !== null,
					),
			);
			writeLocalReceipts(normalizedProjectId, normalized);
			return {
				data: normalized,
				error: null,
			};
		} catch (error) {
			return {
				data: localFallback,
				error:
					error instanceof Error
						? error
						: new Error("Unable to load transmittal receipts."),
			};
		}
	},

	async saveReceipt(input: ProjectTransmittalReceiptInput): Promise<{
		data: ProjectTransmittalReceiptRecord | null;
		error: Error | null;
	}> {
		const normalizedProjectId = normalizeText(input.projectId);
		if (!normalizedProjectId) {
			return {
				data: null,
				error: new Error("Project id is required."),
			};
		}

		const generatedAt = new Date().toISOString();
		const receipt: ProjectTransmittalReceiptRecord = {
			id: createId(),
			projectId: normalizedProjectId,
			projectName: normalizeText(input.projectName),
			projectNumber: normalizeText(input.projectNumber),
			transmittalType: normalizeTransmittalType(input.transmittalType),
			transmittalNumber: normalizeText(input.transmittalNumber),
			description: normalizeText(input.description),
			date: normalizeText(input.date),
			outputFormat: normalizeOutputFormat(input.outputFormat),
			standardDocumentSource: normalizeSourceMode(input.standardDocumentSource),
			projectMetadataLoadedAt: normalizeDate(input.projectMetadataLoadedAt),
			outputs: input.outputs
				.map((entry) => normalizeOutput(entry))
				.filter(
					(entry): entry is ProjectTransmittalReceiptOutput => entry !== null,
				),
			documentCount: Math.max(0, Number(input.documentCount || 0)),
			reviewedDocumentCount: Math.max(
				0,
				Number(input.reviewedDocumentCount || 0),
			),
			pendingReviewCount: Math.max(0, Number(input.pendingReviewCount || 0)),
			cidDocumentCount: Math.max(0, Number(input.cidDocumentCount || 0)),
			contactCount: Math.max(0, Number(input.contactCount || 0)),
			fileSummary: {
				template: normalizeText(input.fileSummary.template),
				index: normalizeText(input.fileSummary.index),
				documents: normalizeText(input.fileSummary.documents),
				report: normalizeText(input.fileSummary.report),
			},
			optionSummary: normalizeOptionSummary(input.optionSummary),
			generatedMessage: normalizeText(input.generatedMessage),
			generatedAt,
		};

		const current = await this.fetchReceipts(normalizedProjectId);
		const nextEntries = sortReceipts([receipt, ...current.data]).slice(0, 50);
		const persistError = await persistReceipts(
			normalizedProjectId,
			nextEntries,
		);
		return {
			data: receipt,
			error: persistError,
		};
	},
};
