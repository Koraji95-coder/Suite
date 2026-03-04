import { Section } from "@/components/apps/ui/PageFrame";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Input, TextArea } from "@/components/primitives/Input";
import { cn } from "@/lib/utils";
import type { DraftState } from "./transmittalBuilderModels";
import type { PeProfile } from "./transmittalConfig";

const TransmittalSection = Section;

interface TransmittalBuilderProjectAndSenderSectionProps {
	draft: DraftState;
	profileOptions: PeProfile[];
	firmOptions: string[];
	profileOptionsError: string | null;
	isInvalid: (key: string) => boolean;
	updateDraft: (
		key: keyof DraftState,
		value: DraftState[keyof DraftState],
	) => void;
	handlePeChange: (value: string) => void;
}

export function TransmittalBuilderProjectAndSenderSection({
	draft,
	profileOptions,
	firmOptions,
	profileOptionsError,
	isInvalid,
	updateDraft,
	handlePeChange,
}: TransmittalBuilderProjectAndSenderSectionProps) {
	return (
		<>
			<TransmittalSection title="Project Information">
				<div className="grid gap-4 px-2 sm:px-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label className="text-xs text-text-muted">Project Name</label>
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
							<label className="text-xs text-text-muted">Project Number</label>
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
							<label className="text-xs text-text-muted">Date</label>
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
							<label className="text-xs text-text-muted">Transmittal</label>
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
						<label className="text-xs text-text-muted">Description</label>
						<TextArea
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
							<label className="text-xs text-text-muted">PE</label>
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
								<div className="text-xs text-text-muted">
									Sender values are managed by the selected profile.
								</div>
							)}
						</div>
						<div className="grid gap-1">
							<label className="text-xs text-text-muted">Title</label>
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
							<label className="text-xs text-text-muted">Email</label>
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
							<label className="text-xs text-text-muted">Phone</label>
							<Input
								value={draft.fromPhone}
								readOnly
								placeholder="Managed from profile"
							/>
						</div>
					</div>

					<div className="grid gap-1">
						<label className="text-xs text-text-muted">Firm Number</label>
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
		</>
	);
}
