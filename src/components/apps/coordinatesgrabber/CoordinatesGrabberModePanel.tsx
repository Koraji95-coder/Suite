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
	return (
		<div style={configCardStyle(palette)}>
			<h3 style={configTitleStyle(palette)}>Extraction Mode</h3>
			<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
				{(["polylines", "blocks", "layer_search"] as const).map((entryMode) => (
					<label
						key={entryMode}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						<input
							type="radio"
							name="mode"
							value={entryMode}
							checked={mode === entryMode}
							onChange={() => onModeChange(entryMode)}
							style={{ cursor: "pointer" }}
						/>
						<span
							style={{
								color: mode === entryMode ? palette.primary : palette.text,
							}}
						>
							{entryMode === "polylines" && "Polyline Vertices"}
							{entryMode === "blocks" && "Block Centers"}
							{entryMode === "layer_search" && "Layer Search"}
						</span>
					</label>
				))}
			</div>
		</div>
	);
}
