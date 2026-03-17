import { TransmittalBuilderContactsSection } from "./TransmittalBuilderContactsSection";
import styles from "./TransmittalBuilderMainForm.module.css";
import { TransmittalBuilderOptionsSection } from "./TransmittalBuilderOptionsSection";
import { TransmittalBuilderProjectAndSenderSection } from "./TransmittalBuilderProjectAndSenderSection";
import { TransmittalBuilderTypeAndFilesSection } from "./TransmittalBuilderTypeAndFilesSection";
import {
	type Contact,
	type DraftState,
	type FileState,
	type OptionKey,
} from "./transmittalBuilderModels";
import type { PeProfile } from "./transmittalConfig";

interface TransmittalBuilderMainFormProps {
	draft: DraftState;
	files: FileState;
	profileOptions: PeProfile[];
	firmOptions: string[];
	profileOptionsError: string | null;
	templateLoading: boolean;
	templateError: string | null;
	pdfAnalysisLoading: boolean;
	pdfAnalysisError: string | null;
	pdfAnalysisWarnings: string[];
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
	handlePeChange: (value: string) => void;
	handleTemplateFiles: (selected: File[]) => void;
	handleIndexFiles: (selected: File[]) => void;
	handlePdfFiles: (selected: File[]) => void;
	analyzePdfFiles: () => void;
	handleCidFiles: (selected: File[]) => void;
	handleScanCid: () => void;
	handleUseExampleTemplate: () => void;
	handleStandardDocumentChange: (
		id: string,
		field:
			| "drawingNumber"
			| "title"
			| "revision"
			| "accepted"
			| "overrideReason",
		value: string | boolean,
	) => void;
	updateCidDocument: (
		id: string,
		field: "description" | "revision",
		value: string,
	) => void;
	removeCidDocument: (fileName: string) => void;
	handleContactChange: (
		id: string,
		field: keyof Contact,
		value: string,
	) => void;
	removeContact: (id: string) => void;
	addContact: () => void;
	handleOptionToggle: (key: OptionKey, checked: boolean) => void;
}

export function TransmittalBuilderMainForm({
	draft,
	files,
	profileOptions,
	firmOptions,
	profileOptionsError,
	templateLoading,
	templateError,
	pdfAnalysisLoading,
	pdfAnalysisError,
	pdfAnalysisWarnings,
	isInvalid,
	updateDraft,
	handlePeChange,
	handleTemplateFiles,
	handleIndexFiles,
	handlePdfFiles,
	analyzePdfFiles,
	handleCidFiles,
	handleScanCid,
	handleUseExampleTemplate,
	handleStandardDocumentChange,
	updateCidDocument,
	removeCidDocument,
	handleContactChange,
	removeContact,
	addContact,
	handleOptionToggle,
}: TransmittalBuilderMainFormProps) {
	return (
		<div className={styles.stack}>
			<TransmittalBuilderTypeAndFilesSection
				draft={draft}
				files={files}
				templateLoading={templateLoading}
				templateError={templateError}
				pdfAnalysisLoading={pdfAnalysisLoading}
				pdfAnalysisError={pdfAnalysisError}
				pdfAnalysisWarnings={pdfAnalysisWarnings}
				isInvalid={isInvalid}
				updateDraft={updateDraft}
				handleTemplateFiles={handleTemplateFiles}
				handleIndexFiles={handleIndexFiles}
				handlePdfFiles={handlePdfFiles}
				handleAnalyzePdfs={analyzePdfFiles}
				handleCidFiles={handleCidFiles}
				handleScanCid={handleScanCid}
				handleUseExampleTemplate={handleUseExampleTemplate}
				handleStandardDocumentChange={handleStandardDocumentChange}
				updateCidDocument={updateCidDocument}
				removeCidDocument={removeCidDocument}
			/>

			<TransmittalBuilderProjectAndSenderSection
				draft={draft}
				profileOptions={profileOptions}
				firmOptions={firmOptions}
				profileOptionsError={profileOptionsError}
				isInvalid={isInvalid}
				updateDraft={updateDraft}
				handlePeChange={handlePeChange}
			/>

			<TransmittalBuilderContactsSection
				draft={draft}
				isInvalid={isInvalid}
				handleContactChange={handleContactChange}
				removeContact={removeContact}
				addContact={addContact}
			/>

			<TransmittalBuilderOptionsSection
				draft={draft}
				handleOptionToggle={handleOptionToggle}
			/>
		</div>
	);
}
