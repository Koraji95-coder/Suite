import { FileArchive, FileText } from "lucide-react";
import type { ProjectDeliverableRegisterRow } from "@/features/project-delivery";
import { localId } from "@/lib/localId";
import {
	buildProjectMetadataRowsForFiles,
	type ProjectDocumentMetadataRow,
} from "@/features/project-documents";
import { getLocalStorageApi } from "@/lib/browserStorage";
import {
	DEFAULT_FIRM,
	DEFAULT_PE,
	FIRM_NUMBERS,
	PE_PROFILES,
	type PeProfile,
} from "./config";

export const AUTOSAVE_KEY = "transmittal-builder-draft-v1";
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const REVISION_OPTIONS = [
	"-",
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"A",
	"B",
	"C",
	"D",
	"E",
	"IFA",
	"IFC",
];

export type TransmittalType = "standard" | "cid";
export type StandardDocumentSourceMode = "pdf_analysis" | "project_metadata";

export type OutputFormat = "docx" | "pdf" | "both";

export type Contact = {
	id: string;
	name: string;
	company: string;
	email: string;
	phone: string;
};

export type CidDocument = {
	id: string;
	fileName: string;
	description: string;
	revision: string;
};

export type StandardDocument = {
	id: string;
	fileName: string;
	attachmentFileName: string;
	projectRelativePath?: string;
	drawingNumber: string;
	title: string;
	revision: string;
	confidence: number;
	source: string;
	needsReview: boolean;
	accepted: boolean;
	overrideReason: string;
	modelVersion?: string;
	metadataWarnings: string[];
};

export type OptionKey =
	| "trans_pdf"
	| "trans_cad"
	| "trans_originals"
	| "via_email"
	| "via_ftp"
	| "ci_bid"
	| "ci_preliminary"
	| "ci_approval"
	| "ci_fabrication"
	| "ci_construction"
	| "ci_asbuilt"
	| "ci_info"
	| "ci_reference"
	| "vr_approved"
	| "vr_approved_noted"
	| "vr_rejected";

export type OptionsState = Record<OptionKey, boolean>;

export type DraftState = {
	transmittalType: TransmittalType;
	standardDocumentSource: StandardDocumentSourceMode;
	selectedProjectId: string;
	projectName: string;
	projectNumber: string;
	date: string;
	transmittalNumber: string;
	description: string;
	peName: string;
	fromName: string;
	fromTitle: string;
	fromEmail: string;
	fromPhone: string;
	firmNumber: string;
	contacts: Contact[];
	options: OptionsState;
	cidDocuments: CidDocument[];
	standardDocuments: StandardDocument[];
};

export type FileState = {
	template: File | null;
	index: File | null;
	acadeReport: File | null;
	pdfs: File[];
	cid: File[];
};

export type TransmittalPayload = {
	transmittal_type: TransmittalType;
	fields: {
		date: string;
		job_num: string;
		transmittal_num: string;
		client: string;
		project_desc: string;
		from_profile_id: string;
		from_name: string;
		from_title: string;
		from_email: string;
		from_phone: string;
		firm: string;
	};
	checks: Record<string, boolean>;
	contacts: Array<{
		name: string;
		company: string;
		email: string;
		phone: string;
	}>;
	files: {
		template?: string;
		index?: string;
		pdfs?: string[];
		cid?: string[];
	};
	cid_index_data?: Array<{
		filename: string;
		description: string;
		revision: string;
	}>;
	pdf_document_data?: Array<{
		file_name: string;
		attachment_file_name?: string;
		project_relative_path?: string;
		drawing_number: string;
		title: string;
		revision: string;
		confidence: number;
		source: string;
		needs_review: boolean;
		accepted: boolean;
		override_reason: string;
		model_version?: string;
		metadata_warnings?: string[];
	}>;
	generated_at: string;
};

export type GenerationState = {
	state: "idle" | "loading" | "success" | "error";
	message?: string;
};

export type OutputFile = {
	id: string;
	label: string;
	filename: string;
	url: string;
	size: number;
	createdAt: string;
};

export const DEFAULT_OPTIONS: OptionsState = {
	trans_pdf: true,
	trans_cad: false,
	trans_originals: false,
	via_email: true,
	via_ftp: false,
	ci_bid: false,
	ci_preliminary: false,
	ci_approval: false,
	ci_fabrication: false,
	ci_construction: false,
	ci_asbuilt: false,
	ci_info: false,
	ci_reference: false,
	vr_approved: false,
	vr_approved_noted: false,
	vr_rejected: false,
};

export const OPTION_GROUPS: Array<{
	id: string;
	label: string;
	options: Array<{ key: OptionKey; label: string }>;
}> = [
	{
		id: "transmitted",
		label: "Transmitted",
		options: [
			{ key: "trans_pdf", label: "PDF" },
			{ key: "trans_cad", label: "CAD" },
			{ key: "trans_originals", label: "Originals" },
		],
	},
	{
		id: "sent-via",
		label: "Sent Via",
		options: [
			{ key: "via_email", label: "Email" },
			{ key: "via_ftp", label: "FTP" },
		],
	},
	{
		id: "client-issue",
		label: "Client Issue",
		options: [
			{ key: "ci_bid", label: "For Bid" },
			{ key: "ci_preliminary", label: "For Preliminary" },
			{ key: "ci_approval", label: "For Approval" },
			{ key: "ci_fabrication", label: "For Fabrication" },
			{ key: "ci_construction", label: "For Construction" },
			{ key: "ci_asbuilt", label: "For As-Built" },
			{ key: "ci_info", label: "For Information Only" },
			{ key: "ci_reference", label: "For Reference" },
		],
	},
	{
		id: "vendor-return",
		label: "Vendor Return",
		options: [
			{ key: "vr_approved", label: "Approved" },
			{ key: "vr_approved_noted", label: "Approved as Noted" },
			{ key: "vr_rejected", label: "Rejected" },
		],
	},
];

export const OUTPUT_FORMATS: Array<{
	value: OutputFormat;
	label: string;
	description: string;
	icon: typeof FileText;
}> = [
	{
		value: "both",
		label: "DOCX + PDF",
		description: "Generate both files as separate downloads.",
		icon: FileArchive,
	},
	{
		value: "docx",
		label: "DOCX",
		description: "Word document output only.",
		icon: FileText,
	},
	{
		value: "pdf",
		label: "PDF",
		description: "Portable document format.",
		icon: FileText,
	},
];

export const createId = () => localId();

export const formatDate = (value: Date) => {
	const mm = String(value.getMonth() + 1).padStart(2, "0");
	const dd = String(value.getDate()).padStart(2, "0");
	const yyyy = value.getFullYear();
	return `${mm}/${dd}/${yyyy}`;
};

export const safeTrim = (value: string | undefined | null) =>
	value ? value.trim() : "";

const normalizeDrawingKey = (value: string | undefined | null) =>
	safeTrim(value)
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");

const normalizeFileStem = (value: string | undefined | null) =>
	safeTrim(value)
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");

const PROJECT_SENDER_ID_PREFIX = "project-pe:";

export const createProjectSenderId = (projectId: string) =>
	`${PROJECT_SENDER_ID_PREFIX}${safeTrim(projectId)}`;

export const isProjectSenderId = (value: string | undefined | null) =>
	safeTrim(value).startsWith(PROJECT_SENDER_ID_PREFIX);

const resolvePayloadProfileId = (value: string | undefined | null) =>
	isProjectSenderId(value) ? "" : safeTrim(value);

export const getProfileById = (profiles: PeProfile[], id: string) =>
	profiles.find((profile) => profile.id === id);

export const resolveProfileId = (
	profiles: PeProfile[],
	maybeIdOrName: string,
) => {
	const candidate = safeTrim(maybeIdOrName);
	if (!candidate) return "";
	const byId = profiles.find((profile) => profile.id === candidate);
	if (byId) return byId.id;
	const byName = profiles.find((profile) => profile.name === candidate);
	return byName?.id ?? "";
};

export const buildDefaultDraft = ({
	profiles = PE_PROFILES,
	firms = FIRM_NUMBERS,
	defaultProfileId = DEFAULT_PE,
	defaultFirm = DEFAULT_FIRM,
}: {
	profiles?: PeProfile[];
	firms?: string[];
	defaultProfileId?: string;
	defaultFirm?: string;
} = {}): DraftState => {
	const resolvedProfileId =
		resolveProfileId(profiles, defaultProfileId) || profiles[0]?.id || "";
	const profile = getProfileById(profiles, resolvedProfileId);
	const resolvedFirm = firms.includes(defaultFirm)
		? defaultFirm
		: (firms[0] ?? DEFAULT_FIRM);
	return {
		transmittalType: "standard",
		standardDocumentSource: "project_metadata",
		selectedProjectId: "",
		projectName: "",
		projectNumber: "",
		date: formatDate(new Date()),
		transmittalNumber: "",
		description: "",
		peName: resolvedProfileId,
		fromName: profile?.name ?? "",
		fromTitle: profile?.title ?? "",
		fromEmail: profile?.email ?? "",
		fromPhone: profile?.phone ?? "",
		firmNumber: resolvedFirm,
		contacts: [
			{
				id: createId(),
				name: "",
				company: "",
				email: "",
				phone: "",
			},
		],
		options: { ...DEFAULT_OPTIONS },
		cidDocuments: [],
		standardDocuments: [],
	};
};

export const parseCidFilename = (filename: string) => {
	try {
		let name = filename.replace(/\.cid$/i, "");
		name = name.replace(/_R3P_\d{8}$/i, "");
		const parts = name.split("_");
		if (parts.length >= 3) {
			const relayType = parts[0];
			const relayName = parts[1];
			const feedsProtects = parts[2];
			return `Relay ${relayType} (${relayName}) protecting ${feedsProtects}`;
		}
		if (parts.length === 2) {
			const relayType = parts[0];
			const relayName = parts[1];
			return `Relay ${relayType} (${relayName})`;
		}
		return `Relay ${name}`;
	} catch {
		return filename.replace(/\.cid$/i, "");
	}
};

export const buildCidDocuments = (
	files: File[],
	current: CidDocument[],
): CidDocument[] => {
	return files.map((file) => {
		const existing = current.find((doc) => doc.fileName === file.name);
		return (
			existing ?? {
				id: createId(),
				fileName: file.name,
				description: parseCidFilename(file.name),
				revision: "-",
			}
		);
	});
};

export const buildStandardDocuments = (
	files: File[],
	current: StandardDocument[],
	analysisRows?: Array<{
		file_name?: string;
		drawing_number?: string;
		title?: string;
		revision?: string;
		confidence?: number;
		source?: string;
		needs_review?: boolean;
		accepted?: boolean;
		override_reason?: string | null;
		recognition?: {
			model_version?: string;
		};
	}>,
): StandardDocument[] => {
	const analysisByFileName = new Map(
		(analysisRows ?? [])
			.filter((row) => row && safeTrim(row.file_name))
			.map((row) => [safeTrim(row.file_name), row]),
	);
	return files.map((file) => {
		const existing = current.find((doc) => doc.fileName === file.name);
		const analysis = analysisByFileName.get(file.name);
		return (
			existing ?? {
				id: createId(),
				fileName: file.name,
				attachmentFileName: file.name,
				projectRelativePath: "",
				drawingNumber: safeTrim(analysis?.drawing_number),
				title: safeTrim(analysis?.title),
				revision: safeTrim(analysis?.revision),
				confidence:
					typeof analysis?.confidence === "number" &&
					Number.isFinite(analysis.confidence)
						? analysis.confidence
						: 0,
				source: safeTrim(analysis?.source) || "manual",
				needsReview: Boolean(analysis?.needs_review),
				accepted:
					typeof analysis?.accepted === "boolean"
						? analysis.accepted
						: !analysis?.needs_review,
				overrideReason: safeTrim(analysis?.override_reason),
				modelVersion: safeTrim(analysis?.recognition?.model_version),
				metadataWarnings: [],
			}
		);
	});
};

export const buildProjectMetadataDocuments = (
	files: File[],
	metadataRows: ProjectDocumentMetadataRow[],
	current: StandardDocument[],
): StandardDocument[] => {
	const scopedEntries =
		files.length > 0
			? files.map((file) => ({
					attachmentFileName: file.name,
					row: buildProjectMetadataRowsForFiles([file.name], metadataRows)[0],
				}))
			: buildProjectMetadataRowsForFiles([], metadataRows).map((row) => ({
					attachmentFileName: row.fileName,
					row,
				}));

	return scopedEntries.map(({ attachmentFileName, row }) => {
		const existing = current.find(
			(doc) =>
				doc.attachmentFileName === attachmentFileName ||
				doc.fileName === row.fileName,
		);
		const metadataWarnings = [...row.issues, ...row.warnings];
		const needsReview = row.reviewState !== "ready";

		if (
			existing &&
			(existing.source === "manual_review" || safeTrim(existing.overrideReason))
		) {
			return {
				...existing,
				fileName: row.fileName,
				attachmentFileName,
				projectRelativePath: row.relativePath,
				confidence: row.confidence,
				needsReview,
				accepted: existing.accepted || !needsReview,
				source: "manual_review",
				modelVersion: "project-metadata-v1",
				metadataWarnings,
			};
		}

		return {
			id: existing?.id ?? createId(),
			fileName: row.fileName,
			attachmentFileName,
			projectRelativePath: row.relativePath,
			drawingNumber: safeTrim(row.drawingNumber),
			title: safeTrim(row.title),
			revision: safeTrim(row.revision),
			confidence: row.confidence,
			source: row.source,
			needsReview,
			accepted: !needsReview,
			overrideReason: "",
			modelVersion: "project-metadata-v1",
			metadataWarnings,
		};
	});
};

export const buildRegisterBackedDocuments = (
	registerRows: ProjectDeliverableRegisterRow[],
	files: File[],
	metadataRows: ProjectDocumentMetadataRow[],
	current: StandardDocument[],
): StandardDocument[] => {
	const fileByName = new Map(
		files.map((file) => [safeTrim(file.name).toUpperCase(), file]),
	);
	const metadataByDrawingKey = new Map<string, ProjectDocumentMetadataRow>();
	const metadataByFileKey = new Map<string, ProjectDocumentMetadataRow>();

	for (const row of metadataRows) {
		const drawingKey = normalizeDrawingKey(row.drawingNumber);
		if (drawingKey && !metadataByDrawingKey.has(drawingKey)) {
			metadataByDrawingKey.set(drawingKey, row);
		}
		const fileKeys = [
			normalizeFileStem(row.fileName),
			normalizeFileStem(row.relativePath),
		].filter(Boolean);
		for (const key of fileKeys) {
			if (!metadataByFileKey.has(key)) {
				metadataByFileKey.set(key, row);
			}
		}
	}

	return registerRows.map((registerRow) => {
		const preferredPdfMatch =
			registerRow.pdfMatches.find(
				(match) => match.id === registerRow.manualPdfMatchId,
			) ??
			(registerRow.pdfMatches.length === 1 ? registerRow.pdfMatches[0] : null);
		const matchedFile =
			(preferredPdfMatch
				? fileByName.get(safeTrim(preferredPdfMatch.fileName).toUpperCase())
				: null) ??
			files.find((file) =>
				normalizeFileStem(file.name).includes(registerRow.drawingKey),
			) ??
			null;
		const attachmentFileName =
			matchedFile?.name ||
			preferredPdfMatch?.fileName ||
			`${registerRow.drawingNumber}.pdf`;
		const preferredDwgMatch =
			registerRow.dwgMatches.find(
				(match) => match.id === registerRow.manualDwgMatchId,
			) ??
			(registerRow.dwgMatches.length === 1 ? registerRow.dwgMatches[0] : null);
		const metadataRow =
			(preferredDwgMatch
				? metadataByFileKey.get(
						normalizeFileStem(preferredDwgMatch.relativePath),
					)
				: null) ??
			(preferredDwgMatch
				? metadataByFileKey.get(normalizeFileStem(preferredDwgMatch.fileName))
				: null) ??
			metadataByDrawingKey.get(registerRow.drawingKey) ??
			null;
		const metadataWarnings: string[] = [];
		const appendWarning = (value: string | null | undefined) => {
			const normalized = safeTrim(value);
			if (normalized && !metadataWarnings.includes(normalized)) {
				metadataWarnings.push(normalized);
			}
		};

		if (!matchedFile || registerRow.pdfPairingStatus === "missing") {
			appendWarning("Missing paired PDF for this deliverable register row.");
		}
		if (registerRow.pdfPairingStatus === "multiple") {
			appendWarning("Multiple PDF matches still need review.");
		}
		if (registerRow.titleBlockVerificationState !== "matched") {
			appendWarning(
				registerRow.titleBlockVerificationDetail ||
					"Title block metadata still needs package review.",
			);
		}
		if (registerRow.acadeVerificationState !== "matched") {
			appendWarning(
				registerRow.acadeVerificationDetail ||
					"ACADE metadata still needs package review.",
			);
		}
		if (!metadataRow && registerRow.dwgPairingStatus === "missing") {
			appendWarning("No DWG match was found for title block verification.");
		}

		const needsReview =
			registerRow.pdfPairingStatus !== "paired" &&
			registerRow.pdfPairingStatus !== "manual"
				? true
				: registerRow.titleBlockVerificationState !== "matched" ||
					registerRow.acadeVerificationState !== "matched" ||
					metadataWarnings.length > 0;
		const existing = current.find(
			(doc) =>
				doc.drawingNumber === registerRow.drawingNumber ||
				doc.attachmentFileName === attachmentFileName,
		);

		if (
			existing &&
			(existing.source === "manual_review" || safeTrim(existing.overrideReason))
		) {
			return {
				...existing,
				fileName: metadataRow?.fileName || existing.fileName,
				attachmentFileName,
				projectRelativePath:
					metadataRow?.relativePath || existing.projectRelativePath,
				confidence: metadataRow?.confidence ?? 1,
				needsReview,
				accepted: existing.accepted || !needsReview,
				source: "manual_review",
				modelVersion: "project-register-v1",
				metadataWarnings,
			};
		}

		return {
			id: existing?.id ?? createId(),
			fileName: metadataRow?.fileName || attachmentFileName,
			attachmentFileName,
			projectRelativePath: metadataRow?.relativePath,
			drawingNumber: registerRow.drawingNumber,
			title: registerRow.drawingDescription || metadataRow?.title || "",
			revision: registerRow.currentRevision || metadataRow?.revision || "",
			confidence: metadataRow?.confidence ?? (needsReview ? 0.72 : 0.94),
			source: "project_register",
			needsReview,
			accepted: !needsReview,
			overrideReason: "",
			modelVersion: "project-register-v1",
			metadataWarnings,
		};
	});
};

export const isContactComplete = (contact: Contact) =>
	Boolean(
		safeTrim(contact.name) &&
			safeTrim(contact.company) &&
			safeTrim(contact.email) &&
			safeTrim(contact.phone),
	);

export const hasContactAnyValue = (contact: Contact) =>
	Boolean(
		safeTrim(contact.name) ||
			safeTrim(contact.company) ||
			safeTrim(contact.email) ||
			safeTrim(contact.phone),
	);

export const validateDraft = (draft: DraftState, files: FileState) => {
	const errors: string[] = [];
	const fields: Record<string, boolean> = {};

	if (!safeTrim(draft.projectName)) {
		fields.projectName = true;
		errors.push("Project name is required.");
	}
	if (!safeTrim(draft.projectNumber)) {
		fields.projectNumber = true;
		errors.push("Project number is required.");
	}
	if (!safeTrim(draft.date)) {
		fields.date = true;
		errors.push("Date is required.");
	}
	if (!safeTrim(draft.transmittalNumber)) {
		fields.transmittalNumber = true;
		errors.push("Transmittal number is required.");
	}
	if (!safeTrim(draft.peName)) {
		fields.peName = true;
		errors.push("Sender profile is required.");
	}
	if (!safeTrim(draft.fromTitle)) {
		fields.fromTitle = true;
		errors.push("From title is required.");
	}
	if (!safeTrim(draft.fromEmail) || !EMAIL_PATTERN.test(draft.fromEmail)) {
		fields.fromEmail = true;
		errors.push("A valid from email is required.");
	}
	if (!files.template) {
		fields.template = true;
		errors.push("Template file is required.");
	}

	if (draft.transmittalType === "standard") {
		if (
			draft.standardDocumentSource === "project_metadata" &&
			!safeTrim(draft.selectedProjectId)
		) {
			fields.selectedProjectId = true;
			errors.push("Select a project when using project metadata mode.");
		}
		if (files.pdfs.length === 0) {
			fields.pdfs = true;
			errors.push("Select at least one PDF document.");
		}
		const requiresGeneratedIndex = !files.index;
		if (requiresGeneratedIndex) {
			if (draft.standardDocuments.length === 0) {
				fields.standardDocuments = true;
				errors.push(
					"Load project metadata, analyze PDF documents, or upload a drawing index before generating.",
				);
			}
			const pendingReview = draft.standardDocuments.filter(
				(doc) => doc.needsReview && !doc.accepted,
			);
			if (pendingReview.length > 0) {
				fields.standardDocuments = true;
				errors.push(
					"Review or accept all low-confidence document rows before generating without an index.",
				);
			}
		}
	} else {
		if (files.cid.length === 0) {
			fields.cid = true;
			errors.push("Select at least one CID file.");
		}
		const hasDescription = draft.cidDocuments.some((doc) =>
			Boolean(safeTrim(doc.description)),
		);
		if (!hasDescription) {
			fields.cidDocs = true;
			errors.push("CID document descriptions are required.");
		}
	}

	const validContacts = draft.contacts.filter(isContactComplete);
	if (validContacts.length === 0) {
		fields.contacts = true;
		errors.push("At least one complete contact is required.");
	}

	const hasPartial = draft.contacts.some(
		(contact) => hasContactAnyValue(contact) && !isContactComplete(contact),
	);
	if (hasPartial) {
		errors.push("Remove or complete partial contact rows.");
	}

	return { errors, fields };
};

export const buildPayload = (
	draft: DraftState,
	files: FileState,
): TransmittalPayload => {
	const contacts = draft.contacts.filter(isContactComplete).map((contact) => ({
		name: safeTrim(contact.name),
		company: safeTrim(contact.company),
		email: safeTrim(contact.email),
		phone: safeTrim(contact.phone),
	}));

	const checks = {
		...draft.options,
		ci_fab: draft.options.ci_fabrication,
		ci_const: draft.options.ci_construction,
		ci_record: false,
		ci_ref: draft.options.ci_reference,
	};

	return {
		transmittal_type: draft.transmittalType,
		fields: {
			date: safeTrim(draft.date),
			job_num: safeTrim(draft.projectNumber),
			transmittal_num: safeTrim(draft.transmittalNumber),
			client: safeTrim(draft.projectName),
			project_desc: safeTrim(draft.description),
			from_profile_id: resolvePayloadProfileId(draft.peName),
			from_name: safeTrim(draft.fromName),
			from_title: safeTrim(draft.fromTitle),
			from_email: safeTrim(draft.fromEmail),
			from_phone: safeTrim(draft.fromPhone),
			firm: safeTrim(draft.firmNumber),
		},
		checks,
		contacts,
		files: {
			template: files.template?.name,
			index: files.index?.name,
			pdfs: files.pdfs.map((file) => file.name),
			cid: files.cid.map((file) => file.name),
		},
		cid_index_data:
			draft.transmittalType === "cid"
				? draft.cidDocuments
						.filter((doc) => safeTrim(doc.description))
						.map((doc) => ({
							filename: doc.fileName,
							description: safeTrim(doc.description),
							revision: doc.revision === "-" ? "" : doc.revision,
						}))
				: undefined,
		pdf_document_data:
			draft.transmittalType === "standard"
				? draft.standardDocuments.map((doc) => ({
						file_name: safeTrim(doc.attachmentFileName || doc.fileName),
						attachment_file_name: safeTrim(
							doc.attachmentFileName || doc.fileName,
						),
						project_relative_path:
							safeTrim(doc.projectRelativePath) || undefined,
						drawing_number: safeTrim(doc.drawingNumber),
						title: safeTrim(doc.title),
						revision: safeTrim(doc.revision),
						confidence: doc.confidence,
						source: safeTrim(doc.source) || "manual",
						needs_review: doc.needsReview,
						accepted: doc.accepted,
						override_reason: safeTrim(doc.overrideReason),
						model_version: safeTrim(doc.modelVersion) || undefined,
						metadata_warnings:
							doc.metadataWarnings.length > 0
								? [...doc.metadataWarnings]
								: undefined,
					}))
				: undefined,
		generated_at: new Date().toISOString(),
	};
};

export const loadDraft = (): DraftState => {
	const storage = getLocalStorageApi();
	if (!storage) return buildDefaultDraft();
	try {
		const raw = storage.getItem(AUTOSAVE_KEY);
		if (!raw) return buildDefaultDraft();
		const parsed = JSON.parse(raw) as Partial<DraftState>;
		const base = buildDefaultDraft();
		return {
			...base,
			...parsed,
			standardDocumentSource:
				parsed.standardDocumentSource === "project_metadata"
					? ("project_metadata" as StandardDocumentSourceMode)
					: ("pdf_analysis" as StandardDocumentSourceMode),
			selectedProjectId: parsed.selectedProjectId ?? "",
			options: { ...DEFAULT_OPTIONS, ...(parsed.options ?? {}) },
			contacts:
				Array.isArray(parsed.contacts) && parsed.contacts.length > 0
					? parsed.contacts.map((contact) => ({
							id: contact.id ?? createId(),
							name: contact.name ?? "",
							company: contact.company ?? "",
							email: contact.email ?? "",
							phone: contact.phone ?? "",
						}))
					: base.contacts,
			cidDocuments: Array.isArray(parsed.cidDocuments)
				? parsed.cidDocuments.map((doc) => ({
						id: doc.id ?? createId(),
						fileName: doc.fileName ?? "",
						description: doc.description ?? "",
						revision: doc.revision ?? "-",
					}))
				: base.cidDocuments,
			standardDocuments: Array.isArray(parsed.standardDocuments)
				? parsed.standardDocuments.map((doc) => ({
						id: doc.id ?? createId(),
						fileName: doc.fileName ?? "",
						attachmentFileName: doc.attachmentFileName ?? doc.fileName ?? "",
						projectRelativePath: doc.projectRelativePath ?? "",
						drawingNumber: doc.drawingNumber ?? "",
						title: doc.title ?? "",
						revision: doc.revision ?? "",
						confidence:
							typeof doc.confidence === "number" &&
							Number.isFinite(doc.confidence)
								? doc.confidence
								: 0,
						source: doc.source ?? "manual",
						needsReview: Boolean(doc.needsReview),
						accepted: Boolean(doc.accepted),
						overrideReason: doc.overrideReason ?? "",
						modelVersion: doc.modelVersion ?? "",
						metadataWarnings: Array.isArray(doc.metadataWarnings)
							? doc.metadataWarnings.map((warning) => String(warning ?? ""))
							: [],
					}))
				: base.standardDocuments,
		};
	} catch {
		return buildDefaultDraft();
	}
};

export const syncDraftToProfileCatalog = (
	draft: DraftState,
	profiles: PeProfile[],
	firms: string[],
	defaults: { profileId: string; firm: string },
): DraftState => {
	if (isProjectSenderId(draft.peName)) {
		return {
			...draft,
			firmNumber: safeTrim(draft.firmNumber)
				? draft.firmNumber
				: firms.includes(defaults.firm)
					? defaults.firm
					: (firms[0] ?? DEFAULT_FIRM),
		};
	}

	const resolvedProfileId =
		resolveProfileId(profiles, draft.peName) ||
		resolveProfileId(profiles, defaults.profileId) ||
		profiles[0]?.id ||
		"";
	const resolvedProfile = getProfileById(profiles, resolvedProfileId);
	const draftFirm = safeTrim(draft.firmNumber);
	const resolvedFirm = draftFirm
		? draftFirm
		: firms.includes(defaults.firm)
			? defaults.firm
			: (firms[0] ?? DEFAULT_FIRM);

	return {
		...draft,
		peName: resolvedProfileId,
		fromName: resolvedProfile?.name ?? draft.fromName,
		fromTitle: resolvedProfile?.title ?? draft.fromTitle,
		fromEmail: resolvedProfile?.email ?? draft.fromEmail,
		fromPhone: resolvedProfile?.phone ?? draft.fromPhone,
		firmNumber: resolvedFirm,
	};
};

export const buildFormData = (
	draft: DraftState,
	files: FileState,
	format: OutputFormat,
) => {
	const payload = buildPayload(draft, files);
	const formData = new FormData();
	formData.append("type", payload.transmittal_type);
	formData.append("mode", "generate");
	formData.append("format", format);
	formData.append("fields", JSON.stringify(payload.fields));
	formData.append("checks", JSON.stringify(payload.checks));
	formData.append("contacts", JSON.stringify(payload.contacts));
	if (payload.cid_index_data) {
		formData.append("cid_index_data", JSON.stringify(payload.cid_index_data));
	}
	if (payload.pdf_document_data) {
		formData.append(
			"pdf_document_data",
			JSON.stringify(payload.pdf_document_data),
		);
	}

	if (files.template) {
		formData.append("template", files.template);
	}
	if (payload.transmittal_type === "standard") {
		if (files.index) formData.append("index", files.index);
		files.pdfs.forEach((file) => formData.append("documents", file));
	} else {
		files.cid.forEach((file) => formData.append("cid_files", file));
	}
	return formData;
};

export const bytesToSize = (value: number) => {
	if (!value) return "0 B";
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(value) / Math.log(1024));
	const size = value / 1024 ** i;
	return `${size.toFixed(1)} ${sizes[i]}`;
};
