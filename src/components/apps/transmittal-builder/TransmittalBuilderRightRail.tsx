import {
	AlertTriangle,
	CheckCircle2,
	Download,
	Loader2,
	RefreshCcw,
} from "lucide-react";
import { Section } from "@/components/apps/ui/PageFrame";
import { RadioGroup, RadioGroupItem } from "@/components/apps/ui/RadioGroup";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { cn } from "@/lib/utils";
import styles from "./TransmittalBuilderRightRail.module.css";
import {
	bytesToSize,
	type DraftState,
	type GenerationState,
	OUTPUT_FORMATS,
	type OutputFile,
	type OutputFormat,
} from "./transmittalBuilderModels";

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
	};
	optionSummary: Array<{
		label: string;
		value: string;
	}>;
	lastSavedAt: Date | null;
	submitAttempted: boolean;
	validationErrors: string[];
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
	lastSavedAt,
	submitAttempted,
	validationErrors,
}: TransmittalBuilderRightRailProps) {
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
									<label
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
									</label>
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

					<Button type="button" variant="outline" onClick={onResetSession}>
						Reset session
					</Button>
				</div>
			</TransmittalSection>

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

			<TransmittalSection title="Summary">
				<Panel variant="inset" padding="lg" className={styles.summaryPanel}>
					<div>
						<div className={styles.muted}>Project</div>
						<div className={styles.summaryHeading}>
							{draft.projectName || "Untitled project"}
						</div>
						<div className={styles.muted}>
							{draft.projectNumber || "R3P-"} ·{" "}
							{draft.transmittalNumber || "XMTL-"} · {draft.date || "--"}
						</div>
					</div>

					<div>
						<div className={styles.muted}>From</div>
						<div className={styles.text}>{draft.fromName || "—"}</div>
						<div className={styles.muted}>{draft.fromTitle || "—"}</div>
					</div>

					<div>
						<div className={styles.muted}>Contacts</div>
						<div className={styles.text}>{completeContactsCount} complete</div>
					</div>

					<div>
						<div className={styles.muted}>Files</div>
						<div className={styles.text}>Template: {fileSummary.template}</div>
						<div className={styles.muted}>
							Index: {fileSummary.index} · {fileSummary.documents}
						</div>
					</div>

					<div>
						<div className={styles.muted}>Options</div>
						<div className={styles.optionSummaryList}>
							{optionSummary.map((group) => (
								<div key={group.label}>
									<span className={styles.text}>{group.label}:</span>{" "}
									<span className={styles.muted}>{group.value}</span>
								</div>
							))}
						</div>
					</div>
				</Panel>
			</TransmittalSection>

			<TransmittalSection title="Validation">
				<div className={styles.validationBody}>
					<div>Draft saved: {lastSavedAt?.toLocaleTimeString() || "-"}</div>
					{submitAttempted && validationErrors.length > 0 ? (
						<div className={styles.validationErrors}>
							{validationErrors.map((error) => (
								<div key={error}>{error}</div>
							))}
						</div>
					) : (
						<div>All required fields look good.</div>
					)}
				</div>
			</TransmittalSection>
		</div>
	);
}
