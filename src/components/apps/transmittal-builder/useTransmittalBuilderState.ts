import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { logActivity } from "@/services/activityService";
import {
	loadProjectDocumentMetadata,
	type ProjectDocumentMetadataProjectOption,
	type ProjectDocumentMetadataRow,
} from "@/services/projectDocumentMetadataService";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";
import { supabase } from "@/supabase/client";
import {
	AUTOSAVE_KEY,
	buildCidDocuments,
	buildDefaultDraft,
	buildFormData,
	buildProjectMetadataDocuments,
	buildStandardDocuments,
	type Contact,
	createId,
	type DraftState,
	type FileState,
	type GenerationState,
	getProfileById,
	isContactComplete,
	loadDraft,
	OPTION_GROUPS,
	type OptionKey,
	type OutputFile,
	type OutputFormat,
	resolveProfileId,
	type StandardDocumentSourceMode,
	safeTrim,
	syncDraftToProfileCatalog,
	validateDraft,
} from "./transmittalBuilderModels";
import {
	DEFAULT_FIRM,
	DEFAULT_PE,
	FIRM_NUMBERS,
	PE_PROFILES,
	type PeProfile,
} from "./transmittalConfig";
import { transmittalService } from "./transmittalService";

export function useTransmittalBuilderState(
	preferredProjectId?: string,
	preferredIssueSetId?: string,
) {
	const [draft, setDraft] = useState<DraftState>(() => loadDraft());
	const [projectOptions, setProjectOptions] = useState<
		ProjectDocumentMetadataProjectOption[]
	>([]);
	const [projectMetadataRows, setProjectMetadataRows] = useState<
		ProjectDocumentMetadataRow[]
	>([]);
	const [projectMetadataLoading, setProjectMetadataLoading] = useState(false);
	const [projectMetadataError, setProjectMetadataError] = useState<
		string | null
	>(null);
	const [projectMetadataWarnings, setProjectMetadataWarnings] = useState<
		string[]
	>([]);
	const [projectMetadataLoadedAt, setProjectMetadataLoadedAt] = useState<
		string | null
	>(null);
	const [preferredIssueSet, setPreferredIssueSet] =
		useState<ProjectIssueSetRecord | null>(null);
	const [profileOptions, setProfileOptions] =
		useState<PeProfile[]>(PE_PROFILES);
	const [firmOptions, setFirmOptions] = useState<string[]>(FIRM_NUMBERS);
	const [profileDefaults, setProfileDefaults] = useState<{
		profileId: string;
		firm: string;
	}>({
		profileId: DEFAULT_PE,
		firm: DEFAULT_FIRM,
	});
	const [files, setFiles] = useState<FileState>({
		template: null,
		index: null,
		acadeReport: null,
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
	const [pdfAnalysisLoading, setPdfAnalysisLoading] = useState(false);
	const [pdfAnalysisError, setPdfAnalysisError] = useState<string | null>(null);
	const [pdfAnalysisWarnings, setPdfAnalysisWarnings] = useState<string[]>([]);
	const [profileOptionsError, setProfileOptionsError] = useState<string | null>(
		null,
	);
	const saveTimer = useRef<number | null>(null);
	const pdfAnalysisRunIdRef = useRef(0);

	const validation = useMemo(() => validateDraft(draft, files), [draft, files]);

	useEffect(() => {
		let active = true;

		const loadProfileOptions = async () => {
			try {
				if (!transmittalService.hasApiKey()) return;
				const response = await transmittalService.fetchProfileOptions();
				if (!active) return;

				const nextProfiles =
					response.profiles.length > 0 ? response.profiles : PE_PROFILES;
				const nextFirms =
					response.firmNumbers.length > 0 ? response.firmNumbers : FIRM_NUMBERS;
				const nextDefaults = {
					profileId:
						resolveProfileId(nextProfiles, response.defaults.profileId) ||
						nextProfiles[0]?.id ||
						DEFAULT_PE,
					firm: nextFirms.includes(response.defaults.firm)
						? response.defaults.firm
						: (nextFirms[0] ?? DEFAULT_FIRM),
				};

				setProfileOptions(nextProfiles);
				setFirmOptions(nextFirms);
				setProfileDefaults(nextDefaults);
				setProfileOptionsError(null);
				setDraft((prev) =>
					syncDraftToProfileCatalog(
						prev,
						nextProfiles,
						nextFirms,
						nextDefaults,
					),
				);
			} catch (error) {
				if (!active) return;
				const message =
					error instanceof Error
						? error.message
						: "Failed to load sender profiles.";
				setProfileOptionsError(message);
			}
		};

		void loadProfileOptions();
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!preferredProjectId) {
			return;
		}
		const selectedProject = projectOptions.find(
			(project) => project.id === preferredProjectId,
		);
		if (!selectedProject || draft.selectedProjectId === selectedProject.id) {
			return;
		}
		setDraft((prev) => ({
			...prev,
			selectedProjectId: selectedProject.id,
			projectName: selectedProject.name,
			description: safeTrim(selectedProject.description),
			standardDocuments:
				prev.standardDocumentSource === "project_metadata"
					? []
					: prev.standardDocuments,
		}));
		setProjectMetadataRows([]);
		setProjectMetadataWarnings([]);
		setProjectMetadataError(null);
		setProjectMetadataLoadedAt(null);
	}, [draft.selectedProjectId, preferredProjectId, projectOptions]);

	useEffect(() => {
		if (!preferredProjectId || !preferredIssueSetId) {
			setPreferredIssueSet(null);
			return;
		}

		let active = true;
		const loadIssueSet = async () => {
			const result = await projectIssueSetService.fetchIssueSet(
				preferredProjectId,
				preferredIssueSetId,
			);
			if (active) {
				setPreferredIssueSet(result.data);
			}
		};

		void loadIssueSet();
		return () => {
			active = false;
		};
	}, [preferredIssueSetId, preferredProjectId]);

	useEffect(() => {
		if (!preferredIssueSet) {
			return;
		}

		setDraft((prev) => ({
			...prev,
			selectedProjectId: preferredIssueSet.projectId,
			transmittalNumber:
				safeTrim(prev.transmittalNumber) ||
				(preferredIssueSet.transmittalNumber ?? ""),
			description:
				safeTrim(prev.description) ||
				preferredIssueSet.summary ||
				preferredIssueSet.name,
		}));
	}, [preferredIssueSet]);

	useEffect(() => {
		let active = true;

		const loadProjects = async () => {
			try {
				const {
					data: { user },
					error: authError,
				} = await supabase.auth.getUser();
				if (authError || !user) {
					if (active) {
						setProjectOptions([]);
					}
					return;
				}

				const { data, error } = await supabase
					.from("projects")
					.select("id, name, description, watchdog_root_path")
					.eq("user_id", user.id)
					.order("created_at", { ascending: false });

				if (error) {
					throw error;
				}

				if (!active) return;
				setProjectOptions(
					(
						(data ?? []) as Array<{
							id: string;
							name: string;
							description: string;
							watchdog_root_path: string | null;
						}>
					).map((project) => ({
						id: project.id,
						name: project.name,
						description: project.description,
						watchdogRootPath: project.watchdog_root_path,
					})),
				);
			} catch (error) {
				if (!active) return;
				logger.error(
					"Failed to load transmittal project options",
					"TransmittalBuilder",
					error,
				);
			}
		};

		void loadProjects();
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		setDraft((prev) =>
			syncDraftToProfileCatalog(
				prev,
				profileOptions,
				firmOptions,
				profileDefaults,
			),
		);
	}, [profileOptions, firmOptions, profileDefaults]);

	useEffect(() => {
		if (
			draft.transmittalType !== "standard" ||
			draft.standardDocumentSource !== "project_metadata"
		) {
			return;
		}

		setPdfAnalysisLoading(false);
		setPdfAnalysisError(null);
		setPdfAnalysisWarnings(projectMetadataWarnings);
		setDraft((prev) => ({
			...prev,
			standardDocuments: buildProjectMetadataDocuments(
				files.pdfs,
				projectMetadataRows,
				prev.standardDocuments,
			),
		}));
	}, [
		draft.standardDocumentSource,
		draft.transmittalType,
		files.pdfs,
		projectMetadataRows,
		projectMetadataWarnings,
	]);

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
		const profile = getProfileById(profileOptions, value);
		if (!profile) return;
		setDraft((prev) => ({
			...prev,
			peName: profile.id,
			fromName: profile.name,
			fromTitle: profile.title,
			fromEmail: profile.email,
			fromPhone: profile.phone,
		}));
	};

	const handleTemplateFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, template: selected[0] ?? null }));
	};

	const handleIndexFiles = (selected: File[]) => {
		setFiles((prev) => ({ ...prev, index: selected[0] ?? null }));
	};

	const handleAcadeReportFiles = useCallback((selected: File[]) => {
		setFiles((prev) => ({
			...prev,
			acadeReport: selected[0] ?? null,
		}));
		setProjectMetadataError(null);
		setProjectMetadataWarnings([]);
		setProjectMetadataLoadedAt(null);
	}, []);

	const analyzePdfFiles = useCallback(async (selected: File[]) => {
		const analysisRunId = pdfAnalysisRunIdRef.current + 1;
		pdfAnalysisRunIdRef.current = analysisRunId;

		if (selected.length === 0) {
			setPdfAnalysisLoading(false);
			setPdfAnalysisError(null);
			setPdfAnalysisWarnings([]);
			setDraft((prev) => ({ ...prev, standardDocuments: [] }));
			return;
		}

		setPdfAnalysisLoading(true);
		setPdfAnalysisError(null);
		setPdfAnalysisWarnings([]);

		if (!transmittalService.hasApiKey()) {
			setDraft((prev) => ({
				...prev,
				standardDocuments: buildStandardDocuments(selected, []),
			}));
			setPdfAnalysisLoading(false);
			setPdfAnalysisError(
				"PDF analysis is unavailable until the transmittal API key is configured. You can still review rows manually or upload an index.",
			);
			return;
		}

		try {
			const result = await transmittalService.analyzePdfs(selected);
			if (pdfAnalysisRunIdRef.current !== analysisRunId) return;
			setDraft((prev) => ({
				...prev,
				standardDocuments: buildStandardDocuments(
					selected,
					[],
					result.documents,
				),
			}));
			setPdfAnalysisWarnings(result.warnings);
			setPdfAnalysisError(null);
		} catch (error) {
			if (pdfAnalysisRunIdRef.current !== analysisRunId) return;
			setDraft((prev) => ({
				...prev,
				standardDocuments: buildStandardDocuments(selected, []),
			}));
			setPdfAnalysisWarnings([]);
			setPdfAnalysisError(
				error instanceof Error
					? error.message
					: "Unable to analyze the selected PDF documents.",
			);
		} finally {
			if (pdfAnalysisRunIdRef.current === analysisRunId) {
				setPdfAnalysisLoading(false);
			}
		}
	}, []);

	const handlePdfFiles = useCallback(
		(selected: File[]) => {
			setFiles((prev) => ({ ...prev, pdfs: selected }));
			if (draft.standardDocumentSource === "project_metadata") {
				setDraft((prev) => ({
					...prev,
					standardDocuments: buildProjectMetadataDocuments(
						selected,
						projectMetadataRows,
						prev.standardDocuments,
					),
				}));
				setPdfAnalysisLoading(false);
				setPdfAnalysisError(null);
				setPdfAnalysisWarnings(projectMetadataWarnings);
				return;
			}
			void analyzePdfFiles(selected);
		},
		[
			analyzePdfFiles,
			draft.standardDocumentSource,
			projectMetadataRows,
			projectMetadataWarnings,
		],
	);

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

	const handleStandardDocumentChange = useCallback(
		(
			id: string,
			field:
				| "drawingNumber"
				| "title"
				| "revision"
				| "accepted"
				| "overrideReason",
			value: string | boolean,
		) => {
			setDraft((prev) => ({
				...prev,
				standardDocuments: prev.standardDocuments.map((doc) => {
					if (doc.id !== id) return doc;
					const next = { ...doc };
					if (field === "accepted") {
						next.accepted = Boolean(value);
						return next;
					}
					if (field === "overrideReason") {
						next.overrideReason = String(value ?? "");
						if (next.overrideReason.trim()) {
							next.accepted = true;
							next.source = "manual_review";
						}
						return next;
					}
					next[field] = String(value ?? "");
					next.accepted = true;
					next.source = "manual_review";
					return next;
				}),
			}));
		},
		[],
	);

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

	const handleStandardDocumentSourceChange = useCallback(
		(value: StandardDocumentSourceMode) => {
			setDraft((prev) => ({
				...prev,
				standardDocumentSource: value,
				standardDocuments:
					value === "project_metadata"
						? buildProjectMetadataDocuments(
								files.pdfs,
								projectMetadataRows,
								prev.standardDocuments,
							)
						: prev.standardDocuments,
			}));
			setProjectMetadataError(null);
			if (value === "pdf_analysis" && files.pdfs.length > 0) {
				void analyzePdfFiles(files.pdfs);
			}
			if (value === "project_metadata") {
				setPdfAnalysisLoading(false);
				setPdfAnalysisError(null);
				setPdfAnalysisWarnings(projectMetadataWarnings);
			}
		},
		[analyzePdfFiles, files.pdfs, projectMetadataRows, projectMetadataWarnings],
	);

	const handleProjectSelectionChange = useCallback(
		(projectId: string) => {
			const selectedProject = projectOptions.find(
				(project) => project.id === projectId,
			);
			setDraft((prev) => {
				const nextProjectName =
					safeTrim(prev.projectName) || safeTrim(selectedProject?.name);
				const nextDescription =
					safeTrim(prev.description) || safeTrim(selectedProject?.description);
				return {
					...prev,
					selectedProjectId: projectId,
					projectName: nextProjectName || prev.projectName,
					description: nextDescription || prev.description,
					standardDocuments:
						prev.standardDocumentSource === "project_metadata"
							? []
							: prev.standardDocuments,
				};
			});
			setProjectMetadataRows([]);
			setProjectMetadataWarnings([]);
			setProjectMetadataError(null);
			setProjectMetadataLoadedAt(null);
		},
		[projectOptions],
	);

	const handleLoadProjectMetadata = useCallback(async () => {
		const selectedProject = projectOptions.find(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!selectedProject) {
			setProjectMetadataError(
				"Select a project before loading project metadata.",
			);
			return;
		}

		setProjectMetadataLoading(true);
		setProjectMetadataError(null);
		try {
			const result = await loadProjectDocumentMetadata(selectedProject, {
				reportFile: files.acadeReport,
			});
			setProjectMetadataRows(result.rows);
			setProjectMetadataWarnings(result.warnings);
			setProjectMetadataLoadedAt(new Date().toISOString());
			setDraft((prev) => ({
				...prev,
				selectedProjectId: selectedProject.id,
				projectName: safeTrim(prev.projectName) || selectedProject.name,
				projectNumber:
					safeTrim(prev.projectNumber) || safeTrim(result.profile.acadeLine4),
				description:
					safeTrim(prev.description) || safeTrim(selectedProject.description),
				standardDocuments:
					prev.standardDocumentSource === "project_metadata"
						? buildProjectMetadataDocuments(
								files.pdfs,
								result.rows,
								prev.standardDocuments,
							)
						: prev.standardDocuments,
			}));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load project metadata.";
			logger.error(
				"Failed to load project metadata for transmittal builder",
				"TransmittalBuilder",
				error,
			);
			setProjectMetadataError(message);
			setProjectMetadataRows([]);
			setProjectMetadataWarnings([]);
			setProjectMetadataLoadedAt(null);
		} finally {
			setProjectMetadataLoading(false);
		}
	}, [draft.selectedProjectId, files.acadeReport, files.pdfs, projectOptions]);

	const resetSession = () => {
		const next = buildDefaultDraft({
			profiles: profileOptions,
			firms: firmOptions,
			defaultProfileId: profileDefaults.profileId,
			defaultFirm: profileDefaults.firm,
		});
		setDraft(next);
		setFiles({
			template: null,
			index: null,
			acadeReport: null,
			pdfs: [],
			cid: [],
		});
		setOutputs([]);
		setSubmitAttempted(false);
		setLastSavedAt(null);
		setGenerationState({ state: "idle" });
		setPdfAnalysisLoading(false);
		setPdfAnalysisError(null);
		setPdfAnalysisWarnings([]);
		setProjectMetadataRows([]);
		setProjectMetadataLoading(false);
		setProjectMetadataError(null);
		setProjectMetadataWarnings([]);
		setProjectMetadataLoadedAt(null);
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
				message:
					"Missing API key. Set VITE_TRANSMITTAL_API_KEY (or VITE_API_KEY) in your env.",
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
			if (safeTrim(draft.selectedProjectId)) {
				const receiptResult =
					await projectTransmittalReceiptService.saveReceipt({
						projectId: draft.selectedProjectId,
						projectName: draft.projectName,
						projectNumber: draft.projectNumber,
						transmittalType: draft.transmittalType,
						transmittalNumber: draft.transmittalNumber,
						description: draft.description,
						date: draft.date,
						outputFormat,
						standardDocumentSource:
							draft.transmittalType === "standard"
								? draft.standardDocumentSource
								: null,
						projectMetadataLoadedAt,
						outputs: nextOutputs.map((output) => ({
							label: output.label,
							filename: output.filename,
							size: output.size,
							createdAt: new Date().toISOString(),
						})),
						documentCount:
							draft.transmittalType === "standard"
								? draft.standardDocuments.length
								: 0,
						reviewedDocumentCount:
							draft.transmittalType === "standard"
								? draft.standardDocuments.filter(
										(doc) => doc.accepted && doc.needsReview,
									).length
								: 0,
						pendingReviewCount:
							draft.transmittalType === "standard"
								? draft.standardDocuments.filter(
										(doc) => doc.needsReview && !doc.accepted,
									).length
								: 0,
						cidDocumentCount:
							draft.transmittalType === "cid" ? draft.cidDocuments.length : 0,
						contactCount: completeContacts.length,
						fileSummary,
						optionSummary,
						generatedMessage: "Transmittal generated successfully.",
					});
				if (receiptResult.error) {
					logger.warn(
						"Saved transmittal output, but failed to persist the project receipt.",
						"TransmittalBuilder",
						{
							projectId: draft.selectedProjectId,
							error: receiptResult.error.message,
						},
					);
				}
			}
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
			const reviewedCount = draft.standardDocuments.filter(
				(doc) => doc.needsReview && doc.accepted,
			).length;
			const pendingCount = draft.standardDocuments.filter(
				(doc) => doc.needsReview && !doc.accepted,
			).length;
			return {
				template: files.template?.name || "Not selected",
				index: files.index?.name
					? files.index.name
					: draft.standardDocuments.length > 0
						? draft.standardDocumentSource === "project_metadata"
							? `Auto-generated from ${draft.standardDocuments.length} project row(s)`
							: `Auto-generated from ${draft.standardDocuments.length} PDF row(s)`
						: "Not selected",
				documents:
					pendingCount > 0
						? `${files.pdfs.length} PDFs (${pendingCount} review pending)`
						: reviewedCount > 0
							? `${files.pdfs.length} PDFs (${reviewedCount} reviewed)`
							: `${files.pdfs.length} PDFs`,
				report:
					files.acadeReport?.name ||
					(draft.standardDocumentSource === "project_metadata"
						? "No ACADE report"
						: "—"),
			};
		}
		return {
			template: files.template?.name || "Not selected",
			index: "—",
			documents: `${files.cid.length} CID files`,
			report: "—",
		};
	}, [
		draft.standardDocumentSource,
		draft.standardDocuments,
		draft.transmittalType,
		files,
	]);

	return {
		draft,
		files,
		preferredIssueSet,
		profileOptions,
		firmOptions,
		profileOptionsError,
		templateLoading,
		templateError,
		pdfAnalysisLoading,
		pdfAnalysisError,
		pdfAnalysisWarnings,
		projectOptions,
		projectMetadataLoading,
		projectMetadataError,
		projectMetadataWarnings,
		projectMetadataLoadedAt,
		outputFormat,
		generationState,
		outputs,
		submitAttempted,
		lastSavedAt,
		validation,
		completeContacts,
		optionSummary,
		fileSummary,
		setOutputFormat,
		updateDraft,
		handlePeChange,
		handleTemplateFiles,
		handleIndexFiles,
		handleAcadeReportFiles,
		handlePdfFiles,
		handleStandardDocumentSourceChange,
		handleProjectSelectionChange,
		handleLoadProjectMetadata,
		analyzePdfFiles: () => analyzePdfFiles(files.pdfs),
		handleCidFiles,
		handleScanCid,
		handleStandardDocumentChange,
		handleContactChange,
		addContact,
		removeContact,
		updateCidDocument,
		removeCidDocument,
		handleOptionToggle,
		resetSession,
		handleGenerate,
		handleUseExampleTemplate,
		isInvalid,
	};
}
