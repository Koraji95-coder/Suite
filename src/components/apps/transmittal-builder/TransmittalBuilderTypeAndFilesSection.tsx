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
				<div className="px-2 sm:px-3">
					<RadioGroup
						value={draft.transmittalType}
						onValueChange={(value) =>
							updateDraft("transmittalType", value as TransmittalType)
						}
						className="grid gap-3 sm:grid-cols-2"
					>
						<label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4">
							<RadioGroupItem value="standard" aria-label="Standard" />
							<div>
								<div className="text-sm font-semibold [color:var(--text)]">
									Standard
								</div>
								<div className="text-xs text-text-muted">
									PDF documents with an Excel index.
								</div>
							</div>
						</label>
						<label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4">
							<RadioGroupItem value="cid" aria-label="CID" />
							<div>
								<div className="text-sm font-semibold [color:var(--text)]">
									CID
								</div>
								<div className="text-xs text-text-muted">
									CID files with document index entries.
								</div>
							</div>
						</label>
					</RadioGroup>
				</div>
			</TransmittalSection>

			<TransmittalSection title="File Selection">
				<div className="grid gap-4 px-2 sm:px-3">
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
						<div className="text-xs [color:var(--danger)]">{templateError}</div>
					)}

					{draft.transmittalType === "standard" ? (
						<div className="grid gap-4">
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
						<div className="grid gap-3">
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
					<div className="grid gap-3 px-2 sm:px-3">
						{draft.cidDocuments.length === 0 ? (
							<div className="text-sm text-text-muted">
								Select CID files to populate the list.
							</div>
						) : (
							<div className="grid gap-2">
								<div className="grid grid-cols-1 gap-2 text-xs font-semibold text-text-muted sm:grid-cols-[2fr_4fr_1fr_auto]">
									<span>File</span>
									<span>Description</span>
									<span>Revision</span>
									<span></span>
								</div>
								{draft.cidDocuments.map((doc) => (
									<div
										key={doc.id}
										className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[2fr_4fr_1fr_auto]"
									>
										<div
											className="truncate rounded-lg border border-border bg-surface px-2 py-2 font-mono text-xs"
											title={doc.fileName}
										>
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
												isInvalid("cidDocs") &&
													"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
											)}
										/>
										<Select
											value={doc.revision}
											onValueChange={(value) =>
												updateCidDocument(doc.id, "revision", value)
											}
										>
											<SelectTrigger className="text-xs">
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
