import { useMemo } from "react";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { ProjectWorkflowLinks } from "@/components/apps/ui/ProjectWorkflowLinks";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Text } from "@/components/primitives/Text";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import styles from "./TransmittalBuilderApp.module.css";
import { TransmittalBuilderMainForm } from "./TransmittalBuilderMainForm";
import { TransmittalBuilderRightRail } from "./TransmittalBuilderRightRail";
import { useTransmittalBuilderState } from "./useTransmittalBuilderState";

interface PackageContextStage {
	state: TrustState;
	label: string;
	step: string;
	title: string;
	detail: string;
}

function resolvePackageContextStage(args: {
	projectName: string | null;
	hasProject: boolean;
	loading: boolean;
	standardMode: boolean;
	hasDocuments: boolean;
	hasTemplate: boolean;
	completeContactsCount: number;
	pendingReviewCount: number;
	projectMetadataLoadedAt: string | null;
	submitAttempted: boolean;
	validationErrors: number;
	outputCount: number;
}) {
	const {
		projectName,
		hasProject,
		loading,
		standardMode,
		hasDocuments,
		hasTemplate,
		completeContactsCount,
		pendingReviewCount,
		projectMetadataLoadedAt,
		submitAttempted,
		validationErrors,
		outputCount,
	} = args;
	const label = projectName ?? "this package";

	if (!hasProject) {
		return {
			state: "needs-attention",
			label: "Select project",
			step: "Setup",
			title: "Choose the project package context first.",
			detail:
				"Keep the transmittal, reviewed files, and delivery receipt tied to one project before generating documents.",
		} satisfies PackageContextStage;
	}

	if (loading) {
		return {
			state: "background",
			label: "Preparing package",
			step: "Prepare",
			title: `Preparing package inputs for ${label}.`,
			detail:
				"Project metadata, PDF review rows, or output generation are still running.",
		} satisfies PackageContextStage;
	}

	if (standardMode && hasDocuments && !projectMetadataLoadedAt) {
		return {
			state: "background",
			label: "Load metadata",
			step: "Review",
			title: `Load the project metadata before final document review for ${label}.`,
			detail:
				"That pass links the current PDFs to project drawing rows so the package receipt stays grounded in project data.",
		} satisfies PackageContextStage;
	}

	if (pendingReviewCount > 0) {
		return {
			state: "needs-attention",
			label: "Review documents",
			step: "Review",
			title: `${pendingReviewCount} document${pendingReviewCount === 1 ? " still needs" : " still need"} review before issue.`,
			detail:
				"Finish the remaining title, revision, or metadata checks before generating the package output.",
		} satisfies PackageContextStage;
	}

	if (submitAttempted && validationErrors > 0) {
		return {
			state: "needs-attention",
			label: "Complete draft",
			step: "Draft",
			title: `${label} still has required draft fields missing.`,
			detail:
				"Finish the package details, contacts, and source files before generating documents.",
		} satisfies PackageContextStage;
	}

	if (hasTemplate && hasDocuments && completeContactsCount > 0) {
		return {
			state: outputCount > 0 ? "ready" : "background",
			label: outputCount > 0 ? "Package generated" : "Ready to generate",
			step: outputCount > 0 ? "Issued" : "Generate",
			title:
				outputCount > 0
					? `${label} already has generated output for this draft.`
					: `${label} is ready for document generation.`,
			detail:
				outputCount > 0
					? "Use the receipt and output panel to download the latest package or generate a refreshed set."
					: "Template, contacts, and source documents are staged for the next transmittal run.",
		} satisfies PackageContextStage;
	}

	return {
		state: "background",
		label: "Complete package",
		step: "Draft",
		title: `Keep assembling the package for ${label}.`,
		detail:
			"Finish the template, source files, and contacts so the package can move into review and generation.",
	} satisfies PackageContextStage;
}

interface ContextMetric {
	label: string;
	value: number | string;
}

interface TransmittalBuilderAppProps {
	preferredProjectId?: string;
	preferredIssueSetId?: string;
}

export function TransmittalBuilderApp({
	preferredProjectId,
	preferredIssueSetId,
}: TransmittalBuilderAppProps) {
	const state = useTransmittalBuilderState(
		preferredProjectId,
		preferredIssueSetId,
	);
	const selectedProject =
		state.projectOptions.find(
			(project) => project.id === state.draft.selectedProjectId,
		) ?? null;
	const selectedProjectName =
		selectedProject?.name || state.draft.projectName || null;
	const standardMode = state.draft.transmittalType === "standard";
	const documentCount = standardMode
		? state.draft.standardDocuments.length
		: state.draft.cidDocuments.length;
	const pendingReviewCount = standardMode
		? state.draft.standardDocuments.filter(
				(document) => document.needsReview && !document.accepted,
			).length
		: 0;
	const metadataLabel = standardMode
		? state.draft.standardDocumentSource === "project_metadata"
			? state.projectMetadataLoadedAt
				? "Project metadata ready"
				: "Project metadata pending"
			: "PDF review path"
		: "CID package";
	const packageTypeLabel = standardMode ? "Standard package" : "CID package";
	const stage = resolvePackageContextStage({
		projectName: selectedProjectName,
		hasProject: Boolean(state.draft.selectedProjectId),
		loading:
			state.projectMetadataLoading ||
			state.pdfAnalysisLoading ||
			state.generationState.state === "loading",
		standardMode,
		hasDocuments: documentCount > 0,
		hasTemplate: Boolean(state.files.template),
		completeContactsCount: state.completeContacts.length,
		pendingReviewCount,
		projectMetadataLoadedAt: state.projectMetadataLoadedAt,
		submitAttempted: state.submitAttempted,
		validationErrors: state.validation.errors.length,
		outputCount: state.outputs.length,
	});
	const contextMetrics = useMemo<ContextMetric[]>(() => {
		const metrics: ContextMetric[] = [];
		if (state.preferredIssueSet) {
			metrics.push({
				label: "Issue set",
				value: `${state.preferredIssueSet.issueTag} • ${
					state.preferredIssueSet.selectedDrawingPaths.length
				} drawing${
					state.preferredIssueSet.selectedDrawingPaths.length === 1 ? "" : "s"
				}`,
			});
		}
		if (documentCount > 0) {
			metrics.push({ label: "Documents", value: documentCount });
		}
		if (pendingReviewCount > 0) {
			metrics.push({ label: "Pending review", value: pendingReviewCount });
		}
		if (state.completeContacts.length > 0) {
			metrics.push({
				label: "Contacts ready",
				value: state.completeContacts.length,
			});
		}
		if (state.outputs.length > 0) {
			metrics.push({ label: "Outputs", value: state.outputs.length });
		}
		return metrics;
	}, [
		documentCount,
		pendingReviewCount,
		state.completeContacts.length,
		state.outputs.length,
		state.preferredIssueSet,
	]);
	const workflowLinks = state.draft.selectedProjectId
		? [
				{
					label: "Setup",
					to: buildProjectDetailHref(state.draft.selectedProjectId, "setup"),
				},
				{
					label: "Review",
					to: buildProjectDetailHref(
						state.draft.selectedProjectId,
						"review",
						{
							issueSet: state.preferredIssueSet?.id ?? null,
						},
					),
				},
				{
					label: "Issue Sets",
					to: buildProjectDetailHref(
						state.draft.selectedProjectId,
						"issue-sets",
						{
							issueSet: state.preferredIssueSet?.id ?? null,
						},
					),
				},
			]
		: [];

	return (
		<PageFrame maxWidth="full">
			<PageContextBand
				eyebrow="Package workflow"
				summary={
					<div className={styles.contextCopy}>
						<p className={styles.contextTitle}>{stage.title}</p>
						<Text
							size="sm"
							color="muted"
							block
							className={styles.contextSummary}
						>
							{stage.detail}
						</Text>
						<div className={styles.contextFacts}>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>Project</span>
								<span className={styles.contextFactValue}>
									{selectedProjectName || "No project selected"}
								</span>
							</div>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>Review path</span>
								<span className={styles.contextFactValue}>{metadataLabel}</span>
							</div>
							<div className={styles.contextFact}>
								<span className={styles.contextFactLabel}>Package</span>
								<span className={styles.contextFactValue}>{packageTypeLabel}</span>
							</div>
						</div>
					</div>
				}
				meta={
					<div className={styles.contextMeta}>
						<TrustStateBadge state={stage.state} label={stage.label} />
						{state.preferredIssueSet ? (
							<Badge variant="soft" color="warning">
								{state.preferredIssueSet.issueTag}
							</Badge>
						) : null}
						<Badge variant="soft" color="accent">
							{stage.step}
						</Badge>
					</div>
				}
			>
				{contextMetrics.length > 0 ? (
					<div className={styles.metricStrip}>
						{contextMetrics.map((metric) => (
							<div key={metric.label} className={styles.metricPill}>
								<span className={styles.metricLabel}>{metric.label}</span>
								<strong className={styles.metricValue}>{metric.value}</strong>
							</div>
						))}
					</div>
				) : null}
				<ProjectWorkflowLinks links={workflowLinks} />
			</PageContextBand>
			<div className={styles.layout}>
				<TransmittalBuilderMainForm
					draft={state.draft}
					files={state.files}
					profileOptions={state.profileOptions}
					firmOptions={state.firmOptions}
					profileOptionsError={state.profileOptionsError}
					templateLoading={state.templateLoading}
					templateError={state.templateError}
					pdfAnalysisLoading={state.pdfAnalysisLoading}
					pdfAnalysisError={state.pdfAnalysisError}
					pdfAnalysisWarnings={state.pdfAnalysisWarnings}
					projectOptions={state.projectOptions}
					projectMetadataLoading={state.projectMetadataLoading}
					projectMetadataError={state.projectMetadataError}
					projectMetadataWarnings={state.projectMetadataWarnings}
					projectMetadataLoadedAt={state.projectMetadataLoadedAt}
					isInvalid={state.isInvalid}
					updateDraft={state.updateDraft}
					handlePeChange={state.handlePeChange}
					handleTemplateFiles={state.handleTemplateFiles}
					handleIndexFiles={state.handleIndexFiles}
					handleAcadeReportFiles={state.handleAcadeReportFiles}
					handlePdfFiles={state.handlePdfFiles}
					handleStandardDocumentSourceChange={
						state.handleStandardDocumentSourceChange
					}
					handleProjectSelectionChange={state.handleProjectSelectionChange}
					handleLoadProjectMetadata={state.handleLoadProjectMetadata}
					analyzePdfFiles={state.analyzePdfFiles}
					handleCidFiles={state.handleCidFiles}
					handleScanCid={state.handleScanCid}
					handleUseExampleTemplate={state.handleUseExampleTemplate}
					handleStandardDocumentChange={state.handleStandardDocumentChange}
					updateCidDocument={state.updateCidDocument}
					removeCidDocument={state.removeCidDocument}
					handleContactChange={state.handleContactChange}
					removeContact={state.removeContact}
					addContact={state.addContact}
					handleOptionToggle={state.handleOptionToggle}
				/>

				<aside className={styles.sideRail}>
				<TransmittalBuilderRightRail
					outputFormat={state.outputFormat}
					onOutputFormatChange={state.setOutputFormat}
						onGenerate={state.handleGenerate}
						onResetSession={state.resetSession}
						generationState={state.generationState}
						outputs={state.outputs}
						draft={state.draft}
						completeContactsCount={state.completeContacts.length}
					fileSummary={state.fileSummary}
					optionSummary={state.optionSummary}
					preferredIssueSetSummary={
						state.preferredIssueSet
							? `${state.preferredIssueSet.issueTag} • ${
									state.preferredIssueSet.selectedDrawingPaths.length
							  } drawing${
									state.preferredIssueSet.selectedDrawingPaths.length === 1
										? ""
										: "s"
							  }`
							: null
					}
					lastSavedAt={state.lastSavedAt}
						submitAttempted={state.submitAttempted}
						validationErrors={state.validation.errors}
						projectMetadataLoadedAt={state.projectMetadataLoadedAt}
					/>
				</aside>
			</div>
		</PageFrame>
	);
}
