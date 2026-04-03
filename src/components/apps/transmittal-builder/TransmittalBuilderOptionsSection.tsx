import { Checkbox } from "@/components/apps/ui/checkbox";
import { Section } from "@/components/apps/ui/PageFrame";
import { Panel } from "@/components/primitives/Panel";
import {
	type DraftState,
	OPTION_GROUPS,
	type OptionKey,
} from "@/features/transmittal-builder";
import styles from "./TransmittalBuilderOptionsSection.module.css";

const TransmittalSection = Section;

interface TransmittalBuilderOptionsSectionProps {
	draft: DraftState;
	handleOptionToggle: (key: OptionKey, checked: boolean) => void;
}

export function TransmittalBuilderOptionsSection({
	draft,
	handleOptionToggle,
}: TransmittalBuilderOptionsSectionProps) {
	return (
		<TransmittalSection title="Transmittal Options">
			<div className={styles.grid}>
				{OPTION_GROUPS.map((group) => (
					<Panel
						key={group.id}
						variant="inset"
						padding="md"
						className={styles.optionPanel}
					>
						<div className={styles.groupTitle}>{group.label}</div>
						<div className={styles.optionsList}>
							{group.options.map((option) => (
								<div key={option.key} className={styles.optionLabel}>
									<Checkbox
										checked={draft.options[option.key]}
										onCheckedChange={(checked) =>
											handleOptionToggle(option.key, checked === true)
										}
									/>
									<span className={styles.optionText}>{option.label}</span>
								</div>
							))}
						</div>
					</Panel>
				))}
			</div>
		</TransmittalSection>
	);
}
