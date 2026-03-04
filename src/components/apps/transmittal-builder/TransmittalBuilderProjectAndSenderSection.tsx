import { Section } from "@/components/apps/ui/PageFrame";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Input, TextArea } from "@/components/primitives/Input";
import styles from "./TransmittalBuilderProjectAndSenderSection.module.css";
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
				<div className={styles.sectionGrid}>
					<div className={styles.twoColumns}>
						<div className={styles.field}>
							<label className={styles.label}>Project Name</label>
							<Input
								value={draft.projectName}
								onChange={(event) =>
									updateDraft("projectName", event.target.value)
								}
								className={isInvalid("projectName") ? styles.invalidField : ""}
								placeholder="Client - Site Name"
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.label}>Project Number</label>
							<Input
								value={draft.projectNumber}
								onChange={(event) =>
									updateDraft("projectNumber", event.target.value)
								}
								className={
									isInvalid("projectNumber") ? styles.invalidField : ""
								}
								placeholder="R3P-XXXX"
							/>
						</div>
					</div>
					<div className={styles.twoColumns}>
						<div className={styles.field}>
							<label className={styles.label}>Date</label>
							<Input
								value={draft.date}
								onChange={(event) => updateDraft("date", event.target.value)}
								className={isInvalid("date") ? styles.invalidField : ""}
								placeholder="MM/DD/YYYY"
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.label}>Transmittal</label>
							<Input
								value={draft.transmittalNumber}
								onChange={(event) =>
									updateDraft("transmittalNumber", event.target.value)
								}
								className={
									isInvalid("transmittalNumber") ? styles.invalidField : ""
								}
								placeholder="XMTL-###"
							/>
						</div>
					</div>
					<div className={styles.field}>
						<label className={styles.label}>Description</label>
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
				<div className={styles.sectionGrid}>
					<div className={styles.twoColumns}>
						<div className={styles.field}>
							<label className={styles.label}>PE</label>
							<Select value={draft.peName} onValueChange={handlePeChange}>
								<SelectTrigger
									className={isInvalid("peName") ? styles.invalidField : ""}
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
								<div className={styles.errorText}>{profileOptionsError}</div>
							) : (
								<div className={styles.helperText}>
									Sender values are managed by the selected profile.
								</div>
							)}
						</div>
						<div className={styles.field}>
							<label className={styles.label}>Title</label>
							<Input
								value={draft.fromTitle}
								readOnly
								className={isInvalid("fromTitle") ? styles.invalidField : ""}
								placeholder="Managed from profile"
							/>
						</div>
					</div>

					<div className={styles.twoColumns}>
						<div className={styles.field}>
							<label className={styles.label}>Email</label>
							<Input
								value={draft.fromEmail}
								readOnly
								className={isInvalid("fromEmail") ? styles.invalidField : ""}
								placeholder="Managed from profile"
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.label}>Phone</label>
							<Input
								value={draft.fromPhone}
								readOnly
								placeholder="Managed from profile"
							/>
						</div>
					</div>

					<div className={styles.field}>
						<label className={styles.label}>Firm Number</label>
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
