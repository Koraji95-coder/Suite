import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberExportTabProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
	downloadResult: () => Promise<void>;
	openResultLocation: () => Promise<void>;
}

export function CoordinatesGrabberExportTab({
	state,
	palette,
	downloadResult,
	openResultLocation,
}: CoordinatesGrabberExportTabProps) {
	return (
		<div style={{ flex: 1, overflow: "auto" }}>
			<div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
				<div
					style={{
						padding: "12px",
						borderRadius: "8px",
						background: hexToRgba(palette.surface, 0.5),
						border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					}}
				>
					<h3
						style={{
							margin: "0 0 12px 0",
							fontSize: "13px",
							fontWeight: "600",
							color: palette.text,
							textTransform: "uppercase",
							letterSpacing: "0.5px",
						}}
					>
						Excel Export
					</h3>
					{state.excelPath ? (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "8px",
							}}
						>
							<div
								style={{
									padding: "8px 12px",
									borderRadius: "4px",
									background: hexToRgba("#51cf66", 0.1),
									border: `1px solid ${hexToRgba("#51cf66", 0.3)}`,
									color: "#51cf66",
									fontSize: "12px",
									fontWeight: "500",
								}}
							>
								OK {state.excelPath}
							</div>
							<button
								onClick={openResultLocation}
								style={{
									padding: "8px 12px",
									borderRadius: "4px",
									border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
									background: hexToRgba(palette.primary, 0.1),
									color: palette.primary,
									fontSize: "12px",
									fontWeight: "500",
									cursor: "pointer",
								}}
							>
								Open Export Location
							</button>
							<button
								onClick={downloadResult}
								style={{
									padding: "8px 12px",
									borderRadius: "4px",
									border: `1px solid ${hexToRgba("#4dabf7", 0.3)}`,
									background: hexToRgba("#4dabf7", 0.1),
									color: "#4dabf7",
									fontSize: "12px",
									fontWeight: "500",
									cursor: "pointer",
								}}
							>
								Download Excel
							</button>
						</div>
					) : (
						<p
							style={{
								margin: "0",
								color: palette.textMuted,
								fontSize: "12px",
							}}
						>
							No export yet. Run layer search to generate Excel file.
						</p>
					)}
				</div>

				<div
					style={{
						padding: "12px",
						borderRadius: "8px",
						background: hexToRgba(palette.surface, 0.5),
						border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					}}
				>
					<h3
						style={{
							margin: "0 0 12px 0",
							fontSize: "13px",
							fontWeight: "600",
							color: palette.text,
							textTransform: "uppercase",
							letterSpacing: "0.5px",
						}}
					>
						Output Format
					</h3>
					<p
						style={{
							margin: "0 0 8px 0",
							color: palette.textMuted,
							fontSize: "12px",
						}}
					>
						Excel table format with the following columns:
					</p>
					<ul
						style={{
							margin: "0",
							paddingLeft: "20px",
							color: palette.text,
							fontSize: "12px",
						}}
					>
						<li>Point ID</li>
						<li>East (X)</li>
						<li>North (Y)</li>
						<li>Elevation (Z)</li>
						<li>Layer</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
