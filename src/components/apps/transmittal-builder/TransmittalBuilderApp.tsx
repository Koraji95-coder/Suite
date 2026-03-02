import { PageFrame } from "@/components/apps/ui/PageFrame";
import { TransmittalBuilderMainForm } from "./TransmittalBuilderMainForm";
import { TransmittalBuilderRightRail } from "./TransmittalBuilderRightRail";
import { useTransmittalBuilderState } from "./useTransmittalBuilderState";

export function TransmittalBuilderApp() {
	const state = useTransmittalBuilderState();

	return (
		<PageFrame
			title="Transmittal Builder"
			subtitle="Generate transmittal packages in DOCX and PDF formats."
			rightRail={
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
				/>
			}
		>
			<TransmittalBuilderMainForm
				draft={state.draft}
				files={state.files}
				profileOptions={state.profileOptions}
				firmOptions={state.firmOptions}
				profileOptionsError={state.profileOptionsError}
				templateLoading={state.templateLoading}
				templateError={state.templateError}
				isInvalid={state.isInvalid}
				updateDraft={state.updateDraft}
				handlePeChange={state.handlePeChange}
				handleTemplateFiles={state.handleTemplateFiles}
				handleIndexFiles={state.handleIndexFiles}
				handlePdfFiles={state.handlePdfFiles}
				handleCidFiles={state.handleCidFiles}
				handleScanCid={state.handleScanCid}
				handleUseExampleTemplate={state.handleUseExampleTemplate}
				updateCidDocument={state.updateCidDocument}
				removeCidDocument={state.removeCidDocument}
				handleContactChange={state.handleContactChange}
				removeContact={state.removeContact}
				addContact={state.addContact}
				handleOptionToggle={state.handleOptionToggle}
			/>
		</PageFrame>
	);
}
