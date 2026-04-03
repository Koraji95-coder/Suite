import { format } from "date-fns";
import {
	Calendar as CalendarIcon,
} from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
} from "react";
import {
	DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME,
	updateProjectForm,
	useProjectSetupWizardState,
} from "@/features/project-setup";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/apps/ui/Popover";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/apps/calendar/Calendar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./ProjectManagerFormModal.module.css";
import {
	PROJECT_CATEGORIES,
	type Priority,
	type ProjectFormData,
	type ProjectStatus,
} from "@/features/project-core";

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
	folderPickerUnavailable?: boolean;
	folderPickerHelpMessage?: string | null;
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
	folderPickerHelpMessage = null,
}: ProjectFormModalProps) {
	const {
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
		formatDeadline,
	} = useProjectSetupWizardState({
		isOpen,
		projectId,
		formData,
		setFormData,
		isEditing,
	});

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
					{steps.map((step, index) => {
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
								onClick={() => {
									if (index > maxAccessibleStepIndex) {
										return;
									}
									setStepIndex(index);
								}}
								disabled={index > maxAccessibleStepIndex}
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
														? formatDeadline(deadlineDate)
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
								{folderPickerHelpMessage ? (
									<p className={styles.inlineHint}>{folderPickerHelpMessage}</p>
								) : null}
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
								{folderPickerHelpMessage ? (
									<p className={styles.inlineHint}>{folderPickerHelpMessage}</p>
								) : null}
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
									see. The Next step stays locked until validation completes.
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
										placeholder={DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME}
									/>
								</div>
								<div className={styles.readinessHint}>
									<strong>
										{profileLoading
											? "Loading stored defaults..."
											: titleBlockDefaultsConfigured
												? "Defaults are configured."
												: "Complete every default field before review."}
									</strong>
									<span>
										Fill the block name, .wdp target, ACADE lines, and signer
										names now so the first scan starts from a complete profile.
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
									onChange={(event) =>
										setAcadeProjectFilePath(event.target.value)
									}
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
												? rootValidationReady
													? "Validation completed, but some files or support artifacts still need review."
													: "Run Validate root so Suite can confirm drawings and support files before review."
												: normalizedRootPath
													? "Run Validate root so Suite can confirm drawings and ACADE support files before review."
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
											DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME}
									</strong>
									<p>
										{titleBlockDefaultsConfigured
											? "Client / utility, facility / site, project number, and signer defaults are ready for title block review."
											: "Complete the full default profile before issue prep."}
									</p>
								</div>
								<div className={styles.reviewCard}>
									<span className={styles.reviewLabel}>ACADE setup</span>
									<strong>
										{formData.titleBlockAcadeProjectFilePath.trim() ||
											"Starter .wdp will be derived from the project root"}
									</strong>
									<p>
										{rootCheck.wdpState === "existing"
											? "Save Setup Only keeps the detected .wdp/.wdt/.wdl files aligned. Open Existing Project in ACADE launches ACADE and asks it to activate that existing project definition before you review drawings."
											: "Save Setup Only keeps the target path and support defaults aligned. Create and Open in ACADE launches ACADE and asks it to create or activate the live project at that path in Project Manager before you review drawings."}
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
							Step {stepIndex + 1} of {steps.length}
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
						{stepIndex < steps.length - 1 ? (
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
										{reviewAcadeActionLabel}
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
