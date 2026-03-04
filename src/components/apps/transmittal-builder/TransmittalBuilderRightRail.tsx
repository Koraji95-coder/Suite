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
		<div className="space-y-4">
			<TransmittalSection title="Generate">
				<div className="grid gap-3 px-2 sm:px-3">
					<div className="grid gap-2">
						<div className="text-xs font-semibold [color:var(--text)]">
							Output format
						</div>
						<RadioGroup
							value={outputFormat}
							onValueChange={(value) =>
								onOutputFormatChange(value as OutputFormat)
							}
							className="grid gap-2"
						>
							{OUTPUT_FORMATS.map((format) => {
								const Icon = format.icon;
								const active = outputFormat === format.value;
								return (
									<label
										key={format.value}
										className={cn(
											"flex cursor-pointer items-center gap-3 rounded-xl border p-3",
											active ? "border-primary" : "border-border",
										)}
									>
										<RadioGroupItem
											value={format.value}
											aria-label={format.label}
										/>
										<Icon size={18} />
										<div>
											<div className="text-sm font-semibold [color:var(--text)]">
												{format.label}
											</div>
											<div className="text-xs text-text-muted">
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
								<Loader2 size={16} className="animate-spin" />
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
				<div className="grid gap-3 px-2 text-xs text-text-muted sm:px-3">
					<div className="flex items-center gap-2">
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
						<div className="grid gap-2">
							{outputs.map((output) => (
								<Panel key={output.id} variant="inset" padding="md">
									<div className="grid gap-1 text-xs">
										<div className="font-semibold [color:var(--text)]">
											{output.label}
										</div>
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
				<Panel variant="inset" padding="lg" className="space-y-3 text-xs">
					<div>
						<div className="text-text-muted">Project</div>
						<div className="text-sm font-semibold [color:var(--text)]">
							{draft.projectName || "Untitled project"}
						</div>
						<div className="text-text-muted">
							{draft.projectNumber || "R3P-"} ·{" "}
							{draft.transmittalNumber || "XMTL-"} · {draft.date || "--"}
						</div>
					</div>

					<div>
						<div className="text-text-muted">From</div>
						<div className="[color:var(--text)]">{draft.fromName || "—"}</div>
						<div className="text-text-muted">{draft.fromTitle || "—"}</div>
					</div>

					<div>
						<div className="text-text-muted">Contacts</div>
						<div className="[color:var(--text)]">
							{completeContactsCount} complete
						</div>
					</div>

					<div>
						<div className="text-text-muted">Files</div>
						<div className="[color:var(--text)]">
							Template: {fileSummary.template}
						</div>
						<div className="text-text-muted">
							Index: {fileSummary.index} · {fileSummary.documents}
						</div>
					</div>

					<div>
						<div className="text-text-muted">Options</div>
						<div className="grid gap-1">
							{optionSummary.map((group) => (
								<div key={group.label}>
									<span className="[color:var(--text)]">{group.label}:</span>{" "}
									<span className="text-text-muted">{group.value}</span>
								</div>
							))}
						</div>
					</div>
				</Panel>
			</TransmittalSection>

			<TransmittalSection title="Validation">
				<div className="grid gap-2 px-2 text-xs text-text-muted sm:px-3">
					<div>Draft saved: {lastSavedAt?.toLocaleTimeString() || "-"}</div>
					{submitAttempted && validationErrors.length > 0 ? (
						<div className="grid gap-1 [color:var(--danger)]">
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
