import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { logger } from "@/lib/logger";
import { logActivity } from "@/services/activityService";
import {
	loadProjectDocumentMetadata,
	type ProjectDocumentMetadataProjectOption,
	type ProjectDocumentMetadataRow,
} from "@/services/projectDocumentMetadataService";
import {
	projectDeliverableRegisterService,
	type ProjectDeliverableRegisterRow,
} from "@/services/projectDeliverableRegisterService";
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
	buildRegisterBackedDocuments,
	buildProjectMetadataDocuments,
	buildStandardDocuments,
	type Contact,
	createProjectSenderId,
	createId,
	type DraftState,
	type FileState,
	type GenerationState,
	getProfileById,
	isProjectSenderId,
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
	const [packageRegisterRows, setPackageRegisterRows] = useState<
		ProjectDeliverableRegisterRow[]
	>([]);
	const [packageRegisterSnapshotId, setPackageRegisterSnapshotId] = useState<
		string | null
	>(null);
	const [catalogProfileOptions, setCatalogProfileOptions] =
		useState<PeProfile[]>(PE_PROFILES);
	const [catalogFirmOptions, setCatalogFirmOptions] =
		useState<string[]>(FIRM_NUMBERS);
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
	const projectOptionsById = useMemo(
		() => new Map(projectOptions.map((project) => [project.id, project])),
		[projectOptions],
	);
	const selectedProjectOption = useMemo(
		() =>
			draft.selectedProjectId
				? projectOptionsById.get(draft.selectedProjectId) ?? null
				: null,
		[draft.selectedProjectId, projectOptionsById],
	);
	const selectedProjectSenderProfile = useMemo<PeProfile | null>(() => {
		const projectPeName = safeTrim(selectedProjectOption?.projectPeName);
		if (!selectedProjectOption || !projectPeName) {
			return null;
		}
		return {
			id: createProjectSenderId(selectedProjectOption.id),
			name: projectPeName,
			title: "Professional Engineer",
			email: "",
			phone: "",
		};
	}, [selectedProjectOption]);
	const senderProfileOptions = useMemo(() => {
		if (!selectedProjectSenderProfile) {
			return catalogProfileOptions;
		}
		return [
			selectedProjectSenderProfile,
			...catalogProfileOptions.filter(
				(profile) => profile.name !== selectedProjectSenderProfile.name,
			),
		];
	}, [catalogProfileOptions, selectedProjectSenderProfile]);
	const availableFirmOptions = useMemo(() => {
		const nextOptions = [...catalogFirmOptions];
		const projectFirm = safeTrim(selectedProjectOption?.firmNumber);
		if (projectFirm && !nextOptions.includes(projectFirm)) {
			nextOptions.unshift(projectFirm);
		}
		return nextOptions;
	}, [catalogFirmOptions, selectedProjectOption]);
	const buildPackageScopedDocuments = useCallback(
		(
			pdfFiles: File[],
			metadataRows: ProjectDocumentMetadataRow[],
			current: DraftState["standardDocuments"],
			registerRows: ProjectDeliverableRegisterRow[] = packageRegisterRows,
		) =>
			registerRows.length > 0
				? buildRegisterBackedDocuments(
						registerRows,
						pdfFiles,
						metadataRows,
						current,
					)
				: buildProjectMetadataDocuments(pdfFiles, metadataRows, current),
		[packageRegisterRows],
	);

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

				setCatalogProfileOptions(nextProfiles);
				setCatalogFirmOptions(nextFirms);
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
		const selectedProject = projectOptionsById.get(preferredProjectId);
		if (!selectedProject || draft.selectedProjectId === selectedProject.id) {
			return;
		}
		startTransition(() => {
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
		});
	}, [draft.selectedProjectId, preferredProjectId, projectOptionsById]);

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
			setPackageRegisterRows([]);
			setPackageRegisterSnapshotId(null);
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
		if (!preferredIssueSet) {
			return;
		}
		const selectedProject =
			projectOptionsById.get(preferredIssueSet.projectId) ?? null;
		if (!selectedProject) {
			return;
		}

		let active = true;
		const hydrateIssueSetPackage = async () => {
			const packageWarnings: string[] = [];
			let nextRegisterRows: ProjectDeliverableRegisterRow[] = [];
			let nextRegisterSnapshotId = preferredIssueSet.registerSnapshotId ?? null;
			let nextPdfFiles: File[] = [];
			let nextMetadataRows: ProjectDocumentMetadataRow[] = [];
			let nextMetadataWarnings: string[] = [];
			let nextProjectMetadataLoadedAt: string | null = null;
			let nextProjectMetadataError: string | null = null;

			const registerResult =
				await projectDeliverableRegisterService.fetchSnapshot(
					preferredIssueSet.projectId,
				);
			if (!active) {
				return;
			}
			if (registerResult.data) {
				nextRegisterSnapshotId = registerResult.data.id;
				const selectedRowIds = new Set(preferredIssueSet.selectedRegisterRowIds);
				nextRegisterRows =
					selectedRowIds.size > 0
						? registerResult.data.rows.filter((row) => selectedRowIds.has(row.id))
						: [];
			} else if (registerResult.error) {
				packageWarnings.push(registerResult.error.message);
			}

			if (preferredIssueSet.selectedPdfFileIds.length > 0) {
				const projectFilesResult =
					await projectDeliverableRegisterService.fetchProjectFilesByIds({
						projectId: preferredIssueSet.projectId,
						fileIds: preferredIssueSet.selectedPdfFileIds,
					});
				if (!active) {
					return;
				}
				if (projectFilesResult.error) {
					packageWarnings.push(projectFilesResult.error.message);
				} else if (projectFilesResult.data.length > 0) {
					const materializedPdfResult =
						await projectDeliverableRegisterService.materializeProjectPdfFiles(
							projectFilesResult.data,
						);
					if (!active) {
						return;
					}
					if (materializedPdfResult.error) {
						packageWarnings.push(materializedPdfResult.error.message);
					} else {
						nextPdfFiles = materializedPdfResult.data;
					}
				}
			}

			try {
				const metadataResult = await loadProjectDocumentMetadata(selectedProject, {
					reportFile: files.acadeReport,
				});
				if (!active) {
					return;
				}
				nextMetadataRows = metadataResult.rows;
				nextMetadataWarnings = metadataResult.warnings;
				nextProjectMetadataLoadedAt = new Date().toISOString();
			} catch (error) {
				if (!active) {
					return;
				}
				nextProjectMetadataError =
					error instanceof Error
						? error.message
						: "Failed to load project metadata.";
				logger.warn(
					"Unable to hydrate issue-set package metadata for transmittal builder.",
					"TransmittalBuilder",
					error,
				);
			}

			const mergedWarnings = [...nextMetadataWarnings];
			for (const warning of packageWarnings) {
				if (!mergedWarnings.includes(warning)) {
					mergedWarnings.push(warning);
				}
			}

			startTransition(() => {
				setPackageRegisterRows(nextRegisterRows);
				setPackageRegisterSnapshotId(nextRegisterSnapshotId);
				setFiles((prev) => ({
					...prev,
					pdfs: nextPdfFiles,
				}));
				setProjectMetadataRows(nextMetadataRows);
				setProjectMetadataWarnings(mergedWarnings);
				setProjectMetadataError(nextProjectMetadataError);
				setProjectMetadataLoadedAt(nextProjectMetadataLoadedAt);
				setDraft((prev) => ({
					...prev,
					transmittalType: "standard",
					standardDocumentSource: "project_metadata",
					selectedProjectId: preferredIssueSet.projectId,
					projectName:
						safeTrim(prev.projectName) || safeTrim(selectedProject.name),
					projectNumber: safeTrim(prev.projectNumber),
					description:
						safeTrim(prev.description) ||
						preferredIssueSet.summary ||
						preferredIssueSet.name,
					standardDocuments: buildPackageScopedDocuments(
						nextPdfFiles,
						nextMetadataRows,
						prev.standardDocuments,
						nextRegisterRows,
					),
				}));
			});
		};

		void hydrateIssueSetPackage();
		return () => {
			active = false;
		};
	}, [
		buildPackageScopedDocuments,
		files.acadeReport,
		preferredIssueSet,
		projectOptionsById,
	]);

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
					.select(
						"id, name, description, watchdog_root_path, pdf_package_root_path, pe_name, firm_number",
					)
					.eq("user_id", user.id)
					.order("created_at", { ascending: false });

				if (error) {
					throw error;
				}

				if (!active) return;
				startTransition(() => {
					setProjectOptions(
						(
							(data ?? []) as Array<{
								id: string;
								name: string;
								description: string;
								pe_name: string;
								firm_number: string;
								watchdog_root_path: string | null;
								pdf_package_root_path: string | null;
							}>
						).map((project) => ({
							id: project.id,
							name: project.name,
							description: project.description,
							projectPeName: project.pe_name,
							firmNumber: project.firm_number,
							watchdogRootPath: project.watchdog_root_path,
							pdfPackageRootPath: project.pdf_package_root_path,
						})),
					);
				});
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
				catalogProfileOptions,
				catalogFirmOptions,
				profileDefaults,
			),
		);
	}, [catalogFirmOptions, catalogProfileOptions, profileDefaults]);

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
			standardDocuments: buildPackageScopedDocuments(
				files.pdfs,
				projectMetadataRows,
				prev.standardDocuments,
			),
		}));
	}, [
		buildPackageScopedDocuments,
		draft.standardDocumentSource,
		draft.transmittalType,
		files.pdfs,
		packageRegisterRows,
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
		const profile = getProfileById(senderProfileOptions, value);
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
					standardDocuments: buildPackageScopedDocuments(
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
			buildPackageScopedDocuments,
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
						? buildPackageScopedDocuments(
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
		[
			analyzePdfFiles,
			buildPackageScopedDocuments,
			files.pdfs,
			projectMetadataRows,
			projectMetadataWarnings,
		],
	);

	const handleProjectSelectionChange = useCallback(
		(projectId: string) => {
			const selectedProject = projectOptionsById.get(projectId) ?? null;
			const previousProject = draft.selectedProjectId
				? projectOptionsById.get(draft.selectedProjectId) ?? null
				: null;
			const nextProjectSender = selectedProject?.projectPeName
				? {
						id: createProjectSenderId(selectedProject.id),
						name: safeTrim(selectedProject.projectPeName),
						title: "Professional Engineer",
						email: "",
						phone: "",
					}
				: null;
			const previousProjectSenderId = previousProject
				? createProjectSenderId(previousProject.id)
				: "";
			const fallbackProfileId =
				resolveProfileId(catalogProfileOptions, profileDefaults.profileId) ||
				catalogProfileOptions[0]?.id ||
				"";
			const fallbackProfile = getProfileById(
				catalogProfileOptions,
				fallbackProfileId,
			);

			startTransition(() => {
				if (
					!preferredIssueSet ||
					projectId !== preferredIssueSet.projectId
				) {
					setPackageRegisterRows([]);
					setPackageRegisterSnapshotId(null);
				}
				setDraft((prev) => {
					const nextProjectName =
						safeTrim(prev.projectName) || safeTrim(selectedProject?.name);
					const nextDescription =
						safeTrim(prev.description) || safeTrim(selectedProject?.description);
					const nextDraft: DraftState = {
						...prev,
						selectedProjectId: projectId,
						projectName: nextProjectName || prev.projectName,
						description: nextDescription || prev.description,
						standardDocuments:
							prev.standardDocumentSource === "project_metadata"
								? []
								: prev.standardDocuments,
					};

					const shouldAdoptProjectSender =
						Boolean(nextProjectSender) &&
						(
							isProjectSenderId(prev.peName) ||
							!safeTrim(prev.peName) ||
							safeTrim(prev.peName) === fallbackProfileId
						);

					if (shouldAdoptProjectSender && nextProjectSender) {
						nextDraft.peName = nextProjectSender.id;
						nextDraft.fromName = nextProjectSender.name;
						if (
							!safeTrim(prev.fromTitle) ||
							safeTrim(prev.fromTitle) === "Professional Engineer"
						) {
							nextDraft.fromTitle = nextProjectSender.title;
						}
					} else if (
						isProjectSenderId(prev.peName) &&
						prev.peName === previousProjectSenderId &&
						!nextProjectSender &&
						fallbackProfile
					) {
						nextDraft.peName = fallbackProfile.id;
						nextDraft.fromName = fallbackProfile.name;
						nextDraft.fromTitle = fallbackProfile.title;
						nextDraft.fromEmail = fallbackProfile.email;
						nextDraft.fromPhone = fallbackProfile.phone;
					}

					const previousProjectFirm = safeTrim(previousProject?.firmNumber);
					const nextProjectFirm = safeTrim(selectedProject?.firmNumber);
					const shouldAdoptProjectFirm =
						Boolean(nextProjectFirm) &&
						(
							!safeTrim(prev.firmNumber) ||
							safeTrim(prev.firmNumber) === previousProjectFirm ||
							safeTrim(prev.firmNumber) === profileDefaults.firm
						);

					if (shouldAdoptProjectFirm && nextProjectFirm) {
						nextDraft.firmNumber = nextProjectFirm;
					}

					return nextDraft;
				});
				setProjectMetadataRows([]);
				setProjectMetadataWarnings([]);
				setProjectMetadataError(null);
				setProjectMetadataLoadedAt(null);
			});
		},
		[
			catalogProfileOptions,
			draft.selectedProjectId,
			preferredIssueSet,
			profileDefaults.firm,
			profileDefaults.profileId,
			projectOptionsById,
		],
	);

	const handleLoadProjectMetadata = useCallback(async () => {
		const selectedProject = projectOptionsById.get(draft.selectedProjectId);
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
			startTransition(() => {
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
							? buildPackageScopedDocuments(
									files.pdfs,
									result.rows,
									prev.standardDocuments,
								)
							: prev.standardDocuments,
				}));
			});
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
			startTransition(() => {
				setProjectMetadataError(message);
				setProjectMetadataRows([]);
				setProjectMetadataWarnings([]);
				setProjectMetadataLoadedAt(null);
			});
		} finally {
			setProjectMetadataLoading(false);
		}
	}, [
		buildPackageScopedDocuments,
		draft.selectedProjectId,
		files.acadeReport,
		files.pdfs,
		projectOptionsById,
	]);

	const resetSession = () => {
		const next = buildDefaultDraft({
			profiles: catalogProfileOptions,
			firms: catalogFirmOptions,
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
		setPackageRegisterRows([]);
		setPackageRegisterSnapshotId(null);
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
						? packageRegisterRows.length > 0
							? `Auto-generated from ${packageRegisterRows.length} package row(s)`
							: draft.standardDocumentSource === "project_metadata"
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
		packageRegisterRows.length,
	]);

	return {
		draft,
		files,
		preferredIssueSet,
		packageRegisterSnapshotId,
		profileOptions: senderProfileOptions,
		firmOptions: availableFirmOptions,
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
