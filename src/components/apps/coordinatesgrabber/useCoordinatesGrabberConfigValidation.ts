import { useCallback } from "react";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

export function validateCoordinatesGrabberConfig(
	config: CoordinatesGrabberState,
): string[] {
	const errors: string[] = [];

	if (config.mode !== "layer_search") {
		errors.push("The web workflow currently supports only layer-search extraction");
	}

	const hasLayerSelection =
		config.selectedLayers.length > 0 || !!config.layerName.trim();
	if (!hasLayerSelection) {
		errors.push("Add at least one layer before starting extraction");
	}

	if (!config.pointPrefix.trim()) {
		errors.push("Point prefix cannot be empty");
	}

	if (config.startNumber < 1) {
		errors.push("Start number must be at least 1");
	}

	if (config.decimalPlaces < 0 || config.decimalPlaces > 12) {
		errors.push("Decimal places must be between 0 and 12");
	}

	if (config.pointPrefix.length > 10) {
		errors.push("Point prefix must be 10 characters or less");
	}

	if (!Number.isFinite(config.refScale) || config.refScale <= 0) {
		errors.push("Scale must be greater than 0");
	}

	return errors;
}

interface UseCoordinatesGrabberConfigValidationOptions {
	addLog: (message: string) => void;
	stateLayerName: string;
	setState: (
		updater:
			| CoordinatesGrabberState
			| ((prev: CoordinatesGrabberState) => CoordinatesGrabberState),
	) => void;
}

export function useCoordinatesGrabberConfigValidation({
	addLog,
	stateLayerName,
	setState,
}: UseCoordinatesGrabberConfigValidationOptions) {
	const handleModeChange = useCallback(
		(newMode: CoordinatesGrabberState["mode"]) => {
			if (newMode !== "layer_search") {
				addLog(
					`[INFO] '${newMode}' remains available only in the legacy desktop tool. Staying on layer_search.`,
				);
				setState((prev) => ({ ...prev, mode: "layer_search" }));
				return;
			}
			setState((prev) => ({ ...prev, mode: newMode }));
			addLog(`Mode changed to: ${newMode}`);
		},
		[addLog, setState],
	);

	const handleStyleChange = useCallback(
		(style: "center" | "corners") => {
			setState((prev) => ({ ...prev, extractionStyle: style }));
			addLog(`Extraction style changed to: ${style}`);
		},
		[addLog, setState],
	);

	const handleAddLayer = useCallback(() => {
		const layerToAdd = stateLayerName.trim();
		if (!layerToAdd) {
			addLog("[WARNING] Select or enter a layer before adding");
			return;
		}
		setState((prev) => {
			if (prev.selectedLayers.includes(layerToAdd)) {
				return prev;
			}
			return { ...prev, selectedLayers: [...prev.selectedLayers, layerToAdd] };
		});
		addLog(`[INFO] Added layer: ${layerToAdd}`);
	}, [stateLayerName, addLog, setState]);

	const handleRemoveLayer = useCallback(
		(layerToRemove: string) => {
			setState((prev) => ({
				...prev,
				selectedLayers: prev.selectedLayers.filter(
					(layer) => layer !== layerToRemove,
				),
			}));
			addLog(`[INFO] Removed layer: ${layerToRemove}`);
		},
		[addLog, setState],
	);

	const handleClearLayers = useCallback(() => {
		setState((prev) => ({ ...prev, selectedLayers: [] }));
		addLog("[INFO] Cleared selected layers");
	}, [addLog, setState]);

	return {
		handleAddLayer,
		handleClearLayers,
		handleModeChange,
		handleRemoveLayer,
		handleStyleChange,
	};
}
