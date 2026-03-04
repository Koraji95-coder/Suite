import { RefreshCcw, Trash2 } from "lucide-react";
import { Section } from "@/components/apps/ui/PageFrame";
import { RadioGroup, RadioGroupItem } from "@/components/apps/ui/RadioGroup";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { cn } from "@/lib/utils";
import { TransmittalBuilderFileRow as FileRow } from "./TransmittalBuilderFileRow";
import styles from "./TransmittalBuilderTypeAndFilesSection.module.css";
import {
	type DraftState,
	type FileState,
	REVISION_OPTIONS,
	type TransmittalType,
} from "./transmittalBuilderModels";

const TransmittalSection = Section;

interface TransmittalBuilderTypeAndFilesSectionProps {
	draft: DraftState;
	files: FileState;
	templateLoading: boolean;
	templateError: string | null;
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
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
}

export function TransmittalBuilderTypeAndFilesSection({
	draft,
	files,
	templateLoading,
	templateError,
	isInvalid,
	updateDraft,
	handleTemplateFiles,
	handleIndexFiles,
	handlePdfFiles,
	handleCidFiles,
	handleScanCid,
	handleUseExampleTemplate,
	updateCidDocument,
	removeCidDocument,
}: TransmittalBuilderTypeAndFilesSectionProps) {
	return (
		<>
			<TransmittalSection title="Transmittal Type">
				<div className={styles.sectionBody}>
					<RadioGroup
						value={draft.transmittalType}
						onValueChange={(value) =>
							updateDraft("transmittalType", value as TransmittalType)
						}
						className={styles.typeGrid}
					>
						<label className={styles.typeOption}>
							<RadioGroupItem value="standard" aria-label="Standard" />
							<div>
								<div className={styles.typeTitle}>Standard</div>
								<div className={styles.typeDescription}>
									PDF documents with an Excel index.
								</div>
							</div>
						</label>
						<label className={styles.typeOption}>
							<RadioGroupItem value="cid" aria-label="CID" />
							<div>
								<div className={styles.typeTitle}>CID</div>
								<div className={styles.typeDescription}>
									CID files with document index entries.
								</div>
							</div>
						</label>
					</RadioGroup>
				</div>
			</TransmittalSection>

			<TransmittalSection title="File Selection">
				<div className={styles.fileSelectionGrid}>
					<FileRow
						label="Template File"
						accept=".docx"
						files={files.template ? [files.template] : []}
						onFilesSelected={handleTemplateFiles}
						helpText="DOCX template used for transmittal layout."
						invalid={isInvalid("template")}
						action={{
							label: templateLoading ? "Loading…" : "Use example",
							onClick: handleUseExampleTemplate,
							disabled: templateLoading,
						}}
					/>
					{templateError && (
						<div className={styles.errorText}>{templateError}</div>
					)}

					{draft.transmittalType === "standard" ? (
						<div className={styles.standardFiles}>
							<FileRow
								label="Drawing Index"
								accept=".xlsx,.xls"
								files={files.index ? [files.index] : []}
								onFilesSelected={handleIndexFiles}
								helpText="Excel index used to pull revisions."
								invalid={isInvalid("index")}
							/>
							<FileRow
								label="PDF Documents"
								accept=".pdf"
								multiple
								files={files.pdfs}
								onFilesSelected={handlePdfFiles}
								helpText="Select all PDF sheets for this package."
								invalid={isInvalid("pdfs")}
							/>
						</div>
					) : (
						<div className={styles.cidFiles}>
							<FileRow
								label="CID Files"
								accept=".cid"
								multiple
								files={files.cid}
								onFilesSelected={handleCidFiles}
								helpText="Select CID files to include in the index."
								invalid={isInvalid("cid")}
							/>
							<Button
								type="button"
								variant="outline"
								onClick={handleScanCid}
								disabled={files.cid.length === 0}
								iconLeft={<RefreshCcw size={16} />}
							>
								Refresh CID table
							</Button>
						</div>
					)}
				</div>
			</TransmittalSection>

			{draft.transmittalType === "cid" && (
				<TransmittalSection title="CID Document Index">
					<div className={styles.sectionBody}>
						{draft.cidDocuments.length === 0 ? (
							<div className={styles.emptyState}>
								Select CID files to populate the list.
							</div>
						) : (
							<div className={styles.cidTable}>
								<div className={styles.cidHeader}>
									<span>File</span>
									<span>Description</span>
									<span>Revision</span>
									<span></span>
								</div>
								{draft.cidDocuments.map((doc) => (
									<div key={doc.id} className={styles.cidRow}>
										<div className={styles.cidFileName} title={doc.fileName}>
											{doc.fileName}
										</div>
										<Input
											value={doc.description}
											onChange={(event) =>
												updateCidDocument(
													doc.id,
													"description",
													event.target.value,
												)
											}
											className={cn(
												isInvalid("cidDocs") && styles.invalidField,
											)}
										/>
										<Select
											value={doc.revision}
											onValueChange={(value) =>
												updateCidDocument(doc.id, "revision", value)
											}
										>
											<SelectTrigger
												className={cn(
													styles.revisionTrigger,
													isInvalid("cidDocs") && styles.invalidField,
												)}
											>
												<SelectValue placeholder="-" />
											</SelectTrigger>
											<SelectContent>
												{REVISION_OPTIONS.map((option) => (
													<SelectItem key={option} value={option}>
														{option}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											iconOnly
											iconLeft={<Trash2 size={14} />}
											aria-label={`Remove ${doc.fileName}`}
											onClick={() => removeCidDocument(doc.fileName)}
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</TransmittalSection>
			)}
		</>
	);
}
