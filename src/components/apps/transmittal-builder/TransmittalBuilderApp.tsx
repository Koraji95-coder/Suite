import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Text } from "@/components/primitives/Text";
import styles from "./TransmittalBuilderApp.module.css";
import { TransmittalBuilderMainForm } from "./TransmittalBuilderMainForm";
import { TransmittalBuilderRightRail } from "./TransmittalBuilderRightRail";
import { useTransmittalBuilderState } from "./useTransmittalBuilderState";

export function TransmittalBuilderApp() {
	const state = useTransmittalBuilderState();

	return (
		<PageFrame maxWidth="full">
			<PageContextBand
				eyebrow="Package workflow"
				summary={
					<Text size="sm" color="muted" block className={styles.contextSummary}>
						Generate transmittal packages from project metadata, reviewed PDFs,
						and contact routing in one continuous form flow.
					</Text>
				}
			/>
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
