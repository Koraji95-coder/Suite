import type { ColorScheme } from "@/lib/palette";
import {
	configCardStyle,
	configTitleStyle,
} from "./CoordinatesGrabberConfigStyles";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberModePanelProps {
	mode: CoordinatesGrabberState["mode"];
	palette: ColorScheme;
	onModeChange: (newMode: CoordinatesGrabberState["mode"]) => void;
}

export function CoordinatesGrabberModePanel({
	mode,
	palette,
	onModeChange,
}: CoordinatesGrabberModePanelProps) {
	const modeOptions: Array<{
		value: CoordinatesGrabberState["mode"];
		label: string;
		enabled: boolean;
	}> = [
		{ value: "layer_search", label: "Layer Search", enabled: true },
		{ value: "blocks", label: "Block Centers (coming soon)", enabled: false },
		{ value: "polylines", label: "Polyline Vertices (coming soon)", enabled: false },
	];

	return (
		<div style={configCardStyle(palette)}>
			<h3 style={configTitleStyle(palette)}>Extraction Mode</h3>
			<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
				{modeOptions.map((entryMode) => (
					<label
						key={entryMode.value}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							cursor: entryMode.enabled ? "pointer" : "not-allowed",
							fontSize: "13px",
							opacity: entryMode.enabled ? 1 : 0.65,
						}}
					>
						<input
							type="radio"
							name="mode"
							value={entryMode.value}
							checked={mode === entryMode.value}
							onChange={() => onModeChange(entryMode.value)}
							disabled={!entryMode.enabled}
							style={{ cursor: "pointer" }}
						/>
						<span
							style={{
								color:
									mode === entryMode.value && entryMode.enabled
										? palette.primary
										: palette.text,
							}}
						>
							{entryMode.label}
						</span>
					</label>
				))}
			</div>
		</div>
	);
}
