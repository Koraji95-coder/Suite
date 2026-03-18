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
		enabled: boolean;
	}> = [
		{ value: "layer_search", label: "Layer Search", enabled: true },
		{ value: "blocks", label: "Block Centers (coming soon)", enabled: false },
		{
			value: "polylines",
			label: "Polyline Vertices (coming soon)",
			enabled: false,
		},
	];

	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Extraction Mode</h3>
			<div className={styles.list}>
				{modeOptions.map((entryMode) => (
					<label
						key={entryMode.value}
						className={cn(
							styles.row,
							!entryMode.enabled && styles.rowDisabled,
							mode === entryMode.value &&
								entryMode.enabled &&
								styles.rowSelected,
						)}
					>
						<input
							type="radio"
							name="mode"
							value={entryMode.value}
							checked={mode === entryMode.value}
							onChange={() => onModeChange(entryMode.value)}
							disabled={!entryMode.enabled}
							className={styles.radio}
						/>
						<span className={styles.label}>{entryMode.label}</span>
					</label>
				))}
			</div>
		</div>
	);
}
