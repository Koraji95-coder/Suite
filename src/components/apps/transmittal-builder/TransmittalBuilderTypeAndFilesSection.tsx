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
	pdfAnalysisLoading: boolean;
	pdfAnalysisError: string | null;
	pdfAnalysisWarnings: string[];
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
	handleTemplateFiles: (selected: File[]) => void;
	handleIndexFiles: (selected: File[]) => void;
	handlePdfFiles: (selected: File[]) => void;
	handleAnalyzePdfs: () => void;
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
}

export function TransmittalBuilderTypeAndFilesSection({
	draft,
	files,
	templateLoading,
	templateError,
	pdfAnalysisLoading,
	pdfAnalysisError,
	pdfAnalysisWarnings,
	isInvalid,
	updateDraft,
	handleTemplateFiles,
	handleIndexFiles,
	handlePdfFiles,
	handleAnalyzePdfs,
	handleCidFiles,
	handleScanCid,
	handleUseExampleTemplate,
	handleStandardDocumentChange,
	updateCidDocument,
	removeCidDocument,
}: TransmittalBuilderTypeAndFilesSectionProps) {
	const pendingReviewCount = draft.standardDocuments.filter(
		(doc) => doc.needsReview && !doc.accepted,
	).length;
	const reviewedCount = draft.standardDocuments.filter(
		(doc) => doc.needsReview && doc.accepted,
	).length;

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
						<div className={styles.typeOption}>
							<RadioGroupItem value="standard" aria-label="Standard" />
							<div>
								<div className={styles.typeTitle}>Standard</div>
								<div className={styles.typeDescription}>
									PDF documents with an Excel index.
								</div>
							</div>
						</div>
						<div className={styles.typeOption}>
							<RadioGroupItem value="cid" aria-label="CID" />
							<div>
								<div className={styles.typeTitle}>CID</div>
								<div className={styles.typeDescription}>
									CID files with document index entries.
								</div>
							</div>
						</div>
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
								helpText="Select all PDF sheets. If no Excel index is uploaded, title blocks are analyzed locally and reviewed before a temporary index is generated."
								invalid={isInvalid("pdfs")}
								action={
									files.pdfs.length > 0 || pdfAnalysisLoading
										? {
												label: pdfAnalysisLoading
													? "Analyzing..."
													: "Re-analyze",
												onClick: handleAnalyzePdfs,
												disabled:
													pdfAnalysisLoading || files.pdfs.length === 0,
											}
										: undefined
								}
							/>
							{pdfAnalysisError ? (
								<div className={styles.errorText}>{pdfAnalysisError}</div>
							) : null}
							{pdfAnalysisWarnings.length > 0 ? (
								<div className={styles.warningList}>
									{pdfAnalysisWarnings.map((warning) => (
										<div key={warning} className={styles.warningText}>
											{warning}
										</div>
									))}
								</div>
							) : null}
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

			{draft.transmittalType === "standard" && (
				<TransmittalSection title="PDF Document Review">
					<div className={styles.sectionBody}>
						{files.pdfs.length === 0 ? (
							<div className={styles.emptyState}>
								Select PDF sheets to analyze title block data.
							</div>
						) : draft.standardDocuments.length === 0 ? (
							<div className={styles.emptyState}>
								{pdfAnalysisLoading
									? "Analyzing PDF title blocks..."
									: "No PDF analysis rows are available yet."}
							</div>
						) : (
							<>
								<div className={styles.analysisStatus}>
									<div className={styles.analysisStat}>
										<span className={styles.analysisStatLabel}>Rows</span>
										<span>{draft.standardDocuments.length}</span>
									</div>
									<div className={styles.analysisStat}>
										<span className={styles.analysisStatLabel}>Pending</span>
										<span>{pendingReviewCount}</span>
									</div>
									<div className={styles.analysisStat}>
										<span className={styles.analysisStatLabel}>Reviewed</span>
										<span>{reviewedCount}</span>
									</div>
								</div>
								<div className={styles.standardDocTable}>
									<div className={styles.standardDocHeader}>
										<span>File</span>
										<span>Drawing No.</span>
										<span>Title</span>
										<span>Revision</span>
										<span>Recognition</span>
										<span>Accepted</span>
										<span>Review note</span>
									</div>
									{draft.standardDocuments.map((doc) => {
										const confidencePercent = Math.max(
											0,
											Math.min(100, Math.round(doc.confidence * 100)),
										);
										return (
											<div
												key={doc.id}
												className={cn(
													styles.standardDocRow,
													doc.needsReview &&
														!doc.accepted &&
														styles.standardDocRowNeedsReview,
												)}
											>
												<div className={styles.standardDocFile}>
													<div
														className={styles.standardDocFileName}
														title={doc.fileName}
													>
														{doc.fileName}
													</div>
													<div className={styles.standardDocMeta}>
														{doc.modelVersion
															? `model ${doc.modelVersion}`
															: "deterministic-v1"}
													</div>
												</div>
												<Input
													aria-label={`Drawing number for ${doc.fileName}`}
													value={doc.drawingNumber}
													onChange={(event) =>
														handleStandardDocumentChange(
															doc.id,
															"drawingNumber",
															event.target.value,
														)
													}
													className={cn(
														isInvalid("standardDocuments") &&
															doc.needsReview &&
															!doc.accepted &&
															styles.invalidField,
													)}
												/>
												<Input
													aria-label={`Title for ${doc.fileName}`}
													value={doc.title}
													onChange={(event) =>
														handleStandardDocumentChange(
															doc.id,
															"title",
															event.target.value,
														)
													}
													className={cn(
														isInvalid("standardDocuments") &&
															doc.needsReview &&
															!doc.accepted &&
															styles.invalidField,
													)}
												/>
												<Input
													aria-label={`Revision for ${doc.fileName}`}
													value={doc.revision}
													onChange={(event) =>
														handleStandardDocumentChange(
															doc.id,
															"revision",
															event.target.value,
														)
													}
													className={cn(
														isInvalid("standardDocuments") &&
															doc.needsReview &&
															!doc.accepted &&
															styles.invalidField,
													)}
												/>
												<div className={styles.standardDocSignal}>
													<span
														className={cn(
															styles.confidencePill,
															doc.needsReview
																? styles.confidencePillWarning
																: styles.confidencePillSuccess,
														)}
													>
														{confidencePercent}%
													</span>
													<span className={styles.standardDocMeta}>
														{doc.source || "manual"}
													</span>
												</div>
												<label
													className={styles.acceptToggle}
													htmlFor={`standard-doc-accept-${doc.id}`}
												>
													<input
														id={`standard-doc-accept-${doc.id}`}
														name={`standard_doc_accept_${doc.id}`}
														type="checkbox"
														checked={doc.accepted}
														onChange={(event) =>
															handleStandardDocumentChange(
																doc.id,
																"accepted",
																event.target.checked,
															)
														}
													/>
													<span>
														{doc.needsReview ? "Reviewed" : "Accepted"}
													</span>
												</label>
												<Input
													aria-label={`Review note for ${doc.fileName}`}
													value={doc.overrideReason}
													onChange={(event) =>
														handleStandardDocumentChange(
															doc.id,
															"overrideReason",
															event.target.value,
														)
													}
													placeholder={
														doc.needsReview
															? "Why this row is accepted"
															: "Optional note"
													}
													className={cn(
														isInvalid("standardDocuments") &&
															doc.needsReview &&
															!doc.accepted &&
															styles.invalidField,
													)}
												/>
											</div>
										);
									})}
								</div>
							</>
						)}
					</div>
				</TransmittalSection>
			)}

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
