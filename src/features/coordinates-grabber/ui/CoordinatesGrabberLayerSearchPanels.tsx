import type { Dispatch, SetStateAction } from "react";
import { cn } from "@/lib/utils";
import type { ColorScheme } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberLayerSearchPanels.module.css";

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
	palette: _palette,
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
			<div className={styles.card}>
				<h3 className={styles.title}>Layer Configuration</h3>
				<div className={styles.stack}>
					<div>
						<div className={styles.headerRow}>
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
								className={styles.secondaryButton}
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
								className={styles.input}
								name="coordinatesgrabberlayersearchpanels_select_78"
							>
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
								className={styles.input}
								name="coordinatesgrabberlayersearchpanels_input_96"
							/>
						)}
						<div className={styles.actionsRow}>
							<button
								type="button"
								onClick={handleAddLayer}
								className={styles.primaryActionButton}
							>
								+ Add Layer
							</button>
							<button
								type="button"
								onClick={handleClearLayers}
								disabled={state.selectedLayers.length === 0}
								className={styles.ghostActionButton}
							>
								Clear Layers
							</button>
						</div>
						<div className={styles.selectedLayers}>
							{state.selectedLayers.length === 0 ? (
								<div className={styles.emptyHint}>
									No layers added yet. Add one or more layers to run together.
								</div>
							) : (
								state.selectedLayers.map((layer) => (
									<div key={layer} className={styles.selectedLayerRow}>
										<span className={styles.selectedLayerLabel}>{layer}</span>
										<button
											type="button"
											onClick={() => handleRemoveLayer(layer)}
											className={styles.removeLayerButton}
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

			<div className={styles.card}>
				<h3 className={styles.title}>Reference Point Style</h3>
				<div className={styles.stack}>
					<label
						className={cn(
							styles.optionRow,
							state.extractionStyle === "center" && styles.optionActive,
						)}
					>
						<input
							type="radio"
							name="style"
							value="center"
							checked={state.extractionStyle === "center"}
							onChange={() => handleStyleChange("center")}
							className={styles.optionInput}
						/>
						<span className={styles.optionLabel}>
							Single block at geometry center
						</span>
					</label>
					<label
						className={cn(
							styles.optionRow,
							state.extractionStyle === "corners" && styles.optionActive,
						)}
					>
						<input
							type="radio"
							name="style"
							value="corners"
							checked={state.extractionStyle === "corners"}
							onChange={() => handleStyleChange("corners")}
							className={styles.optionInput}
						/>
						<span className={styles.optionLabel}>
							Four blocks at geometry corners (NW, NE, SW, SE)
						</span>
					</label>
				</div>
			</div>

			<div className={styles.card}>
				<h3 className={styles.title}>Scan Options</h3>
				<div className={styles.stack}>
					<label className={styles.optionRow}>
						<input
							type="checkbox"
							checked={state.scanSelection}
							onChange={(e) =>
								setState((prev) => ({
									...prev,
									scanSelection: e.target.checked,
								}))
							}
							className={styles.optionInput}
							name="coordinatesgrabberlayersearchpanels_input_280"
						/>
						<span className={styles.optionLabel}>Scan selected entities only</span>
					</label>
					<label className={styles.optionRow}>
						<input
							type="checkbox"
							checked={state.includeModelspace}
							onChange={(e) =>
								setState((prev) => ({
									...prev,
									includeModelspace: e.target.checked,
								}))
							}
							className={styles.optionInput}
							name="coordinatesgrabberlayersearchpanels_input_304"
						/>
						<span className={styles.optionLabel}>
							Include ModelSpace geometry (outside blocks)
						</span>
					</label>
				</div>
			</div>

			<div className={styles.card}>
				<h3 className={styles.title}>Reference Block</h3>
				<label htmlFor="coords-layer-search-ref-scale" className={styles.scaleLabel}>
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
					className={styles.input}
					name="coordinatesgrabberlayersearchpanels_input_327"
				/>
			</div>
		</>
	);
}
