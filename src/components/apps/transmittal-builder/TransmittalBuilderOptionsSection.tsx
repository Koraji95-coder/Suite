import { Checkbox } from "@/components/apps/ui/checkbox";
import { FrameSection } from "@/components/apps/ui/PageFrame";
import { Surface } from "@/components/apps/ui/Surface";
import { hexToRgba, useTheme } from "@/lib/palette";
import {
	type DraftState,
	OPTION_GROUPS,
	type OptionKey,
} from "./transmittalBuilderModels";

const TransmittalSection = FrameSection;

interface TransmittalBuilderOptionsSectionProps {
	draft: DraftState;
	handleOptionToggle: (key: OptionKey, checked: boolean) => void;
}

export function TransmittalBuilderOptionsSection({
	draft,
	handleOptionToggle,
}: TransmittalBuilderOptionsSectionProps) {
	const { palette } = useTheme();

	return (
		<TransmittalSection title="Transmittal Options">
			<div className="grid gap-4 px-2 sm:px-3 sm:grid-cols-2 lg:grid-cols-4">
				{OPTION_GROUPS.map((group) => (
					<Surface
						key={group.id}
						className="space-y-3 p-4"
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
	);
}
