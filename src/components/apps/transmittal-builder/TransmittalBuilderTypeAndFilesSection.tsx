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
import {
	type DraftState,
	type FileState,
	REVISION_OPTIONS,
	type TransmittalType,
} from "@/features/transmittal-builder";
import { cn } from "@/lib/utils";
import { TransmittalBuilderFileRow as FileRow } from "./TransmittalBuilderFileRow";
import styles from "./TransmittalBuilderTypeAndFilesSection.module.css";
import type { ProjectDocumentMetadataProjectOption } from "@/features/project-documents";

const TransmittalSection = Section;

interface TransmittalBuilderTypeAndFilesSectionProps {
	draft: DraftState;
	files: FileState;
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
	handleTemplateFiles: (selected: File[]) => void;
	handleIndexFiles: (selected: File[]) => void;
	handleAcadeReportFiles: (selected: File[]) => void;
	handlePdfFiles: (selected: File[]) => void;
	handleStandardDocumentSourceChange: (
		value: DraftState["standardDocumentSource"],
	) => void;
	handleProjectSelectionChange: (projectId: string) => void;
	handleLoadProjectMetadata: () => void;
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
	projectOptions,
	projectMetadataLoading,
	projectMetadataError,
	projectMetadataWarnings,
	projectMetadataLoadedAt,
	isInvalid,
	updateDraft,
	handleTemplateFiles,
	handleIndexFiles,
	handleAcadeReportFiles,
	handlePdfFiles,
	handleStandardDocumentSourceChange,
	handleProjectSelectionChange,
	handleLoadProjectMetadata,
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
							<div className={styles.sourceModeCard}>
								<div className={styles.sourceModeHeader}>
									<div className={styles.sourceModeTitle}>
										Document metadata source
									</div>
									<div className={styles.sourceModeDescription}>
										Use Suite project metadata first. PDF OCR stays available as
										the fallback path for PDF-only or external packages.
									</div>
								</div>
								<RadioGroup
									value={draft.standardDocumentSource}
									onValueChange={(value) =>
										handleStandardDocumentSourceChange(
											value as DraftState["standardDocumentSource"],
										)
									}
									className={styles.sourceModeGrid}
								>
									<div className={styles.sourceModeOption}>
										<RadioGroupItem
											value="project_metadata"
											aria-label="Project metadata"
										/>
										<div>
											<div className={styles.typeTitle}>Project metadata</div>
											<div className={styles.typeDescription}>
												Load title-block sync and revision-register data from a
												Suite project.
											</div>
										</div>
									</div>
									<div className={styles.sourceModeOption}>
										<RadioGroupItem
											value="pdf_analysis"
											aria-label="PDF OCR / manual review fallback"
										/>
										<div>
											<div className={styles.typeTitle}>PDF OCR fallback</div>
											<div className={styles.typeDescription}>
												Analyze uploaded PDFs only when project metadata is not
												available or not usable for this package.
											</div>
										</div>
									</div>
								</RadioGroup>
								{draft.standardDocumentSource === "project_metadata" ? (
									<div className={styles.projectMetadataCard}>
										<div className={styles.projectMetadataControls}>
											<div className={styles.fieldBlock}>
												<div className={styles.fieldLabel}>Suite project</div>
												<Select
													value={draft.selectedProjectId}
													onValueChange={handleProjectSelectionChange}
												>
													<SelectTrigger
														className={
															isInvalid("selectedProjectId")
																? styles.invalidField
																: undefined
														}
													>
														<SelectValue placeholder="Select a project" />
													</SelectTrigger>
													<SelectContent>
														{projectOptions.map((project) => (
															<SelectItem key={project.id} value={project.id}>
																{project.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<Button
												type="button"
												variant="outline"
												onClick={handleLoadProjectMetadata}
												disabled={
													projectMetadataLoading ||
													!draft.selectedProjectId
												}
												iconLeft={<RefreshCcw size={16} />}
											>
												{projectMetadataLoading
													? "Loading..."
													: "Load project metadata"}
											</Button>
										</div>
										<div className={styles.projectMetadataHelper}>
											PDFs still drive the final transmittal package. This mode
											only replaces OCR as the source for drawing number, title,
											revision, and review state.
										</div>
										<FileRow
											label="ACADE Drawing List Report"
											accept=".xlsx,.csv,.tsv"
											files={files.acadeReport ? [files.acadeReport] : []}
											onFilesSelected={handleAcadeReportFiles}
											helpText="Optional Drawing List Report or Automatic Report export. Imported rows are merged with title-block scan results before review."
										/>
										{projectMetadataLoadedAt ? (
											<div className={styles.projectMetadataStatus}>
												Loaded {new Date(projectMetadataLoadedAt).toLocaleString()}
											</div>
										) : null}
										{projectMetadataError ? (
											<div className={styles.errorText}>
												{projectMetadataError}
											</div>
										) : null}
										{projectMetadataWarnings.length > 0 ? (
											<div className={styles.warningList}>
												{projectMetadataWarnings.map((warning) => (
													<div key={warning} className={styles.warningText}>
														{warning}
													</div>
												))}
											</div>
										) : null}
									</div>
								) : null}
							</div>
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
								helpText={
									draft.standardDocumentSource === "project_metadata"
										? "Select the PDF sheets to include in the package. Document rows come from project/title-block metadata instead of OCR."
										: "Select all PDF sheets for the fallback OCR/manual-review path when project metadata is unavailable."
								}
								invalid={isInvalid("pdfs")}
								action={
									draft.standardDocumentSource === "pdf_analysis" &&
									(files.pdfs.length > 0 || pdfAnalysisLoading)
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
							{draft.standardDocumentSource === "pdf_analysis" &&
							pdfAnalysisError ? (
								<div className={styles.errorText}>{pdfAnalysisError}</div>
							) : null}
							{draft.standardDocumentSource === "pdf_analysis" &&
							pdfAnalysisWarnings.length > 0 ? (
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
				<TransmittalSection title="Document Review">
					<div className={styles.sectionBody}>
						{files.pdfs.length === 0 ? (
							<div className={styles.emptyState}>
								{draft.standardDocumentSource === "project_metadata"
									? "Load project metadata and select the PDF sheets to include."
									: "Select PDF sheets for the OCR fallback path."}
							</div>
						) : draft.standardDocuments.length === 0 ? (
							<div className={styles.emptyState}>
								{draft.standardDocumentSource === "project_metadata"
									? "Load project metadata to populate document rows from title-block and revision data."
									: pdfAnalysisLoading
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
														title={doc.attachmentFileName || doc.fileName}
													>
														{doc.attachmentFileName || doc.fileName}
													</div>
													<div className={styles.standardDocMeta}>
														{doc.projectRelativePath
															? doc.projectRelativePath
															: doc.modelVersion
																? `model ${doc.modelVersion}`
																: "deterministic-v1"}
													</div>
													{doc.attachmentFileName !== doc.fileName ? (
														<div className={styles.standardDocMeta}>
															Metadata: {doc.fileName}
														</div>
													) : null}
													{doc.metadataWarnings.length > 0 ? (
														<div className={styles.warningText}>
															{doc.metadataWarnings[0]}
														</div>
													) : null}
													<div className={styles.standardDocMeta}>
														{doc.modelVersion
															? `source ${doc.modelVersion}`
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
