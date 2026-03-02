import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/apps/ui/button";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { Input } from "@/components/apps/ui/input";
import { FrameSection } from "@/components/apps/ui/PageFrame";
import { RadioGroup, RadioGroupItem } from "@/components/apps/ui/RadioGroup";
import { Surface } from "@/components/apps/ui/Surface";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Textarea } from "@/components/apps/ui/textarea";
import { hexToRgba, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { TransmittalBuilderFileRow as FileRow } from "./TransmittalBuilderFileRow";
import {
	type Contact,
	type DraftState,
	type FileState,
	OPTION_GROUPS,
	type OptionKey,
	REVISION_OPTIONS,
	type TransmittalType,
} from "./transmittalBuilderModels";
import type { PeProfile } from "./transmittalConfig";

const TransmittalSection = FrameSection;

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
	const { palette } = useTheme();

	return (
		<div className="space-y-4">
			<TransmittalSection title="Transmittal Type">
				<div className="px-2 sm:px-3">
					<RadioGroup<TransmittalType>
						value={draft.transmittalType}
						onValueChange={(value) => updateDraft("transmittalType", value)}
						className="grid gap-3 sm:grid-cols-2"
					>
						<label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer">
							<RadioGroupItem value="standard" aria-label="Standard" />
							<div>
								<div
									className="text-sm font-semibold"
									style={{ color: hexToRgba(palette.text, 0.82) }}
								>
									Standard
								</div>
								<div className="text-xs text-muted-foreground">
									PDF documents with an Excel index.
								</div>
							</div>
						</label>
						<label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer">
							<RadioGroupItem value="cid" aria-label="CID" />
							<div>
								<div
									className="text-sm font-semibold"
									style={{ color: hexToRgba(palette.text, 0.82) }}
								>
									CID
								</div>
								<div className="text-xs text-muted-foreground">
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
							label: templateLoading ? "Loading..." : "Use example",
							onClick: handleUseExampleTemplate,
							disabled: templateLoading,
						}}
					/>
					{templateError ? (
						<div className="text-xs [color:var(--danger)]">{templateError}</div>
					) : null}

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
							>
								<RefreshCcw size={16} />
								Refresh CID table
							</Button>
						</div>
					)}
				</div>
			</TransmittalSection>

			{draft.transmittalType === "cid" ? (
				<TransmittalSection title="CID Document Index">
					<div className="grid gap-3 px-2 sm:px-3">
						{draft.cidDocuments.length === 0 ? (
							<div className="text-sm text-muted-foreground">
								Select CID files to populate the list.
							</div>
						) : (
							<div className="grid gap-2">
								<div className="grid grid-cols-1 sm:grid-cols-[2fr_4fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground">
									<span>File</span>
									<span>Description</span>
									<span>Revision</span>
									<span></span>
								</div>
								{draft.cidDocuments.map((doc) => (
									<div
										key={doc.id}
										className="grid grid-cols-1 sm:grid-cols-[2fr_4fr_1fr_auto] gap-2 items-center"
									>
										<div
											className="truncate rounded-lg border border-border bg-background px-2 py-2 text-xs font-mono"
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
											size="icon"
											onClick={() => removeCidDocument(doc.fileName)}
										>
											<Trash2 size={14} />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				</TransmittalSection>
			) : null}

			<TransmittalSection title="Project Information">
				<div className="grid gap-4 px-2 sm:px-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">
								Project Name
							</label>
							<Input
								value={draft.projectName}
								onChange={(event) =>
									updateDraft("projectName", event.target.value)
								}
								className={cn(
									isInvalid("projectName") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="Client - Site Name"
							/>
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">
								Project Number
							</label>
							<Input
								value={draft.projectNumber}
								onChange={(event) =>
									updateDraft("projectNumber", event.target.value)
								}
								className={cn(
									isInvalid("projectNumber") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="R3P-XXXX"
							/>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">Date</label>
							<Input
								value={draft.date}
								onChange={(event) => updateDraft("date", event.target.value)}
								className={cn(
									isInvalid("date") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="MM/DD/YYYY"
							/>
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">
								Transmittal
							</label>
							<Input
								value={draft.transmittalNumber}
								onChange={(event) =>
									updateDraft("transmittalNumber", event.target.value)
								}
								className={cn(
									isInvalid("transmittalNumber") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="XMTL-###"
							/>
						</div>
					</div>
					<div className="grid gap-1">
						<label className="text-xs text-muted-foreground">Description</label>
						<Textarea
							value={draft.description}
							onChange={(event) =>
								updateDraft("description", event.target.value)
							}
							rows={3}
							placeholder="Project description"
						/>
					</div>
				</div>
			</TransmittalSection>

			<TransmittalSection title="From Information">
				<div className="grid gap-4 px-2 sm:px-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">PE</label>
							<Select value={draft.peName} onValueChange={handlePeChange}>
								<SelectTrigger
									className={cn(
										isInvalid("peName") &&
											"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
									)}
								>
									<SelectValue placeholder="Select PE" />
								</SelectTrigger>
								<SelectContent>
									{profileOptions.map((profile) => (
										<SelectItem key={profile.id} value={profile.id}>
											{profile.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{profileOptionsError ? (
								<div className="text-xs [color:var(--danger)]">
									{profileOptionsError}
								</div>
							) : (
								<div className="text-xs text-muted-foreground">
									Sender values are managed by the selected profile.
								</div>
							)}
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">Title</label>
							<Input
								value={draft.fromTitle}
								readOnly
								className={cn(
									isInvalid("fromTitle") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="Managed from profile"
							/>
						</div>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">Email</label>
							<Input
								value={draft.fromEmail}
								readOnly
								className={cn(
									isInvalid("fromEmail") &&
										"[border-color:var(--danger)] focus-visible:[ring-color:var(--danger)]",
								)}
								placeholder="Managed from profile"
							/>
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-muted-foreground">Phone</label>
							<Input
								value={draft.fromPhone}
								readOnly
								placeholder="Managed from profile"
							/>
						</div>
					</div>

					<div className="grid gap-1">
						<label className="text-xs text-muted-foreground">Firm Number</label>
						<Select
							value={draft.firmNumber}
							onValueChange={(value) => updateDraft("firmNumber", value)}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select firm" />
							</SelectTrigger>
							<SelectContent>
								{firmOptions.map((firm) => (
									<SelectItem key={firm} value={firm}>
										{firm}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</TransmittalSection>

			<TransmittalSection title="To - Contacts">
				<div className="grid gap-3 px-2 sm:px-3">
					{draft.contacts.map((contact) => (
						<Surface
							key={contact.id}
							className={cn(
								"p-4 space-y-3",
								isInvalid("contacts") && "[border-color:var(--danger)]",
							)}
						>
							<div className="grid gap-2 sm:grid-cols-4">
								<Input
									value={contact.name}
									onChange={(event) =>
										handleContactChange(contact.id, "name", event.target.value)
									}
									placeholder="Name"
								/>
								<Input
									value={contact.company}
									onChange={(event) =>
										handleContactChange(
											contact.id,
											"company",
											event.target.value,
										)
									}
									placeholder="Company"
								/>
								<Input
									value={contact.email}
									onChange={(event) =>
										handleContactChange(contact.id, "email", event.target.value)
									}
									placeholder="Email"
								/>
								<Input
									value={contact.phone}
									onChange={(event) =>
										handleContactChange(contact.id, "phone", event.target.value)
									}
									placeholder="Phone"
								/>
							</div>
							<div className="flex justify-end">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeContact(contact.id)}
									disabled={draft.contacts.length <= 1}
								>
									<Trash2 size={14} />
									Remove
								</Button>
							</div>
						</Surface>
					))}
					<Button type="button" variant="outline" onClick={addContact}>
						<Plus size={16} />
						Add contact
					</Button>
				</div>
			</TransmittalSection>

			<TransmittalSection title="Transmittal Options">
				<div className="grid gap-4 px-2 sm:px-3 sm:grid-cols-2 lg:grid-cols-4">
					{OPTION_GROUPS.map((group) => (
						<Surface
							key={group.id}
							className="p-4 space-y-3"
							style={{
								border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
							}}
						>
							<div className="text-xs font-semibold text-muted-foreground">
								{group.label}
							</div>
							<div className="grid gap-2">
								{group.options.map((option) => (
									<label
										key={option.key}
										className="flex items-center gap-2 text-sm"
									>
										<Checkbox
											checked={draft.options[option.key]}
											onCheckedChange={(checked) =>
												handleOptionToggle(option.key, checked)
											}
										/>
										<span>{option.label}</span>
									</label>
								))}
							</div>
						</Surface>
					))}
				</div>
			</TransmittalSection>
		</div>
	);
}
