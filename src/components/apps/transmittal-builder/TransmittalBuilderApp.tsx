import {
	AlertTriangle,
	CheckCircle2,
	Download,
	FileArchive,
	FileText,
	Loader2,
	Plus,
	RefreshCcw,
	Trash2,
	Upload,
} from "lucide-react";
import type { ChangeEvent, ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/apps/ui/button";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { Input } from "@/components/apps/ui/input";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { RadioGroup, RadioGroupItem } from "@/components/apps/ui/RadioGroup";
import { Surface } from "@/components/apps/ui/Surface";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Textarea } from "@/components/apps/ui/textarea";
import { hexToRgba, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { logActivity } from "@/services/activityService";
import {
	DEFAULT_FIRM,
	DEFAULT_PE,
	FIRM_NUMBERS,
	PE_PROFILES,
} from "./transmittalConfig";
import { transmittalService } from "./transmittalService";

const AUTOSAVE_KEY = "transmittal-builder-draft-v1";
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const REVISION_OPTIONS = [
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

type TransmittalType = "standard" | "cid";

type OutputFormat = "docx" | "pdf" | "both";

type Contact = {
	id: string;
	name: string;
	company: string;
	email: string;
	phone: string;
};

type CidDocument = {
	id: string;
	fileName: string;
	description: string;
	revision: string;
};

type OptionKey =
	| "trans_pdf"
	| "trans_cad"
	| "trans_originals"
	| "via_email"
	| "via_ftp"
	| "ci_bid"
	| "ci_preliminary"
	| "ci_approval"
	| "ci_construction"
	| "ci_asbuilt"
	| "ci_info"
	| "ci_reference"
	| "vr_approved"
	| "vr_approved_noted"
	| "vr_rejected";

type OptionsState = Record<OptionKey, boolean>;

type DraftState = {
	transmittalType: TransmittalType;
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
};

type FileState = {
	template: File | null;
	index: File | null;
	pdfs: File[];
	cid: File[];
};

type TransmittalPayload = {
	transmittal_type: TransmittalType;
	fields: {
		date: string;
		job_num: string;
		transmittal_num: string;
		client: string;
		project_desc: string;
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
	generated_at: string;
};

type GenerationState = {
	state: "idle" | "loading" | "success" | "error";
	message?: string;
};

type OutputFile = {
	id: string;
	label: string;
	filename: string;
	url: string;
	size: number;
	createdAt: string;
};

const DEFAULT_OPTIONS: OptionsState = {
	trans_pdf: true,
	trans_cad: false,
	trans_originals: false,
	via_email: true,
	via_ftp: false,
	ci_bid: false,
	ci_preliminary: false,
	ci_approval: false,
	ci_construction: false,
	ci_asbuilt: false,
	ci_info: false,
	ci_reference: false,
	vr_approved: false,
	vr_approved_noted: false,
	vr_rejected: false,
};

const OPTION_GROUPS: Array<{
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

const OUTPUT_FORMATS: Array<{
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

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatDate = (value: Date) => {
	const mm = String(value.getMonth() + 1).padStart(2, "0");
	const dd = String(value.getDate()).padStart(2, "0");
	const yyyy = value.getFullYear();
	return `${mm}/${dd}/${yyyy}`;
};

const getProfile = (name: string) =>
	PE_PROFILES.find((profile) => profile.name === name);

const buildDefaultDraft = (): DraftState => {
	const profile = getProfile(DEFAULT_PE);
	return {
		transmittalType: "standard",
		projectName: "",
		projectNumber: "",
		date: formatDate(new Date()),
		transmittalNumber: "",
		description: "",
		peName: profile?.name ?? DEFAULT_PE,
		fromName: profile?.name ?? DEFAULT_PE,
		fromTitle: profile?.title ?? "",
		fromEmail: profile?.email ?? "",
		fromPhone: profile?.phone ?? "",
		firmNumber: DEFAULT_FIRM,
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
	};
};

const safeTrim = (value: string | undefined | null) =>
	value ? value.trim() : "";

const parseCidFilename = (filename: string) => {
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

const buildCidDocuments = (
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

const isContactComplete = (contact: Contact) =>
	Boolean(
		safeTrim(contact.name) &&
			safeTrim(contact.company) &&
			safeTrim(contact.email) &&
			safeTrim(contact.phone),
	);

const hasContactAnyValue = (contact: Contact) =>
	Boolean(
		safeTrim(contact.name) ||
			safeTrim(contact.company) ||
			safeTrim(contact.email) ||
			safeTrim(contact.phone),
	);

const validateDraft = (draft: DraftState, files: FileState) => {
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
		if (!files.index) {
			fields.index = true;
			errors.push("Drawing index file is required.");
		}
		if (files.pdfs.length === 0) {
			fields.pdfs = true;
			errors.push("Select at least one PDF document.");
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

const buildPayload = (
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
		ci_fab: false,
		ci_const: draft.options.ci_construction,
		ci_record: false,
		ci_ref: draft.options.ci_reference,
	};

	const payload: TransmittalPayload = {
		transmittal_type: draft.transmittalType,
		fields: {
			date: safeTrim(draft.date),
			job_num: safeTrim(draft.projectNumber),
			transmittal_num: safeTrim(draft.transmittalNumber),
			client: safeTrim(draft.projectName),
			project_desc: safeTrim(draft.description),
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
		generated_at: new Date().toISOString(),
	};

	return payload;
};

const loadDraft = () => {
	if (typeof window === "undefined") return buildDefaultDraft();
	try {
		const raw = window.localStorage.getItem(AUTOSAVE_KEY);
		if (!raw) return buildDefaultDraft();
		const parsed = JSON.parse(raw) as Partial<DraftState>;
		const base = buildDefaultDraft();
		return {
			...base,
			...parsed,
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
		};
	} catch {
		return buildDefaultDraft();
	}
};

const buildFormData = (
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

const bytesToSize = (value: number) => {
	if (!value) return "0 B";
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(value) / Math.log(1024));
	const size = value / Math.pow(1024, i);
	return `${size.toFixed(1)} ${sizes[i]}`;
};

const TransmittalSection = (props: ComponentProps<typeof FrameSection>) => (
	<FrameSection {...props} />
);

function FileRow({
	label,
	accept,
	multiple,
	files,
	onFilesSelected,
	helpText,
	invalid,
	action,
}: {
	label: string;
	accept: string;
	multiple?: boolean;
	files: File[];
	onFilesSelected: (files: File[]) => void;
	helpText?: string;
	invalid?: boolean;
	action?: {
		label: string;
		onClick: () => void;
		disabled?: boolean;
	};
}) {
	const { palette } = useTheme();
	const inputRef = useRef<HTMLInputElement | null>(null);

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(event.target.files ?? []);
		onFilesSelected(selected);
	};

	const handleClear = () => {
		if (inputRef.current) inputRef.current.value = "";
		onFilesSelected([]);
	};

	const previewLabel = useMemo(() => {
		if (files.length === 0) return "No files selected";
		if (files.length <= 3) return files.map((file) => file.name).join(", ");
		const head = files
			.slice(0, 3)
			.map((file) => file.name)
			.join(", ");
		return `${head} +${files.length - 3} more`;
	}, [files]);

	return (
		<Surface
			className="p-5 space-y-3"
			style={{
				border: `1px solid ${hexToRgba(
					invalid ? palette.accent : palette.primary,
					invalid ? 0.45 : 0.14,
				)}`,
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div
						className="text-sm font-semibold"
						style={{ color: hexToRgba(palette.text, 0.82) }}
					>
						{label}
					</div>
					{helpText ? (
						<div
							className="text-xs"
							style={{ color: hexToRgba(palette.textMuted, 0.9) }}
						>
							{helpText}
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{action ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={action.onClick}
							disabled={action.disabled}
						>
							{action.label}
						</Button>
					) : null}
					{files.length > 0 ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
						>
							Clear
						</Button>
					) : null}
				</div>
			</div>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Upload size={14} />
				<span>Choose files or drag into the picker.</span>
			</div>
			<Input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={handleChange}
			/>
			<div
				className="text-xs"
				style={{ color: hexToRgba(palette.textMuted, 0.9) }}
			>
				{previewLabel}
			</div>
		</Surface>
	);
}

export function TransmittalBuilderApp() {
	const { palette } = useTheme();
	const [draft, setDraft] = useState<DraftState>(() => loadDraft());
	const [files, setFiles] = useState<FileState>({
		template: null,
		index: null,
		pdfs: [],
		cid: [],
	});
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
	const [generationState, setGenerationState] = useState<GenerationState>({
		state: "idle",
	});
	const [outputs, setOutputs] = useState<OutputFile[]>([]);
	const [outputFormat, setOutputFormat] = useState<OutputFormat>("both");
	const [templateLoading, setTemplateLoading] = useState(false);
	const [templateError, setTemplateError] = useState<string | null>(null);
	const saveTimer = useRef<number | null>(null);

	const validation = useMemo(() => validateDraft(draft, files), [draft, files]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (saveTimer.current) window.clearTimeout(saveTimer.current);
		saveTimer.current = window.setTimeout(() => {
			window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
			setLastSavedAt(new Date());
		}, 600);
		return () => {
			if (saveTimer.current) window.clearTimeout(saveTimer.current);
		};
	}, [draft]);

	useEffect(() => {
		return () => {
			outputs.forEach((output) => URL.revokeObjectURL(output.url));
		};
	}, [outputs]);

	const updateDraft = useCallback(
		<K extends keyof DraftState>(key: K, value: DraftState[K]) => {
			setDraft((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const handlePeChange = (value: string) => {
		if (!value) {
			setDraft((prev) => ({
				...prev,
				peName: "",
				fromName: "",
				fromTitle: "",
				fromEmail: "",
				fromPhone: "",
			}));
			return;
		}
		const profile = getProfile(value);
		setDraft((prev) => ({
			...prev,
			peName: value,
			fromName: profile?.name ?? value,
			fromTitle: profile?.title ?? "",
			fromEmail: profile?.email ?? "",
			fromPhone: profile?.phone ?? "",
		}));
	};

	const handleTemplateFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, template: selected[0] ?? null }));
	};

	const handleIndexFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, index: selected[0] ?? null }));
	};

	const handlePdfFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, pdfs: selected }));
	};

	const handleCidFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, cid: selected }));
		setDraft((prev) => ({
			...prev,
			cidDocuments: buildCidDocuments(selected, prev.cidDocuments),
		}));
	};

	const handleScanCid = () => {
		setDraft((prev) => ({
			...prev,
			cidDocuments: buildCidDocuments(files.cid, prev.cidDocuments),
		}));
	};

	const handleContactChange = (
		id: string,
		field: keyof Contact,
		value: string,
	) => {
		setDraft((prev) => ({
			...prev,
			contacts: prev.contacts.map((contact) =>
				contact.id === id ? { ...contact, [field]: value } : contact,
			),
		}));
	};

	const addContact = () => {
		setDraft((prev) => ({
			...prev,
			contacts: [
				...prev.contacts,
				{
					id: createId(),
					name: "",
					company: "",
					email: "",
					phone: "",
				},
			],
		}));
	};

	const removeContact = (id: string) => {
		setDraft((prev) => {
			const next = prev.contacts.filter((contact) => contact.id !== id);
			return {
				...prev,
				contacts: next.length > 0 ? next : prev.contacts,
			};
		});
	};

	const updateCidDocument = (
		id: string,
		field: "description" | "revision",
		value: string,
	) => {
		setDraft((prev) => ({
			...prev,
			cidDocuments: prev.cidDocuments.map((doc) =>
				doc.id === id ? { ...doc, [field]: value } : doc,
			),
		}));
	};

	const removeCidDocument = (fileName: string) => {
		setFiles((prev) => ({
			...prev,
			cid: prev.cid.filter((file) => file.name !== fileName),
		}));
		setDraft((prev) => ({
			...prev,
			cidDocuments: prev.cidDocuments.filter(
				(doc) => doc.fileName !== fileName,
			),
		}));
	};

	const handleOptionToggle = (key: OptionKey, checked: boolean) => {
		setDraft((prev) => ({
			...prev,
			options: { ...prev.options, [key]: checked },
		}));
	};

	const resetSession = () => {
		const next = buildDefaultDraft();
		setDraft(next);
		setFiles({ template: null, index: null, pdfs: [], cid: [] });
		setOutputs([]);
		setSubmitAttempted(false);
		setLastSavedAt(null);
		setGenerationState({ state: "idle" });
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(AUTOSAVE_KEY);
		}
	};

	const handleGenerate = async () => {
		setSubmitAttempted(true);
		setTemplateError(null);
		if (validation.errors.length > 0) {
			setGenerationState({
				state: "error",
				message: "Fix validation issues before generating.",
			});
			return;
		}
		if (!transmittalService.hasApiKey()) {
			setGenerationState({
				state: "error",
				message: "Missing API key. Set VITE_API_KEY in your env.",
			});
			return;
		}

		setGenerationState({ state: "loading" });
		try {
			const nextOutputs: OutputFile[] = [];
			const errors: string[] = [];

			const runFormat = async (
				format: Exclude<OutputFormat, "both">,
				label: string,
			) => {
				try {
					const formData = buildFormData(draft, files, format);
					const result = await transmittalService.renderTransmittal(formData);
					const url = URL.createObjectURL(result.blob);
					const output: OutputFile = {
						id: createId(),
						label,
						filename: result.filename,
						url,
						size: result.blob.size,
						createdAt: new Date().toLocaleString(),
					};
					nextOutputs.push(output);

					const link = document.createElement("a");
					link.href = url;
					link.download = result.filename;
					document.body.appendChild(link);
					link.click();
					link.remove();
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: `Failed to generate ${label}.`;
					errors.push(message);
				}
			};

			if (outputFormat === "both") {
				await runFormat("docx", "DOCX");
				await runFormat("pdf", "PDF");
			} else {
				await runFormat(outputFormat, outputFormat.toUpperCase());
			}

			outputs.forEach((output) => URL.revokeObjectURL(output.url));
			setOutputs(nextOutputs);

			if (errors.length > 0) {
				const prefix =
					nextOutputs.length > 0
						? `Generated ${nextOutputs.length} file(s).`
						: "No files generated.";
				setGenerationState({
					state: "error",
					message: `${prefix} ${errors.join(" ")}`,
				});
				return;
			}

			setGenerationState({
				state: "success",
				message: "Transmittal generated successfully.",
			});
			const transmittalLabel = safeTrim(draft.transmittalNumber)
				? `Transmittal ${safeTrim(draft.transmittalNumber)}`
				: "Transmittal";
			const projectLabel = safeTrim(draft.projectName)
				? ` for ${safeTrim(draft.projectName)}`
				: "";
			await logActivity({
				action: "generate",
				description: `Generated ${transmittalLabel}${projectLabel}`,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to generate transmittal.";
			setGenerationState({ state: "error", message });
		}
	};

	const handleUseExampleTemplate = async () => {
		setTemplateError(null);
		setTemplateLoading(true);
		try {
			const result = await transmittalService.fetchExampleTemplate();
			const file = new File([result.blob], result.filename, {
				type:
					result.contentType ||
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			});
			setFiles((prev) => ({ ...prev, template: file }));
		} catch (error) {
			setTemplateError(
				error instanceof Error
					? error.message
					: "Failed to load example template.",
			);
		} finally {
			setTemplateLoading(false);
		}
	};

	const isInvalid = (key: string) =>
		submitAttempted && Boolean(validation.fields[key]);
	const completeContacts = useMemo(
		() => draft.contacts.filter(isContactComplete),
		[draft.contacts],
	);
	const optionSummary = useMemo(
		() =>
			OPTION_GROUPS.map((group) => {
				const selected = group.options
					.filter((option) => draft.options[option.key])
					.map((option) => option.label);
				return {
					label: group.label,
					value: selected.length > 0 ? selected.join(", ") : "None",
				};
			}),
		[draft.options],
	);
	const fileSummary = useMemo(() => {
		if (draft.transmittalType === "standard") {
			return {
				template: files.template?.name || "Not selected",
				index: files.index?.name || "Not selected",
				documents: `${files.pdfs.length} PDFs`,
			};
		}
		return {
			template: files.template?.name || "Not selected",
			index: "—",
			documents: `${files.cid.length} CID files`,
		};
	}, [draft.transmittalType, files]);

	return (
		<PageFrame
			title="Transmittal Builder"
			subtitle="Generate transmittal packages in DOCX and PDF formats."
			rightRail={
				<div className="space-y-4">
					<TransmittalSection title="Generate">
						<div className="grid gap-3 px-2 sm:px-3">
							<div className="grid gap-2">
								<div
									className="text-xs font-semibold"
									style={{ color: hexToRgba(palette.text, 0.75) }}
								>
									Output format
								</div>
								<RadioGroup<OutputFormat>
									value={outputFormat}
									onValueChange={(value) => setOutputFormat(value)}
									className="grid gap-2"
								>
									{OUTPUT_FORMATS.map((format) => {
										const Icon = format.icon;
										const active = outputFormat === format.value;
										return (
											<label
												key={format.value}
												className={cn(
													"flex items-center gap-3 rounded-xl border p-3 cursor-pointer",
													active ? "border-primary" : "border-border",
												)}
											>
												<RadioGroupItem
													value={format.value}
													aria-label={format.label}
												/>
												<Icon size={18} />
												<div>
													<div
														className="text-sm font-semibold"
														style={{ color: hexToRgba(palette.text, 0.82) }}
													>
														{format.label}
													</div>
													<div className="text-xs text-muted-foreground">
														{format.description}
													</div>
												</div>
											</label>
										);
									})}
								</RadioGroup>
							</div>

							<Button
								type="button"
								onClick={handleGenerate}
								disabled={generationState.state === "loading"}
							>
								{generationState.state === "loading" ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<Download size={16} />
								)}
								Generate documents
							</Button>

							<Button type="button" variant="outline" onClick={resetSession}>
								Reset session
							</Button>
						</div>
					</TransmittalSection>

					<TransmittalSection title="Output">
						<div className="grid gap-3 px-2 sm:px-3 text-xs text-muted-foreground">
							<div className="flex items-center gap-2">
								{generationState.state === "success" ? (
									<CheckCircle2 size={14} />
								) : generationState.state === "error" ? (
									<AlertTriangle size={14} />
								) : (
									<RefreshCcw size={14} />
								)}
								<span>
									{generationState.message || "Ready to generate transmittal."}
								</span>
							</div>
							{outputs.length === 0 ? (
								<div>No output yet.</div>
							) : (
								<div className="grid gap-2">
									{outputs.map((output) => (
										<Surface key={output.id} className="p-4">
											<div className="grid gap-1 text-xs">
												<div
													className="font-semibold"
													style={{
														color: hexToRgba(palette.text, 0.82),
													}}
												>
													{output.label}
												</div>
												<div>{output.filename}</div>
												<div>
													{bytesToSize(output.size)} | {output.createdAt}
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														const link = document.createElement("a");
														link.href = output.url;
														link.download = output.filename;
														link.click();
													}}
												>
													Download again
												</Button>
											</div>
										</Surface>
									))}
								</div>
							)}
						</div>
					</TransmittalSection>

					<TransmittalSection title="Summary">
						<Surface className="p-5 text-xs space-y-3">
							<div>
								<div className="text-muted-foreground">Project</div>
								<div
									className="text-sm font-semibold"
									style={{ color: hexToRgba(palette.text, 0.82) }}
								>
									{draft.projectName || "Untitled project"}
								</div>
								<div className="text-muted-foreground">
									{draft.projectNumber || "R3P-"} ·{" "}
									{draft.transmittalNumber || "XMTL-"} · {draft.date || "--"}
								</div>
							</div>

							<div>
								<div className="text-muted-foreground">From</div>
								<div style={{ color: hexToRgba(palette.text, 0.78) }}>
									{draft.fromName || "—"}
								</div>
								<div className="text-muted-foreground">
									{draft.fromTitle || "—"}
								</div>
							</div>

							<div>
								<div className="text-muted-foreground">Contacts</div>
								<div style={{ color: hexToRgba(palette.text, 0.78) }}>
									{completeContacts.length} complete
								</div>
							</div>

							<div>
								<div className="text-muted-foreground">Files</div>
								<div style={{ color: hexToRgba(palette.text, 0.78) }}>
									Template: {fileSummary.template}
								</div>
								<div className="text-muted-foreground">
									Index: {fileSummary.index} · {fileSummary.documents}
								</div>
							</div>

							<div>
								<div className="text-muted-foreground">Options</div>
								<div className="grid gap-1">
									{optionSummary.map((group) => (
										<div key={group.label}>
											<span style={{ color: hexToRgba(palette.text, 0.78) }}>
												{group.label}:
											</span>{" "}
											<span className="text-muted-foreground">
												{group.value}
											</span>
										</div>
									))}
								</div>
							</div>
						</Surface>
					</TransmittalSection>

					<TransmittalSection title="Validation">
						<div className="grid gap-2 px-2 sm:px-3 text-xs text-muted-foreground">
							<div>Draft saved: {lastSavedAt?.toLocaleTimeString() || "-"}</div>
							{submitAttempted && validation.errors.length > 0 ? (
								<div className="grid gap-1 text-red-400">
									{validation.errors.map((error) => (
										<div key={error}>{error}</div>
									))}
								</div>
							) : (
								<div>All required fields look good.</div>
							)}
						</div>
					</TransmittalSection>
				</div>
			}
		>
			<div className="space-y-4">
				<TransmittalSection title="Transmittal Type">
					<div className="px-2 sm:px-3">
						<RadioGroup<TransmittalType>
							value={draft.transmittalType}
							onValueChange={(value) => updateDraft("transmittalType", value)}
							className="grid gap-3 sm:grid-cols-2"
						>
							<label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer">
								<RadioGroupItem value="standard" aria-label="Standard" />
								<div>
									<div
										className="text-sm font-semibold"
										style={{ color: hexToRgba(palette.text, 0.82) }}
									>
										Standard
									</div>
									<div className="text-xs text-muted-foreground">
										PDF documents with an Excel index.
									</div>
								</div>
							</label>
							<label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer">
								<RadioGroupItem value="cid" aria-label="CID" />
								<div>
									<div
										className="text-sm font-semibold"
										style={{ color: hexToRgba(palette.text, 0.82) }}
									>
										CID
									</div>
									<div className="text-xs text-muted-foreground">
										CID files with document index entries.
									</div>
								</div>
							</label>
						</RadioGroup>
					</div>
				</TransmittalSection>

				<TransmittalSection title="File Selection">
					<div className="grid gap-4 px-2 sm:px-3">
						<FileRow
							label="Template File"
							accept=".docx"
							files={files.template ? [files.template] : []}
							onFilesSelected={handleTemplateFiles}
							helpText="DOCX template used for transmittal layout."
							invalid={isInvalid("template")}
							action={{
								label: templateLoading ? "Loading..." : "Use example",
								onClick: handleUseExampleTemplate,
								disabled: templateLoading,
							}}
						/>
						{templateError ? (
							<div className="text-xs text-red-400">{templateError}</div>
						) : null}

						{draft.transmittalType === "standard" ? (
							<div className="grid gap-4">
								<FileRow
									label="Drawing Index"
									accept=".xlsx,.xls"
									files={files.index ? [files.index] : []}
									onFilesSelected={handleIndexFiles}
									helpText="Excel index used to pull revisions."
									invalid={isInvalid("index")}
								/>
								<FileRow
									label="PDF Documents"
									accept=".pdf"
									multiple
									files={files.pdfs}
									onFilesSelected={handlePdfFiles}
									helpText="Select all PDF sheets for this package."
									invalid={isInvalid("pdfs")}
								/>
							</div>
						) : (
							<div className="grid gap-3">
								<FileRow
									label="CID Files"
									accept=".cid"
									multiple
									files={files.cid}
									onFilesSelected={handleCidFiles}
									helpText="Select CID files to include in the index."
									invalid={isInvalid("cid")}
								/>
								<Button
									type="button"
									variant="outline"
									onClick={handleScanCid}
									disabled={files.cid.length === 0}
								>
									<RefreshCcw size={16} />
									Refresh CID table
								</Button>
							</div>
						)}
					</div>
				</TransmittalSection>

				{draft.transmittalType === "cid" ? (
					<TransmittalSection title="CID Document Index">
						<div className="grid gap-3 px-2 sm:px-3">
							{draft.cidDocuments.length === 0 ? (
								<div className="text-sm text-muted-foreground">
									Select CID files to populate the list.
								</div>
							) : (
								<div className="grid gap-2">
									<div className="grid grid-cols-[2fr_4fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground">
										<span>File</span>
										<span>Description</span>
										<span>Revision</span>
										<span></span>
									</div>
									{draft.cidDocuments.map((doc) => (
										<div
											key={doc.id}
											className="grid grid-cols-[2fr_4fr_1fr_auto] gap-2 items-center"
										>
											<div
												className="truncate rounded-lg border border-border bg-background px-2 py-2 text-xs font-mono"
												title={doc.fileName}
											>
												{doc.fileName}
											</div>
											<Input
												value={doc.description}
												onChange={(event) =>
													updateCidDocument(
														doc.id,
														"description",
														event.target.value,
													)
												}
												className={cn(
													isInvalid("cidDocs") &&
														"border-red-500 focus-visible:ring-red-500",
												)}
											/>
											<Select
												value={doc.revision}
												onValueChange={(value) =>
													updateCidDocument(doc.id, "revision", value)
												}
											>
												<SelectTrigger className="text-xs">
													<SelectValue placeholder="-" />
												</SelectTrigger>
												<SelectContent>
													{REVISION_OPTIONS.map((option) => (
														<SelectItem key={option} value={option}>
															{option}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => removeCidDocument(doc.fileName)}
											>
												<Trash2 size={14} />
											</Button>
										</div>
									))}
								</div>
							)}
						</div>
					</TransmittalSection>
				) : null}

				<TransmittalSection title="Project Information">
					<div className="grid gap-4 px-2 sm:px-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">
									Project Name
								</label>
								<Input
									value={draft.projectName}
									onChange={(event) =>
										updateDraft("projectName", event.target.value)
									}
									className={cn(
										isInvalid("projectName") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="Client - Site Name"
								/>
							</div>
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">
									Project Number
								</label>
								<Input
									value={draft.projectNumber}
									onChange={(event) =>
										updateDraft("projectNumber", event.target.value)
									}
									className={cn(
										isInvalid("projectNumber") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="R3P-XXXX"
								/>
							</div>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">Date</label>
								<Input
									value={draft.date}
									onChange={(event) => updateDraft("date", event.target.value)}
									className={cn(
										isInvalid("date") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="MM/DD/YYYY"
								/>
							</div>
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">
									Transmittal
								</label>
								<Input
									value={draft.transmittalNumber}
									onChange={(event) =>
										updateDraft("transmittalNumber", event.target.value)
									}
									className={cn(
										isInvalid("transmittalNumber") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="XMTL-###"
								/>
							</div>
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">
								Description
							</label>
							<Textarea
								value={draft.description}
								onChange={(event) =>
									updateDraft("description", event.target.value)
								}
								rows={3}
								placeholder="Project description"
							/>
						</div>
					</div>
				</TransmittalSection>

				<TransmittalSection title="From Information">
					<div className="grid gap-4 px-2 sm:px-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">PE</label>
								<Select value={draft.peName} onValueChange={handlePeChange}>
									<SelectTrigger>
										<SelectValue placeholder="Select PE" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">(None)</SelectItem>
										{PE_PROFILES.map((profile) => (
											<SelectItem key={profile.name} value={profile.name}>
												{profile.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">Title</label>
								<Input
									value={draft.fromTitle}
									onChange={(event) =>
										updateDraft("fromTitle", event.target.value)
									}
									className={cn(
										isInvalid("fromTitle") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="Managing Partner"
								/>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">Email</label>
								<Input
									value={draft.fromEmail}
									onChange={(event) =>
										updateDraft("fromEmail", event.target.value)
									}
									className={cn(
										isInvalid("fromEmail") &&
											"border-red-500 focus-visible:ring-red-500",
									)}
									placeholder="name@company.com"
								/>
							</div>
							<div className="grid gap-1">
								<label className="text-xs text-muted-foreground">Phone</label>
								<Input
									value={draft.fromPhone}
									onChange={(event) =>
										updateDraft("fromPhone", event.target.value)
									}
									placeholder="(###) ###-####"
								/>
							</div>
						</div>

						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">
								Firm Number
							</label>
							<Select
								value={draft.firmNumber}
								onValueChange={(value) => updateDraft("firmNumber", value)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select firm" />
								</SelectTrigger>
								<SelectContent>
									{FIRM_NUMBERS.map((firm) => (
										<SelectItem key={firm} value={firm}>
											{firm}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</TransmittalSection>

				<TransmittalSection title="To - Contacts">
					<div className="grid gap-3 px-2 sm:px-3">
						{draft.contacts.map((contact) => (
							<Surface
								key={contact.id}
								className={cn(
									"p-4 space-y-3",
									isInvalid("contacts") && "border-red-500/70",
								)}
							>
								<div className="grid gap-2 sm:grid-cols-4">
									<Input
										value={contact.name}
										onChange={(event) =>
											handleContactChange(
												contact.id,
												"name",
												event.target.value,
											)
										}
										placeholder="Name"
									/>
									<Input
										value={contact.company}
										onChange={(event) =>
											handleContactChange(
												contact.id,
												"company",
												event.target.value,
											)
										}
										placeholder="Company"
									/>
									<Input
										value={contact.email}
										onChange={(event) =>
											handleContactChange(
												contact.id,
												"email",
												event.target.value,
											)
										}
										placeholder="Email"
									/>
									<Input
										value={contact.phone}
										onChange={(event) =>
											handleContactChange(
												contact.id,
												"phone",
												event.target.value,
											)
										}
										placeholder="Phone"
									/>
								</div>
								<div className="flex justify-end">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => removeContact(contact.id)}
										disabled={draft.contacts.length <= 1}
									>
										<Trash2 size={14} />
										Remove
									</Button>
								</div>
							</Surface>
						))}
						<Button type="button" variant="outline" onClick={addContact}>
							<Plus size={16} />
							Add contact
						</Button>
					</div>
				</TransmittalSection>

				<TransmittalSection title="Transmittal Options">
					<div className="grid gap-4 px-2 sm:px-3 sm:grid-cols-2 lg:grid-cols-4">
						{OPTION_GROUPS.map((group) => (
							<Surface
								key={group.id}
								className="p-4 space-y-3"
								style={{
									border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
								}}
							>
								<div className="text-xs font-semibold text-muted-foreground">
									{group.label}
								</div>
								<div className="grid gap-2">
									{group.options.map((option) => (
										<label
											key={option.key}
											className="flex items-center gap-2 text-sm"
										>
											<Checkbox
												checked={draft.options[option.key]}
												onCheckedChange={(checked) =>
													handleOptionToggle(option.key, checked)
												}
											/>
											<span>{option.label}</span>
										</label>
									))}
								</div>
							</Surface>
						))}
					</div>
				</TransmittalSection>
			</div>
		</PageFrame>
	);
}
