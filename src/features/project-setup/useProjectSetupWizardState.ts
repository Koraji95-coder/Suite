import {
	CheckCircle2,
	FileSearch,
	FolderTree,
	Settings2,
} from "lucide-react";
import { format } from "date-fns";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	PROJECT_CATEGORIES,
	type ProjectCategory,
	type ProjectFormData,
} from "@/features/project-core";
import {
	EMPTY_PROJECT_SETUP_ROOT_CHECK,
	DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME,
	createProjectSetupDraftId,
	deriveProjectSetupAcadeProjectFilePath,
	getMaxAccessibleProjectSetupStepIndex,
	hasCompleteProjectSetupBasics,
	hasCompleteProjectSetupTracking,
	hasMeaningfulProjectSetupDefaults,
	hasValidatedProjectSetupRoot,
	loadProjectSetupProfile,
	parseProjectSetupDeadlineDate,
	type ProjectSetupRootCheckState,
	validateProjectSetupRoot,
} from "./wizard";

export type WizardStepId = "basics" | "tracking" | "defaults" | "review";

export const PROJECT_SETUP_WIZARD_STEPS: Array<{
	id: WizardStepId;
	label: string;
	description: string;
	icon: typeof Settings2;
}> = [
	{
		id: "basics",
		label: "Basics",
		description:
			"Name the project, set its lane, and define the deadline window.",
		icon: Settings2,
	},
	{
		id: "tracking",
		label: "Tracking",
		description:
			"Choose the root Watchdog and drawing-control tools will use.",
		icon: FolderTree,
	},
	{
		id: "defaults",
		label: "Defaults",
		description:
			"Set title block defaults so scans and issue prep start from the right profile.",
		icon: FileSearch,
	},
	{
		id: "review",
		label: "Review",
		description:
			"Confirm the setup package before creating or updating the project.",
		icon: CheckCircle2,
	},
];

export function updateProjectForm(
	setFormData: Dispatch<SetStateAction<ProjectFormData>>,
	patch: Partial<ProjectFormData>,
) {
	setFormData((current) => ({
		...current,
		...patch,
	}));
}

interface UseProjectSetupWizardStateArgs {
	isOpen: boolean;
	projectId: string | null;
	formData: ProjectFormData;
	setFormData: Dispatch<SetStateAction<ProjectFormData>>;
	isEditing: boolean;
}

interface ProjectSetupWizardStepDefinition {
	id: WizardStepId;
	label: string;
	description: string;
	icon: typeof Settings2;
}

export function useProjectSetupWizardState({
	isOpen,
	projectId,
	formData,
	setFormData,
	isEditing,
}: UseProjectSetupWizardStateArgs) {
	const [deadlineOpen, setDeadlineOpen] = useState(false);
	const [stepIndex, setStepIndex] = useState(0);
	const [rootCheck, setRootCheck] = useState<ProjectSetupRootCheckState>(
		EMPTY_PROJECT_SETUP_ROOT_CHECK,
	);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileMessage, setProfileMessage] = useState<string | null>(null);
	const [draftProjectId, setDraftProjectId] = useState(createProjectSetupDraftId);
	const autoDerivedAcadePathRef = useRef("");

	const steps = PROJECT_SETUP_WIZARD_STEPS as ProjectSetupWizardStepDefinition[];
	const safeCategory = PROJECT_CATEGORIES.some(
		(category: ProjectCategory) => category.key === formData.category,
	)
		? formData.category
		: "Other";
	const deadlineDate = parseProjectSetupDeadlineDate(formData.deadline);
	const activeStep = steps[stepIndex];
	const validationProjectId = projectId ?? draftProjectId;
	const normalizedRootPath = formData.watchdogRootPath.trim();
	const derivedAcadeProjectFilePath = useMemo(
		() =>
			deriveProjectSetupAcadeProjectFilePath(
				formData.name,
				normalizedRootPath,
			),
		[formData.name, normalizedRootPath],
	);
	const titleBlockDefaultsConfigured =
		hasMeaningfulProjectSetupDefaults(formData);
	const rootValidationReady = useMemo(
		() => hasValidatedProjectSetupRoot(rootCheck, normalizedRootPath),
		[normalizedRootPath, rootCheck],
	);
	const basicsReady = useMemo(
		() => hasCompleteProjectSetupBasics(formData, deadlineDate),
		[
			deadlineDate,
			formData.category,
			formData.description,
			formData.name,
			formData.priority,
			formData.projectFirmNumber,
			formData.projectPeName,
			formData.status,
		],
	);
	const trackingReady = useMemo(
		() =>
			hasCompleteProjectSetupTracking({
				projectRootPath: normalizedRootPath,
				pdfPackageRootPath: formData.pdfPackageRootPath,
				rootValidationReady,
			}),
		[formData.pdfPackageRootPath, normalizedRootPath, rootValidationReady],
	);
	const maxAccessibleStepIndex = useMemo(
		() =>
			getMaxAccessibleProjectSetupStepIndex({
				basicsReady,
				trackingReady,
				defaultsReady: titleBlockDefaultsConfigured,
			}),
		[basicsReady, titleBlockDefaultsConfigured, trackingReady],
	);
	const reviewBlockers = useMemo(() => {
		const blockers: string[] = [];
		if (!basicsReady) {
			blockers.push(
				"Complete all Basics fields before continuing: name, description, deadline, PE, and firm number.",
			);
		}
		if (!normalizedRootPath) {
			blockers.push(
				"Choose a project root so Watchdog and drawing tools can map the work.",
			);
		}
		if (!formData.pdfPackageRootPath.trim()) {
			blockers.push(
				"Choose the PDF package root so issued-output pairing has a default source.",
			);
		}
		if (normalizedRootPath && !rootValidationReady) {
			blockers.push(
				"Run root validation so Suite can confirm the drawing set and ACADE support files for this project root.",
			);
		}
		if (rootCheck.status === "error" && rootCheck.message) {
			blockers.push(rootCheck.message);
		}
		if (!titleBlockDefaultsConfigured) {
			blockers.push(
				"Complete all Defaults fields before review: block name, .wdp target, ACADE lines, and signer names.",
			);
		}
		return blockers;
	}, [
		basicsReady,
		formData.pdfPackageRootPath,
		normalizedRootPath,
		rootCheck.message,
		rootCheck.status,
		rootValidationReady,
		titleBlockDefaultsConfigured,
	]);

	useEffect(() => {
		if (!isOpen) {
			setDeadlineOpen(false);
			autoDerivedAcadePathRef.current = "";
			return;
		}
		setStepIndex(0);
		setRootCheck(EMPTY_PROJECT_SETUP_ROOT_CHECK);
		if (!projectId) {
			setDraftProjectId(createProjectSetupDraftId());
			setFormData((current) => ({
				...current,
				titleBlockBlockName:
					current.titleBlockBlockName ||
					DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME,
			}));
		}
	}, [isOpen, projectId, setFormData]);

	useEffect(() => {
		if (stepIndex <= maxAccessibleStepIndex) {
			return;
		}
		setStepIndex(maxAccessibleStepIndex);
	}, [maxAccessibleStepIndex, stepIndex]);

	useEffect(() => {
		if (!normalizedRootPath) {
			if (rootCheck.status !== "idle") {
				setRootCheck(EMPTY_PROJECT_SETUP_ROOT_CHECK);
			}
			return;
		}
		if (rootCheck.rootPath && rootCheck.rootPath !== normalizedRootPath) {
			setRootCheck(EMPTY_PROJECT_SETUP_ROOT_CHECK);
		}
	}, [normalizedRootPath, rootCheck.rootPath, rootCheck.status]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		const currentPath = formData.titleBlockAcadeProjectFilePath.trim();
		const previousAutoDerivedPath = autoDerivedAcadePathRef.current.trim();
		const nextDerivedPath = derivedAcadeProjectFilePath.trim();
		const shouldAutoUpdate =
			!currentPath ||
			(Boolean(previousAutoDerivedPath) &&
				currentPath === previousAutoDerivedPath);
		if (!shouldAutoUpdate) {
			return;
		}
		autoDerivedAcadePathRef.current = nextDerivedPath;
		if (currentPath === nextDerivedPath) {
			return;
		}
		updateProjectForm(setFormData, {
			titleBlockAcadeProjectFilePath: nextDerivedPath,
		});
	}, [
		derivedAcadeProjectFilePath,
		formData.titleBlockAcadeProjectFilePath,
		isOpen,
		setFormData,
	]);

	useEffect(() => {
		let cancelled = false;
		if (!isOpen || !projectId) {
			if (!projectId) {
				setProfileMessage(null);
			}
			return () => {
				cancelled = true;
			};
		}

		setProfileLoading(true);
		setProfileMessage(null);
		void loadProjectSetupProfile({
			projectId,
			projectRootPath: normalizedRootPath || null,
		})
			.then((result) => {
				if (cancelled) return;
				setProfileMessage(result.message);
				setFormData((current) => ({
					...current,
					titleBlockBlockName:
						result.data.block_name ||
						current.titleBlockBlockName ||
						DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME,
					titleBlockAcadeProjectFilePath:
						result.data.acade_project_file_path ||
						current.titleBlockAcadeProjectFilePath,
					titleBlockAcadeLine1:
						result.data.acade_line1 || current.titleBlockAcadeLine1,
					titleBlockAcadeLine2:
						result.data.acade_line2 || current.titleBlockAcadeLine2,
					titleBlockAcadeLine4:
						result.data.acade_line4 || current.titleBlockAcadeLine4,
					titleBlockDrawnBy:
						result.data.signer_drawn_by || current.titleBlockDrawnBy,
					titleBlockCheckedBy:
						result.data.signer_checked_by || current.titleBlockCheckedBy,
					titleBlockEngineer:
						result.data.signer_engineer || current.titleBlockEngineer,
				}));
			})
			.catch((error) => {
				if (cancelled) return;
				setProfileMessage(
					error instanceof Error
						? error.message
						: "Unable to load title block defaults.",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setProfileLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [isOpen, normalizedRootPath, projectId, setFormData]);

	const canAdvance =
		activeStep.id === "basics"
			? basicsReady
			: activeStep.id === "tracking"
				? trackingReady
				: activeStep.id === "defaults"
					? titleBlockDefaultsConfigured
					: true;
	const canSubmit = reviewBlockers.length === 0 && rootCheck.status !== "running";
	const reviewAcadeActionLabel = isEditing
		? "Save and Open in ACADE"
		: rootCheck.wdpState === "existing"
			? "Open Existing Project in ACADE"
			: "Create and Open in ACADE";
	const reviewSubmitLabel = isEditing ? "Save Changes Only" : "Save Setup Only";

	const runRootValidation = async () => {
		if (!normalizedRootPath) {
			setRootCheck({
				...EMPTY_PROJECT_SETUP_ROOT_CHECK,
				status: "error",
				message: "Choose a project root before running validation.",
			});
			return;
		}

		setRootCheck({
			...EMPTY_PROJECT_SETUP_ROOT_CHECK,
			status: "running",
			rootPath: normalizedRootPath,
			message:
				"Scanning the root for drawing metadata and title block signals...",
		});

		try {
			const validation = await validateProjectSetupRoot({
				projectId: validationProjectId,
				projectRootPath: normalizedRootPath,
				formData,
				autoDerivedAcadePath: autoDerivedAcadePathRef.current,
			});
			setRootCheck(validation.rootCheck);
			updateProjectForm(setFormData, validation.formPatch);
		} catch (error) {
			setRootCheck({
				...EMPTY_PROJECT_SETUP_ROOT_CHECK,
				status: "error",
				rootPath: normalizedRootPath,
				message:
					error instanceof Error
						? error.message
						: "Unable to validate the selected project root.",
			});
		}
	};

	const nextStep = () => {
		if (!canAdvance) return;
		setStepIndex((current) => Math.min(current + 1, maxAccessibleStepIndex));
	};

	const previousStep = () => {
		setStepIndex((current) => Math.max(current - 1, 0));
	};

	const setAcadeProjectFilePath = (value: string) => {
		autoDerivedAcadePathRef.current = "";
		updateProjectForm(setFormData, {
			titleBlockAcadeProjectFilePath: value,
		});
	};

	return {
		deadlineOpen,
		setDeadlineOpen,
		stepIndex,
		setStepIndex,
		rootCheck,
		profileLoading,
		profileMessage,
		safeCategory,
		deadlineDate,
		activeStep,
		steps,
		normalizedRootPath,
		titleBlockDefaultsConfigured,
		rootValidationReady,
		maxAccessibleStepIndex,
		reviewBlockers,
		canAdvance,
		canSubmit,
		reviewAcadeActionLabel,
		reviewSubmitLabel,
		setAcadeProjectFilePath,
		runRootValidation,
		nextStep,
		previousStep,
		formatDeadline(date: Date) {
			return format(date, "PPP");
		},
	};
}
