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
import type { ProjectDocumentMetadataProjectOption } from "@/services/projectDocumentMetadataService";

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
	projectOptions: ProjectDocumentMetadataProjectOption[];
	projectMetadataLoading: boolean;
	projectMetadataError: string | null;
	projectMetadataWarnings: string[];
	projectMetadataLoadedAt: string | null;
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
	handlePeChange: (value: string) => void;
	handleTemplateFiles: (selected: File[]) => void;
	handleIndexFiles: (selected: File[]) => void;
	handleAcadeReportFiles: (selected: File[]) => void;
	handlePdfFiles: (selected: File[]) => void;
	handleStandardDocumentSourceChange: (
		value: DraftState["standardDocumentSource"],
	) => void;
	handleProjectSelectionChange: (projectId: string) => void;
	handleLoadProjectMetadata: () => void;
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
	projectOptions,
	projectMetadataLoading,
	projectMetadataError,
	projectMetadataWarnings,
	projectMetadataLoadedAt,
	isInvalid,
	updateDraft,
	handlePeChange,
	handleTemplateFiles,
	handleIndexFiles,
	handleAcadeReportFiles,
	handlePdfFiles,
	handleStandardDocumentSourceChange,
	handleProjectSelectionChange,
	handleLoadProjectMetadata,
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
				projectOptions={projectOptions}
				projectMetadataLoading={projectMetadataLoading}
				projectMetadataError={projectMetadataError}
				projectMetadataWarnings={projectMetadataWarnings}
				projectMetadataLoadedAt={projectMetadataLoadedAt}
				isInvalid={isInvalid}
				updateDraft={updateDraft}
				handleTemplateFiles={handleTemplateFiles}
				handleIndexFiles={handleIndexFiles}
				handleAcadeReportFiles={handleAcadeReportFiles}
				handlePdfFiles={handlePdfFiles}
				handleStandardDocumentSourceChange={handleStandardDocumentSourceChange}
				handleProjectSelectionChange={handleProjectSelectionChange}
				handleLoadProjectMetadata={handleLoadProjectMetadata}
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
