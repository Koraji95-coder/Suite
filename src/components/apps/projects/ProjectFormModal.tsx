import { format } from "date-fns";
import {
	Calendar as CalendarIcon,
	CheckCircle2,
	FileSearch,
	FolderTree,
	Settings2,
} from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/apps/ui/Popover";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/utils";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	projectTitleBlockProfileService,
} from "@/services/projectTitleBlockProfileService";
import { Calendar } from "../calendar/Calendar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import {
	PROJECT_CATEGORIES,
	type Priority,
	type ProjectFormData,
	type ProjectStatus,
} from "./projectmanagertypes";
import { deriveAcadeProjectFilePath } from "./projectmanagerutils";

interface ProjectFormModalProps {
	isOpen: boolean;
	projectId: string | null;
	onClose: () => void;
	onSubmit: () => Promise<void> | void;
	onSubmitAndOpenAcade?: () => Promise<void> | void;
	formData: ProjectFormData;
	setFormData: Dispatch<SetStateAction<ProjectFormData>>;
	isEditing: boolean;
	onBrowseRootPath: () => Promise<void>;
	isBrowsingRootPath: boolean;
	onBrowsePdfRootPath: () => Promise<void>;
	isBrowsingPdfRootPath: boolean;
}

type WizardStepId = "basics" | "tracking" | "defaults" | "review";

interface RootCheckState {
	status: "idle" | "running" | "ready" | "warning" | "error";
	rootPath: string | null;
	drawingFiles: number;
	totalFiles: number;
	pdfFiles: number;
	warnings: string[];
	message: string | null;
}

const WIZARD_STEPS: Array<{
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
		description: "Choose the root Watchdog and drawing-control tools will use.",
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

const EMPTY_ROOT_CHECK: RootCheckState = {
	status: "idle",
	rootPath: null,
	drawingFiles: 0,
	totalFiles: 0,
	pdfFiles: 0,
	warnings: [],
	message: null,
};

function isLowSignalRootValidationWarning(warning: string) {
	const normalized = warning.trim().toLowerCase();
	return (
		normalized.includes("live dwg metadata is unavailable") ||
		normalized.includes("filename fallback") ||
		normalized.includes("named pipe") ||
		normalized.includes("autocad scan bridge unavailable")
	);
}

function summarizeRootValidationWarnings(warnings: string[]) {
	return warnings.filter((warning) => !isLowSignalRootValidationWarning(warning));
}

function parseDeadlineDate(value: string) {
	const source = String(value || "").trim();
	if (!source) return null;
	const normalized = source.includes("T") ? source : `${source}T12:00:00`;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createDraftProjectId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `project-setup-${crypto.randomUUID()}`;
	}
	return `project-setup-${Date.now()}`;
}

function hasMeaningfulTitleBlockDefaults(formData: ProjectFormData) {
	return Boolean(
		formData.titleBlockAcadeLine1.trim() ||
			formData.titleBlockAcadeLine2.trim() ||
			formData.titleBlockAcadeLine4.trim() ||
			formData.titleBlockDrawnBy.trim() ||
			formData.titleBlockCheckedBy.trim() ||
			formData.titleBlockEngineer.trim(),
	);
}

function updateProjectForm(
	setFormData: Dispatch<SetStateAction<ProjectFormData>>,
	patch: Partial<ProjectFormData>,
) {
	setFormData((current) => ({
		...current,
		...patch,
	}));
}

export function ProjectFormModal({
	isOpen,
	projectId,
	onClose,
	onSubmit,
	onSubmitAndOpenAcade,
	formData,
	setFormData,
	isEditing,
	onBrowseRootPath,
	isBrowsingRootPath,
	onBrowsePdfRootPath,
	isBrowsingPdfRootPath,
}: ProjectFormModalProps) {
	const [deadlineOpen, setDeadlineOpen] = useState(false);
	const [stepIndex, setStepIndex] = useState(0);
	const [rootCheck, setRootCheck] = useState<RootCheckState>(EMPTY_ROOT_CHECK);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileMessage, setProfileMessage] = useState<string | null>(null);
	const [draftProjectId, setDraftProjectId] = useState(createDraftProjectId);
	const autoDerivedAcadePathRef = useRef("");

	const safeCategory = PROJECT_CATEGORIES.some(
		(category) => category.key === formData.category,
	)
		? formData.category
		: "Other";
	const deadlineDate = parseDeadlineDate(formData.deadline);
	const activeStep = WIZARD_STEPS[stepIndex];
	const validationProjectId = projectId ?? draftProjectId;
	const normalizedRootPath = formData.watchdogRootPath.trim();
	const derivedAcadeProjectFilePath = useMemo(
		() => deriveAcadeProjectFilePath(formData.name, normalizedRootPath),
		[formData.name, normalizedRootPath],
	);
	const titleBlockDefaultsConfigured =
		hasMeaningfulTitleBlockDefaults(formData);
	const reviewBlockers = useMemo(() => {
		const blockers: string[] = [];
		if (!formData.name.trim()) {
			blockers.push("Add a project name.");
		}
		if (!normalizedRootPath) {
			blockers.push(
				"Choose a project root so Watchdog and drawing tools can map the work.",
			);
		}
		if (rootCheck.status === "error" && rootCheck.message) {
			blockers.push(rootCheck.message);
		}
		if (!titleBlockDefaultsConfigured) {
			blockers.push(
				"Title block defaults are still blank. Add at least one signer or ACADE line before you issue drawings.",
			);
		}
		return blockers;
	}, [
		formData.name,
		normalizedRootPath,
		rootCheck.message,
		rootCheck.status,
		titleBlockDefaultsConfigured,
	]);

	useEffect(() => {
		if (!isOpen) {
			setDeadlineOpen(false);
			autoDerivedAcadePathRef.current = "";
			return;
		}
		setStepIndex(0);
		setRootCheck(EMPTY_ROOT_CHECK);
		if (!projectId) {
			setDraftProjectId(createDraftProjectId());
			updateProjectForm(setFormData, {
				titleBlockBlockName:
					formData.titleBlockBlockName || DEFAULT_PROJECT_TITLE_BLOCK_NAME,
			});
		}
	}, [formData.titleBlockBlockName, isOpen, projectId, setFormData]);

	useEffect(() => {
		if (!normalizedRootPath) {
			if (rootCheck.status !== "idle") {
				setRootCheck(EMPTY_ROOT_CHECK);
			}
			return;
		}
		if (rootCheck.rootPath && rootCheck.rootPath !== normalizedRootPath) {
			setRootCheck(EMPTY_ROOT_CHECK);
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
		void projectTitleBlockProfileService
			.fetchProfile(projectId, {
				projectRootPath: normalizedRootPath || null,
			})
			.then((result) => {
				if (cancelled) return;
				setProfileMessage(result.error ? result.error.message : null);
				setFormData((current) => ({
					...current,
					titleBlockBlockName:
						result.data.block_name ||
						current.titleBlockBlockName ||
						DEFAULT_PROJECT_TITLE_BLOCK_NAME,
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
			? Boolean(formData.name.trim())
			: activeStep.id === "tracking"
				? Boolean(normalizedRootPath) || isEditing
				: true;
	const canSubmit =
		Boolean(formData.name.trim()) &&
		(Boolean(normalizedRootPath) || isEditing) &&
		rootCheck.status !== "running";

	const runRootValidation = async () => {
		if (!normalizedRootPath) {
			setRootCheck({
				...EMPTY_ROOT_CHECK,
				status: "error",
				message: "Choose a project root before running validation.",
			});
			return;
		}

		setRootCheck({
			...EMPTY_ROOT_CHECK,
			status: "running",
			rootPath: normalizedRootPath,
			message:
				"Scanning the root for drawing metadata and title block signals...",
		});

		try {
			const snapshot = await projectDocumentMetadataService.loadSnapshot({
				projectId: validationProjectId,
				projectRootPath: normalizedRootPath,
			});
			const followUpWarnings = summarizeRootValidationWarnings(
				snapshot.warnings,
			);
			const pdfFiles = snapshot.rows.filter(
				(row) => row.fileType.toLowerCase() === "pdf",
			).length;
			setRootCheck({
				status:
					snapshot.summary.drawingFiles === 0 || followUpWarnings.length > 0
						? "warning"
						: "ready",
				rootPath: normalizedRootPath,
				drawingFiles: snapshot.summary.drawingFiles,
				totalFiles: snapshot.summary.totalFiles,
				pdfFiles,
				warnings: followUpWarnings.slice(0, 3),
				message:
					snapshot.summary.drawingFiles > 0
						? `Root validated. Found ${snapshot.summary.drawingFiles} drawing${
								snapshot.summary.drawingFiles === 1 ? "" : "s"
						  }${pdfFiles > 0 ? ` and ${pdfFiles} PDF${pdfFiles === 1 ? "" : "s"}` : ""} for project setup.`
						: "Root validated, but no drawing files were found yet.",
			});
			setFormData((current) => ({
				...current,
				watchdogRootPath: snapshot.projectRootPath || current.watchdogRootPath,
				titleBlockBlockName:
					current.titleBlockBlockName || snapshot.profile.blockName,
				titleBlockAcadeLine1:
					current.titleBlockAcadeLine1 || snapshot.profile.acadeLine1,
				titleBlockAcadeLine2:
					current.titleBlockAcadeLine2 || snapshot.profile.acadeLine2,
				titleBlockAcadeLine4:
					current.titleBlockAcadeLine4 || snapshot.profile.acadeLine4,
				titleBlockDrawnBy:
					current.titleBlockDrawnBy || snapshot.profile.signerDrawnBy,
				titleBlockCheckedBy:
					current.titleBlockCheckedBy || snapshot.profile.signerCheckedBy,
				titleBlockEngineer:
					current.titleBlockEngineer || snapshot.profile.signerEngineer,
			}));
		} catch (error) {
			setRootCheck({
				...EMPTY_ROOT_CHECK,
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
		setStepIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
	};

	const previousStep = () => {
		setStepIndex((current) => Math.max(current - 1, 0));
	};

	const reviewSubmitLabel = isEditing ? "Save Changes Only" : "Save Setup Only";

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader className={styles.header}>
					<p className={styles.eyebrow}>Project setup</p>
					<DialogTitle className={styles.title}>
						{isEditing ? "Update Project Setup" : "Project Setup Wizard"}
					</DialogTitle>
					<DialogDescription className={styles.subcopy}>
						Guide the project through basics, tracking, defaults, and a final
						readiness check so Projects becomes the front door to the delivery
						workflow.
					</DialogDescription>
				</DialogHeader>

				<div className={styles.stepper} aria-label="Project setup steps">
					{WIZARD_STEPS.map((step, index) => {
						const Icon = step.icon;
						const isActive = index === stepIndex;
						const isComplete = index < stepIndex;
						return (
							<button
								key={step.id}
								type="button"
								className={cn(
									styles.stepButton,
									isActive && styles.stepButtonActive,
									isComplete && styles.stepButtonComplete,
								)}
								onClick={() => setStepIndex(index)}
							>
								<span className={styles.stepIconShell}>
									<Icon className={styles.stepIcon} aria-hidden="true" />
								</span>
								<span className={styles.stepCopy}>
									<span className={styles.stepLabel}>{step.label}</span>
									<span className={styles.stepDescription}>
										{step.description}
									</span>
								</span>
							</button>
						);
					})}
				</div>

				<div className={styles.fields}>
					{activeStep.id === "basics" ? (
						<>
							<div className={styles.sectionIntro}>
								<h3 className={styles.sectionTitle}>Project basics</h3>
								<p className={styles.sectionCopy}>
									Start with the identity and planning details that define the
									project lane.
								</p>
							</div>
							<div>
								<label className={styles.label} htmlFor="project-form-name">
									Project name
								</label>
								<input
									id="project-form-name"
									name="project_form_name"
									type="text"
									value={formData.name}
									onChange={(event) =>
										updateProjectForm(setFormData, { name: event.target.value })
									}
									className={styles.input}
									placeholder="Nanulak 180MW Substation"
								/>
							</div>
							<div>
								<label
									className={styles.label}
									htmlFor="project-form-description"
								>
									Description
								</label>
								<textarea
									id="project-form-description"
									name="project_form_description"
									value={formData.description}
									onChange={(event) =>
										updateProjectForm(setFormData, {
											description: event.target.value,
										})
									}
									className={styles.textarea}
									placeholder="Briefly describe the deliverable scope and review context."
								/>
							</div>
							<div className={styles.gridTwo}>
								<div>
									<label className={styles.label} htmlFor="project-form-pe">
										PE
									</label>
									<input
										id="project-form-pe"
										name="project_form_pe"
										type="text"
										value={formData.projectPeName}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												projectPeName: event.target.value,
											})
										}
										className={styles.input}
										placeholder="Engineer name"
									/>
								</div>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-firm-number"
									>
										Firm number
									</label>
									<input
										id="project-form-firm-number"
										name="project_form_firm_number"
										type="text"
										value={formData.projectFirmNumber}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												projectFirmNumber: event.target.value,
											})
										}
										className={styles.input}
										placeholder="TX - Firm #00000"
									/>
								</div>
							</div>
							<div className={styles.gridTwo}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-deadline"
									>
										Deadline
									</label>
									<Popover open={deadlineOpen} onOpenChange={setDeadlineOpen}>
										<PopoverTrigger asChild>
											<Button
												id="project-form-deadline"
												type="button"
												variant="outline"
												className={cn(
													styles.dateTrigger,
													!deadlineDate && styles.mutedText,
												)}
											>
												<span
													className={cn(
														styles.dateLabel,
														!deadlineDate && styles.mutedText,
													)}
												>
													{deadlineDate
														? format(deadlineDate, "PPP")
														: "Select deadline"}
												</span>
												<CalendarIcon
													className={styles.calendarIcon}
													aria-hidden="true"
												/>
											</Button>
										</PopoverTrigger>
										<PopoverContent
											className={styles.popoverContent}
											align="start"
										>
											<Calendar
												mode="single"
												selected={deadlineDate ?? undefined}
												defaultMonth={deadlineDate ?? new Date()}
												onSelect={(date) => {
													updateProjectForm(setFormData, {
														deadline: date ? format(date, "yyyy-MM-dd") : "",
													});
													setDeadlineOpen(false);
												}}
											/>
										</PopoverContent>
									</Popover>
								</div>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-priority"
									>
										Priority
									</label>
									<select
										id="project-form-priority"
										name="project_form_priority"
										value={formData.priority}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												priority: event.target.value as Priority,
											})
										}
										className={styles.select}
									>
										<option value="low">Low</option>
										<option value="medium">Medium</option>
										<option value="high">High</option>
										<option value="urgent">Urgent</option>
									</select>
								</div>
							</div>
							<div className={styles.gridTwo}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-category"
									>
										Category
									</label>
									<select
										id="project-form-category"
										name="project_form_category"
										value={safeCategory}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												category: event.target.value || "Other",
											})
										}
										className={styles.select}
									>
										{PROJECT_CATEGORIES.map((category) => (
											<option key={category.key} value={category.key}>
												{category.key}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className={styles.label} htmlFor="project-form-status">
										Status
									</label>
									<select
										id="project-form-status"
										name="project_form_status"
										value={formData.status}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												status: event.target.value as ProjectStatus,
											})
										}
										className={styles.select}
									>
										<option value="active">Active</option>
										<option value="on-hold">On Hold</option>
										<option value="archived">Archived</option>
									</select>
								</div>
							</div>
						</>
					) : null}

					{activeStep.id === "tracking" ? (
						<>
							<div className={styles.sectionIntro}>
								<h3 className={styles.sectionTitle}>Tracking root</h3>
								<p className={styles.sectionCopy}>
									Choose the folder that Watchdog, the drawing list, and title
									block tools should treat as the project home.
								</p>
							</div>
							<div>
								<label
									className={styles.label}
									htmlFor="project-form-watchdog-root"
								>
									Project root folder
								</label>
								<div className={styles.rootPathRow}>
									<input
										id="project-form-watchdog-root"
										name="project_form_watchdog_root"
										type="text"
										value={formData.watchdogRootPath}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												watchdogRootPath: event.target.value,
											})
										}
										className={styles.input}
										placeholder="G:\\Shared drives\\Root 3 Power\\Projects\\Nanulak"
									/>
									<button
										type="button"
										onClick={() => void onBrowseRootPath()}
										className={styles.browseButton}
										disabled={isBrowsingRootPath}
									>
										{isBrowsingRootPath ? "Browsing..." : "Browse"}
									</button>
								</div>
							</div>
							<div>
								<label
									className={styles.label}
									htmlFor="project-form-pdf-package-root"
								>
									PDF package root
								</label>
								<div className={styles.rootPathRow}>
									<input
										id="project-form-pdf-package-root"
										name="project_form_pdf_package_root"
										type="text"
										value={formData.pdfPackageRootPath}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												pdfPackageRootPath: event.target.value,
											})
										}
										className={styles.input}
										placeholder="G:\\Shared drives\\Root 3 Power\\Projects\\Nanulak\\Issued PDFs"
									/>
									<button
										type="button"
										onClick={() => void onBrowsePdfRootPath()}
										className={styles.browseButton}
										disabled={isBrowsingPdfRootPath}
									>
										{isBrowsingPdfRootPath ? "Browsing..." : "Browse"}
									</button>
								</div>
								<p className={styles.inlineHint}>
									Use the package PDF root as the default issued-output source
									for workbook pairing and transmittal package prep.
								</p>
							</div>

							<div className={styles.infoCard}>
								<div className={styles.infoHeader}>
									<h4 className={styles.infoTitle}>Validation preview</h4>
									<button
										type="button"
										className={styles.secondaryButton}
										onClick={() => void runRootValidation()}
										disabled={rootCheck.status === "running"}
									>
										{rootCheck.status === "running"
											? "Checking..."
											: "Validate root"}
									</button>
								</div>
								<p className={styles.infoCopy}>
									Run a metadata scan before saving so the project starts with a
									real picture of what Watchdog and drawing-control tools will
									see.
								</p>
								<div
									className={cn(
										styles.validationBanner,
										rootCheck.status === "ready" &&
											styles.validationBannerReady,
										rootCheck.status === "warning" &&
											styles.validationBannerWarning,
										rootCheck.status === "error" &&
											styles.validationBannerError,
									)}
								>
									<strong>
										{rootCheck.status === "idle"
											? "No validation has run yet."
											: rootCheck.status === "running"
												? "Scanning the selected root..."
												: rootCheck.status === "ready"
													? "Root validated"
													: rootCheck.status === "warning"
														? "Root validated with follow-up"
														: "Validation failed"}
									</strong>
									<span>
										{rootCheck.message || "Choose a root and run validation."}
									</span>
								</div>
								{rootCheck.status !== "idle" &&
								rootCheck.status !== "running" ? (
								<div className={styles.validationStats}>
										<div className={styles.validationStat}>
											<span>Files</span>
											<strong>{rootCheck.totalFiles}</strong>
										</div>
										<div className={styles.validationStat}>
											<span>Drawings</span>
											<strong>{rootCheck.drawingFiles}</strong>
										</div>
										<div className={styles.validationStat}>
											<span>PDFs</span>
											<strong>{rootCheck.pdfFiles}</strong>
										</div>
									</div>
								) : null}
								{rootCheck.warnings.length > 0 ? (
									<div className={styles.previewList}>
										<span className={styles.previewLabel}>Follow-up</span>
										<ul>
											{rootCheck.warnings.map((warning) => (
												<li key={warning}>{warning}</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						</>
					) : null}

					{activeStep.id === "defaults" ? (
						<>
							<div className={styles.sectionIntro}>
								<h3 className={styles.sectionTitle}>Title block defaults</h3>
								<p className={styles.sectionCopy}>
									Seed the project with the title block profile that scans,
									standards checker, and issue prep should inherit.
								</p>
							</div>
							<p className={styles.mappingNote}>
								Client / utility maps to ACADE Line 1, facility / site maps to
								Line 2, and project number maps to the ACADE PROJ value. Drawing
								titles stay drawing-specific and come from the title block or
								deliverable row, not from a project default.
							</p>
							{profileMessage ? (
								<div className={styles.inlineNotice}>{profileMessage}</div>
							) : null}
							<div className={styles.gridTwo}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-block-name"
									>
										Block name
									</label>
									<input
										id="project-form-block-name"
										name="project_form_block_name"
										type="text"
										value={formData.titleBlockBlockName}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockBlockName: event.target.value,
											})
										}
										className={styles.input}
										placeholder={DEFAULT_PROJECT_TITLE_BLOCK_NAME}
									/>
								</div>
								<div className={styles.readinessHint}>
									<strong>
										{profileLoading
											? "Loading stored defaults..."
											: titleBlockDefaultsConfigured
												? "Defaults are configured."
												: "Defaults are still minimal."}
									</strong>
									<span>
										Add signer names or ACADE lines now so the first scan does
										not start from a blank profile.
									</span>
								</div>
							</div>
							<div>
								<label
									className={styles.label}
									htmlFor="project-form-acade-project-file"
								>
									ACADE project target (.wdp)
								</label>
								<input
									id="project-form-acade-project-file"
									name="project_form_acade_project_file"
									type="text"
									value={formData.titleBlockAcadeProjectFilePath}
									onChange={(event) => {
										autoDerivedAcadePathRef.current = "";
										updateProjectForm(setFormData, {
											titleBlockAcadeProjectFilePath: event.target.value,
										});
									}}
									className={styles.input}
									placeholder="Optional override. Leave blank to derive from the project name and root."
								/>
								<p className={styles.inlineHint}>
									This is the target .wdp path ACADE will create or activate.
									If this stays blank, the wizard derives it from the project
									name and root folder. Save Setup Only stores the path and
									support defaults; Create and Open in ACADE asks ACADE to use
									this exact path in Project Manager.
								</p>
							</div>
							<div className={styles.gridTwo}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-acade-line1"
									>
										Client / utility
									</label>
									<input
										id="project-form-acade-line1"
										name="project_form_acade_line1"
										type="text"
										value={formData.titleBlockAcadeLine1}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockAcadeLine1: event.target.value,
											})
										}
										className={styles.input}
										placeholder="Hunt Energy Network"
									/>
								</div>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-acade-line2"
									>
										Facility / site
									</label>
									<input
										id="project-form-acade-line2"
										name="project_form_acade_line2"
										type="text"
										value={formData.titleBlockAcadeLine2}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockAcadeLine2: event.target.value,
											})
										}
										className={styles.input}
										placeholder="Nanulak 180MW BESS Substation"
									/>
								</div>
							</div>
							<div className={styles.gridTwo}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-acade-line4"
									>
										Project number
									</label>
									<input
										id="project-form-acade-line4"
										name="project_form_acade_line4"
										type="text"
										value={formData.titleBlockAcadeLine4}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockAcadeLine4: event.target.value,
											})
										}
										className={styles.input}
										placeholder="R3P-25074"
									/>
								</div>
								<div />
							</div>
							<div className={styles.gridThree}>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-drawn-by"
									>
										Drawn by
									</label>
									<input
										id="project-form-drawn-by"
										name="project_form_drawn_by"
										type="text"
										value={formData.titleBlockDrawnBy}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockDrawnBy: event.target.value,
											})
										}
										className={styles.input}
										placeholder="Drafting lead"
									/>
								</div>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-checked-by"
									>
										Checked by
									</label>
									<input
										id="project-form-checked-by"
										name="project_form_checked_by"
										type="text"
										value={formData.titleBlockCheckedBy}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockCheckedBy: event.target.value,
											})
										}
										className={styles.input}
										placeholder="QA / reviewer"
									/>
								</div>
								<div>
									<label
										className={styles.label}
										htmlFor="project-form-engineer"
									>
										Engineer
									</label>
									<input
										id="project-form-engineer"
										name="project_form_engineer"
										type="text"
										value={formData.titleBlockEngineer}
										onChange={(event) =>
											updateProjectForm(setFormData, {
												titleBlockEngineer: event.target.value,
											})
										}
										className={styles.input}
										placeholder="Engineer of record"
									/>
								</div>
							</div>
						</>
					) : null}

					{activeStep.id === "review" ? (
						<>
							<div className={styles.sectionIntro}>
								<h3 className={styles.sectionTitle}>Review project setup</h3>
								<p className={styles.sectionCopy}>
									Confirm the project lane, tracking root, and title block
									defaults before the workspace goes live.
								</p>
							</div>

							<div className={styles.reviewGrid}>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>Project</span>
									<strong>{formData.name || "Untitled project"}</strong>
									<p>{formData.description || "No description added yet."}</p>
									{formData.projectPeName.trim() ||
									formData.projectFirmNumber.trim() ? (
										<p>
											{formData.projectPeName.trim()
												? `PE: ${formData.projectPeName.trim()}`
												: "PE: Not set"}
											{formData.projectFirmNumber.trim()
												? ` • Firm: ${formData.projectFirmNumber.trim()}`
												: ""}
										</p>
									) : null}
								</div>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>Tracking root</span>
									<strong>{normalizedRootPath || "Not configured"}</strong>
									<p>
										{rootCheck.status === "ready"
											? `${rootCheck.drawingFiles} drawing file(s) found during validation.`
											: rootCheck.status === "warning"
												? "Validation found drawings, but some files still need review."
												: "Watchdog and drawing-control tools will stay unassigned until a root is configured."}
									</p>
								</div>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>PDF package root</span>
									<strong>
										{formData.pdfPackageRootPath.trim() || "Not configured"}
									</strong>
									<p>
										{formData.pdfPackageRootPath.trim()
											? "Issued PDFs and workbook pairing can default to this package output folder."
											: "Optional, but recommended if the deliverable register should auto-pair against a package output root."}
									</p>
								</div>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>
										Title block defaults
									</span>
									<strong>
										{formData.titleBlockBlockName ||
											DEFAULT_PROJECT_TITLE_BLOCK_NAME}
									</strong>
									<p>
										{titleBlockDefaultsConfigured
											? "Client / utility, facility / site, project number, and signer defaults are ready for title block review."
											: "Only the base block name is set. Add signer names or ACADE defaults before issue prep."}
									</p>
								</div>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>ACADE setup</span>
									<strong>
										{formData.titleBlockAcadeProjectFilePath.trim() ||
											"Starter .wdp will be derived from the project root"}
									</strong>
									<p>
										Save Setup Only keeps the target path and support defaults
										aligned. Create and Open in ACADE launches ACADE and asks it
										to create or activate the live project at that path in
										Project Manager before you review drawings.
									</p>
								</div>
							</div>

							<div className={styles.reviewChecklist}>
								<div className={styles.reviewChecklistHeader}>
									<h4 className={styles.infoTitle}>Readiness checks</h4>
								</div>
								{reviewBlockers.length > 0 ? (
									<ul className={styles.checklistList}>
										{reviewBlockers.map((blocker) => (
											<li key={blocker}>{blocker}</li>
										))}
									</ul>
								) : (
									<div className={styles.validationBannerReady}>
										<strong>Ready to save this project setup.</strong>
										<span>
											The project root, defaults, and review summary are set.
											After you save, open the project workflow to run drawing
											scan, clear review items, and build the package.
										</span>
									</div>
								)}
							</div>
						</>
					) : null}
				</div>

				<div className={styles.footer}>
					<div className={styles.footerMeta}>
						<span className={styles.footerStep}>
							Step {stepIndex + 1} of {WIZARD_STEPS.length}
						</span>
						<span className={styles.footerStepCopy}>
							{activeStep.description}
						</span>
					</div>
					<div className={styles.footerActions}>
						<button
							type="button"
							onClick={onClose}
							className={styles.buttonSecondary}
						>
							Cancel
						</button>
						{stepIndex > 0 ? (
							<button
								type="button"
								onClick={previousStep}
								className={styles.buttonSecondary}
							>
								Back
							</button>
						) : null}
						{stepIndex < WIZARD_STEPS.length - 1 ? (
							<button
								type="button"
								onClick={nextStep}
								className={styles.buttonPrimary}
								disabled={!canAdvance}
							>
								Next
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={() => {
										void Promise.resolve(onSubmit());
									}}
									className={styles.buttonSecondary}
									disabled={!canSubmit}
								>
									{reviewSubmitLabel}
								</button>
								{onSubmitAndOpenAcade ? (
									<button
										type="button"
										onClick={() => {
											void Promise.resolve(onSubmitAndOpenAcade());
										}}
										className={styles.buttonPrimary}
										disabled={!canSubmit}
									>
										{isEditing
											? "Save and Open in ACADE"
											: "Create and Open in ACADE"}
									</button>
								) : null}
							</>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
