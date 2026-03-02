import { TransmittalBuilderContactsSection } from "./TransmittalBuilderContactsSection";
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
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
	handlePeChange: (value: string) => void;
	handleTemplateFiles: (selected: File[]) => void;
	handleIndexFiles: (selected: File[]) => void;
	handlePdfFiles: (selected: File[]) => void;
	handleCidFiles: (selected: File[]) => void;
	handleScanCid: () => void;
	handleUseExampleTemplate: () => void;
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
	isInvalid,
	updateDraft,
	handlePeChange,
	handleTemplateFiles,
	handleIndexFiles,
	handlePdfFiles,
	handleCidFiles,
	handleScanCid,
	handleUseExampleTemplate,
	updateCidDocument,
	removeCidDocument,
	handleContactChange,
	removeContact,
	addContact,
	handleOptionToggle,
}: TransmittalBuilderMainFormProps) {
	return (
		<div className="space-y-4">
			<TransmittalBuilderTypeAndFilesSection
				draft={draft}
				files={files}
				templateLoading={templateLoading}
				templateError={templateError}
				isInvalid={isInvalid}
				updateDraft={updateDraft}
				handleTemplateFiles={handleTemplateFiles}
				handleIndexFiles={handleIndexFiles}
				handlePdfFiles={handlePdfFiles}
				handleCidFiles={handleCidFiles}
				handleScanCid={handleScanCid}
				handleUseExampleTemplate={handleUseExampleTemplate}
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
