import type { ColorScheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberModePanel.module.css";

interface CoordinatesGrabberModePanelProps {
	mode: CoordinatesGrabberState["mode"];
	palette: ColorScheme;
	onModeChange: (newMode: CoordinatesGrabberState["mode"]) => void;
}

export function CoordinatesGrabberModePanel({
	mode,
	palette: _palette,
	onModeChange,
}: CoordinatesGrabberModePanelProps) {
	const modeOptions: Array<{
		value: CoordinatesGrabberState["mode"];
		label: string;
		description: string;
	}> = [
		{
			value: "layer_search",
			label: "Layer Search",
			description:
				"Web extraction currently runs through the layer-search API workflow.",
		},
	];

	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Extraction Workflow</h3>
			<p className={styles.description}>
				Block-center and polyline extraction remain in the legacy desktop tool
				until the API flow is expanded.
			</p>
			<div className={styles.list}>
				{modeOptions.map((entryMode) => (
					<label
						key={entryMode.value}
						className={cn(
							styles.row,
							mode === entryMode.value && styles.rowSelected,
						)}
					>
						<input
							type="radio"
							name="mode"
							value={entryMode.value}
							checked={mode === entryMode.value}
							onChange={() => onModeChange(entryMode.value)}
							className={styles.radio}
						/>
						<span className={styles.textBlock}>
							<span className={styles.label}>{entryMode.label}</span>
							<span className={styles.note}>{entryMode.description}</span>
						</span>
					</label>
				))}
			</div>
		</div>
	);
}
