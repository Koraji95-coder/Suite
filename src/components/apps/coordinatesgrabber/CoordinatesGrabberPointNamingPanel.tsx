import type { Dispatch, SetStateAction } from "react";
import type { ColorScheme } from "@/lib/palette";
import {
	configCardStyle,
	configInputStyle,
	configTitleStyle,
} from "./CoordinatesGrabberConfigStyles";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberPointNamingPanelProps {
	state: CoordinatesGrabberState;
	setState: Dispatch<SetStateAction<CoordinatesGrabberState>>;
	palette: ColorScheme;
}

export function CoordinatesGrabberPointNamingPanel({
	state,
	setState,
	palette,
}: CoordinatesGrabberPointNamingPanelProps) {
	return (
		<div style={configCardStyle(palette)}>
			<h3 style={configTitleStyle(palette)}>Point Naming</h3>
			<div
				style={{
					display: "grid",
					gap: "8px",
					gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
				}}
			>
				<div>
					<label
						htmlFor="coords-point-prefix"
						style={{ fontSize: "12px", color: palette.textMuted }}
					>
						Prefix:
					</label>
					<input
						id="coords-point-prefix"
						name="coords_point_prefix"
						type="text"
						value={state.pointPrefix}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								pointPrefix: e.target.value,
							}))
						}
						style={configInputStyle(palette)}
					/>
				</div>
				<div>
					<label
						htmlFor="coords-point-start-number"
						style={{ fontSize: "12px", color: palette.textMuted }}
					>
						Start #:
					</label>
					<input
						id="coords-point-start-number"
						name="coords_point_start_number"
						type="number"
						value={state.startNumber}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								startNumber: parseInt(e.target.value, 10) || 1,
							}))
						}
						min="1"
						style={configInputStyle(palette)}
					/>
				</div>
				<div>
					<label
						htmlFor="coords-point-decimals"
						style={{ fontSize: "12px", color: palette.textMuted }}
					>
						Decimals:
					</label>
					<input
						id="coords-point-decimals"
						name="coords_point_decimals"
						type="number"
						value={state.decimalPlaces}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								decimalPlaces: parseInt(e.target.value, 10) || 3,
							}))
						}
						min="0"
						max="12"
						style={configInputStyle(palette)}
					/>
				</div>
			</div>
		</div>
	);
}
