import {
	AlertTriangle,
	CheckCircle2,
	Download,
	Loader2,
	RefreshCcw,
} from "lucide-react";
import { Section } from "@/components/system/PageFrame";
import { RadioGroup, RadioGroupItem } from "@/components/system/RadioGroup";
import { Button } from "@/components/system/base/Button";
import { Panel } from "@/components/system/base/Panel";
import {
	bytesToSize,
	type DraftState,
	formatTransmittalNativeStandardsCompactValue,
	formatTransmittalNativeStandardsStatus,
	type GenerationState,
	OUTPUT_FORMATS,
	type OutputFile,
	type OutputFormat,
	type TransmittalNativeStandardsReviewSnapshot,
} from "@/features/transmittal-builder";
import { cn } from "@/lib/utils";
import styles from "./TransmittalBuilderRightRail.module.css";

const TransmittalSection = Section;

interface TransmittalBuilderRightRailProps {
	outputFormat: OutputFormat;
	onOutputFormatChange: (value: OutputFormat) => void;
	onGenerate: () => void;
	onResetSession: () => void;
	generationState: GenerationState;
	outputs: OutputFile[];
	draft: DraftState;
	completeContactsCount: number;
	fileSummary: {
		template: string;
		index: string;
		documents: string;
		report: string;
	};
	optionSummary: Array<{
		label: string;
		value: string;
	}>;
	preferredIssueSetSummary?: string | null;
	nativeStandardsReview: TransmittalNativeStandardsReviewSnapshot | null;
	nativeStandardsReviewLoading: boolean;
	nativeStandardsReviewError: string | null;
	lastSavedAt: Date | null;
	submitAttempted: boolean;
	validationErrors: string[];
	projectMetadataLoadedAt: string | null;
}

export function TransmittalBuilderRightRail({
	outputFormat,
	onOutputFormatChange,
	onGenerate,
	onResetSession,
	generationState,
	outputs,
	draft,
	completeContactsCount,
	fileSummary,
	optionSummary,
	preferredIssueSetSummary = null,
	nativeStandardsReview,
	nativeStandardsReviewLoading,
	nativeStandardsReviewError,
	lastSavedAt,
	submitAttempted,
	validationErrors,
	projectMetadataLoadedAt,
}: TransmittalBuilderRightRailProps) {
	const showOutputSection =
		outputs.length > 0 ||
		generationState.state === "success" ||
		generationState.state === "error";
	const hasProjectContext = Boolean(draft.selectedProjectId || draft.projectName);
	const nativeStandardsStatusText =
		draft.transmittalType === "standard"
			? formatTransmittalNativeStandardsStatus({
					review: nativeStandardsReview,
					loading: nativeStandardsReviewLoading,
					error: nativeStandardsReviewError,
				})
			: null;
	const nativeStandardsToneClass =
		!nativeStandardsStatusText
			? ""
			: nativeStandardsReviewLoading
				? styles.nativeReviewStatusLoading
				: nativeStandardsReviewError ||
					  !nativeStandardsReview?.hasRecordedReview ||
					  nativeStandardsReview?.isBlocking
					? styles.nativeReviewStatusNeedsAttention
					: styles.nativeReviewStatusReady;
	const packageRows = [
		{
			label: "Package",
			value: `${draft.transmittalType === "standard" ? "Standard package" : "CID package"} | ${draft.date || "--"}`,
		},
		{
			label: "From",
			value: draft.fromName
				? `${draft.fromName}${draft.fromTitle ? ` | ${draft.fromTitle}` : ""}`
				: "Sender details not set yet.",
		},
		{
			label: "Contacts",
			value: `${completeContactsCount} complete`,
		},
		{
			label: "Files",
			value: `Template ${fileSummary.template} | ${fileSummary.documents}`,
		},
		...(draft.transmittalType === "standard"
			? [
					{
						label: "Standards",
						value: formatTransmittalNativeStandardsCompactValue(
							nativeStandardsReview,
						),
					},
				]
			: []),
		...(preferredIssueSetSummary
			? [
					{
						label: "Issue set",
						value: preferredIssueSetSummary,
					},
				]
			: []),
	];

	return (
		<div className={styles.root}>
			<TransmittalSection title="Generate">
				<div className={styles.sectionBody}>
					<div className={styles.block}>
						<div className={styles.blockTitle}>Output format</div>
						<RadioGroup
							value={outputFormat}
							onValueChange={(value) =>
								onOutputFormatChange(value as OutputFormat)
							}
							className={styles.formatGrid}
						>
							{OUTPUT_FORMATS.map((format) => {
								const Icon = format.icon;
								const active = outputFormat === format.value;
								return (
									<div
										key={format.value}
										className={cn(
											styles.formatOption,
											active && styles.formatOptionActive,
										)}
									>
										<RadioGroupItem
											value={format.value}
											aria-label={format.label}
										/>
										<Icon size={18} />
										<div className={styles.formatMeta}>
											<div className={styles.formatTitle}>{format.label}</div>
											<div className={styles.formatDescription}>
												{format.description}
											</div>
										</div>
									</div>
								);
							})}
						</RadioGroup>
					</div>

					<Button
						type="button"
						onClick={onGenerate}
						disabled={generationState.state === "loading"}
						iconLeft={
							generationState.state === "loading" ? (
								<Loader2 size={16} className={styles.spin} />
							) : (
								<Download size={16} />
							)
						}
					>
						Generate documents
					</Button>

					<Button type="button" variant="ghost" size="sm" onClick={onResetSession}>
						Reset session
					</Button>

					<div className={styles.generateSummary}>
						<div className={styles.validationStatus}>
							<span className={styles.muted}>Draft saved</span>
							<span className={styles.text}>
								{lastSavedAt?.toLocaleTimeString() || "Not yet"}
							</span>
						</div>
						{submitAttempted && validationErrors.length > 0 ? (
							<div className={styles.validationErrors}>
								{validationErrors.map((error) => (
									<div key={error}>{error}</div>
								))}
							</div>
					) : (
						<div className={styles.readyNote}>
							All required package fields look good.
						</div>
					)}
					{nativeStandardsStatusText ? (
						<div
							className={cn(
								styles.nativeReviewStatus,
								nativeStandardsToneClass,
							)}
						>
							{nativeStandardsStatusText}
						</div>
					) : null}
				</div>
			</div>
		</TransmittalSection>

			{showOutputSection ? (
				<TransmittalSection title="Output">
					<div className={styles.outputBody}>
						<div className={styles.outputStatus}>
							{generationState.state === "success" ? (
								<CheckCircle2 size={14} />
							) : generationState.state === "error" ? (
								<AlertTriangle size={14} />
							) : (
								<RefreshCcw size={14} />
							)}
							<span>
								{generationState.message || "Ready to generate transmittal."}
							</span>
						</div>
						{outputs.length === 0 ? (
							<div>No output yet.</div>
						) : (
							<div className={styles.outputList}>
								{outputs.map((output) => (
									<Panel key={output.id} variant="inset" padding="md">
										<div className={styles.outputItem}>
											<div className={styles.outputLabel}>{output.label}</div>
											<div>{output.filename}</div>
											<div>
												{bytesToSize(output.size)} | {output.createdAt}
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => {
													const link = document.createElement("a");
													link.href = output.url;
													link.download = output.filename;
													link.click();
												}}
											>
												Download again
											</Button>
										</div>
									</Panel>
								))}
							</div>
						)}
					</div>
				</TransmittalSection>
			) : null}

			<TransmittalSection title="Package snapshot">
				<Panel variant="inset" padding="lg" className={styles.summaryPanel}>
					<div className={styles.summaryHeader}>
						<div className={styles.summaryHeading}>
							{draft.transmittalNumber || "Draft package"}
						</div>
						<div className={styles.muted}>
							{draft.projectName || "No project selected"}
							{draft.projectNumber ? ` | ${draft.projectNumber}` : ""}
						</div>
					</div>

					{hasProjectContext ? (
						<div className={styles.summaryList}>
							{packageRows.map((row) => (
								<div key={row.label} className={styles.summaryRow}>
									<span className={styles.muted}>{row.label}</span>
									<span className={styles.text}>{row.value}</span>
								</div>
							))}
							{draft.transmittalType === "standard" ? (
								<div className={styles.summaryRow}>
									<span className={styles.muted}>Review path</span>
									<span className={styles.text}>
										{draft.standardDocumentSource === "project_metadata"
											? projectMetadataLoadedAt
												? `Project metadata | ${new Date(projectMetadataLoadedAt).toLocaleString()}`
												: "Project metadata"
											: "PDF OCR / manual review"}
									</span>
								</div>
							) : null}
							{draft.transmittalType === "standard" &&
							fileSummary.report !== "No ACADE report" ? (
								<div className={styles.summaryRow}>
									<span className={styles.muted}>ACADE report</span>
									<span className={styles.text}>{fileSummary.report}</span>
								</div>
							) : null}
						</div>
					) : (
						<div className={styles.snapshotNote}>
							Choose the project package context first to build the delivery
							snapshot.
						</div>
					)}

					{optionSummary.length > 0 ? (
						<div className={styles.optionSummaryList}>
							{optionSummary.map((group) => (
								<div key={group.label} className={styles.summaryRow}>
									<span className={styles.muted}>{group.label}</span>
									<span className={styles.text}>{group.value}</span>
								</div>
							))}
						</div>
					) : null}
				</Panel>
			</TransmittalSection>
		</div>
	);
}

