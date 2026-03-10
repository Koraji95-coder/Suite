import type { Dispatch, SetStateAction } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import {
	configCardStyle,
	configInputStyle,
	configTitleStyle,
} from "./CoordinatesGrabberConfigStyles";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberLayerSearchPanelsProps {
	state: CoordinatesGrabberState;
	setState: Dispatch<SetStateAction<CoordinatesGrabberState>>;
	palette: ColorScheme;
	availableLayers: string[];
	refreshLayers: () => Promise<string[]>;
	handleStyleChange: (style: "center" | "corners") => void;
	handleAddLayer: () => void;
	handleRemoveLayer: (layerToRemove: string) => void;
	handleClearLayers: () => void;
	addLog: (message: string) => void;
}

export function CoordinatesGrabberLayerSearchPanels({
	state,
	setState,
	palette,
	availableLayers,
	refreshLayers,
	handleStyleChange,
	handleAddLayer,
	handleRemoveLayer,
	handleClearLayers,
	addLog,
}: CoordinatesGrabberLayerSearchPanelsProps) {
	if (state.mode !== "layer_search") return null;

	return (
		<>
			<div style={configCardStyle(palette)}>
				<h3 style={configTitleStyle(palette)}>Layer Configuration</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<div>
						<div
							style={{
								fontSize: "12px",
								color: palette.textMuted,
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
							}}
						>
							<span>Layer Name:</span>
							<button
								onClick={async () => {
									addLog("[INFO] Refreshing layer list from AutoCAD...");
									const layers = await refreshLayers();
									if (layers.length > 0) {
										addLog(`[SUCCESS] Found ${layers.length} layers`);
									} else {
										addLog("[WARNING] No layers found");
									}
								}}
								style={{
									padding: "4px 8px",
									borderRadius: "3px",
									border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
									background: hexToRgba(palette.primary, 0.1),
									color: palette.primary,
									fontSize: "11px",
									cursor: "pointer",
									fontWeight: "500",
								}}
							>
								🔄 Refresh
							</button>
						</div>
						{availableLayers.length > 0 ? (
							<select
								value={state.layerName}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										layerName: e.target.value,
									}))
								}
								style={configInputStyle(palette)}
							 name="coordinatesgrabberlayersearchpanels_select_78">
								<option value="">-- Select a layer --</option>
								{availableLayers.map((layer) => (
									<option key={layer} value={layer}>
										{layer}
									</option>
								))}
							</select>
						) : (
							<input
								type="text"
								placeholder="No layers found. Type layer name or click Refresh..."
								value={state.layerName}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										layerName: e.target.value,
									}))
								}
								style={configInputStyle(palette)}
							name="coordinatesgrabberlayersearchpanels_input_96"
							/>
						)}
						<div
							style={{
								display: "flex",
								gap: "8px",
								marginTop: "8px",
								flexWrap: "wrap",
							}}
						>
							<button
								type="button"
								onClick={handleAddLayer}
								style={{
									padding: "6px 10px",
									borderRadius: "4px",
									border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
									background: hexToRgba(palette.primary, 0.1),
									color: palette.primary,
									fontSize: "11px",
									fontWeight: "600",
									cursor: "pointer",
								}}
							>
								+ Add Layer
							</button>
							<button
								type="button"
								onClick={handleClearLayers}
								disabled={state.selectedLayers.length === 0}
								style={{
									padding: "6px 10px",
									borderRadius: "4px",
									border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
									background: "transparent",
									color:
										state.selectedLayers.length === 0
											? palette.textMuted
											: palette.text,
									fontSize: "11px",
									fontWeight: "600",
									cursor:
										state.selectedLayers.length === 0
											? "not-allowed"
											: "pointer",
								}}
							>
								Clear Layers
							</button>
						</div>
						<div
							style={{
								marginTop: "8px",
								display: "flex",
								flexDirection: "column",
								gap: "6px",
							}}
						>
							{state.selectedLayers.length === 0 ? (
								<div style={{ fontSize: "11px", color: palette.textMuted }}>
									No layers added yet. Add one or more layers to run together.
								</div>
							) : (
								state.selectedLayers.map((layer) => (
									<div
										key={layer}
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											padding: "6px 8px",
											borderRadius: "4px",
											background: hexToRgba(palette.primary, 0.08),
											border: `1px solid ${hexToRgba(palette.primary, 0.18)}`,
											fontSize: "11px",
										}}
									>
										<span style={{ color: palette.text }}>{layer}</span>
										<button
											type="button"
											onClick={() => handleRemoveLayer(layer)}
											style={{
												border: "none",
												background: "transparent",
												color: palette.textMuted,
												cursor: "pointer",
												fontSize: "12px",
											}}
										>
											✕
										</button>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			</div>

			<div style={configCardStyle(palette)}>
				<h3 style={configTitleStyle(palette)}>Reference Point Style</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<label
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
							name="style"
							value="center"
							checked={state.extractionStyle === "center"}
							onChange={() => handleStyleChange("center")}
							style={{ cursor: "pointer" }}
						/>
						<span
							style={{
								color:
									state.extractionStyle === "center"
										? palette.primary
										: palette.text,
							}}
						>
							Single block at geometry center
						</span>
					</label>
					<label
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
							name="style"
							value="corners"
							checked={state.extractionStyle === "corners"}
							onChange={() => handleStyleChange("corners")}
							style={{ cursor: "pointer" }}
						/>
						<span
							style={{
								color:
									state.extractionStyle === "corners"
										? palette.primary
										: palette.text,
							}}
						>
							Four blocks at geometry corners (NW, NE, SW, SE)
						</span>
					</label>
				</div>
			</div>

			<div style={configCardStyle(palette)}>
				<h3 style={configTitleStyle(palette)}>Scan Options</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						<input
							type="checkbox"
							checked={state.scanSelection}
							onChange={(e) =>
								setState((prev) => ({
									...prev,
									scanSelection: e.target.checked,
								}))
							}
							style={{ cursor: "pointer" }}
						name="coordinatesgrabberlayersearchpanels_input_280"
						/>
						<span style={{ color: palette.text }}>
							Scan selected entities only
						</span>
					</label>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						<input
							type="checkbox"
							checked={state.includeModelspace}
							onChange={(e) =>
								setState((prev) => ({
									...prev,
									includeModelspace: e.target.checked,
								}))
							}
							style={{ cursor: "pointer" }}
						name="coordinatesgrabberlayersearchpanels_input_304"
						/>
						<span style={{ color: palette.text }}>
							Include ModelSpace geometry (outside blocks)
						</span>
					</label>
				</div>
			</div>

			<div style={configCardStyle(palette)}>
				<h3 style={configTitleStyle(palette)}>Reference Block</h3>
				<label
					htmlFor="coords-layer-search-ref-scale"
					style={{ fontSize: "12px", color: palette.textMuted }}
				>
					Scale:
				</label>
				<input
					id="coords-layer-search-ref-scale"
					type="number"
					value={state.refScale}
					onChange={(e) =>
						setState((prev) => ({
							...prev,
							refScale: Number(e.target.value) || 1,
						}))
					}
					min="0.0001"
					step="0.1"
					style={configInputStyle(palette)}
				name="coordinatesgrabberlayersearchpanels_input_327"
				/>
			</div>
		</>
	);
}
