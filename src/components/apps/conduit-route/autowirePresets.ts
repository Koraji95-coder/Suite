export interface AutoWirePresetOption {
	id: string;
	label: string;
}

// Unified preset catalog for the AutoWire app. This centralizes presets that
// previously drifted between Conduit Route and legacy AutoWire prototypes.
export const AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS: readonly AutoWirePresetOption[] =
	[
		{ id: "", label: "Manual Rules" },
		{ id: "substation_default", label: "Substation Default" },
		{ id: "industrial_plant", label: "Industrial Plant" },
		{ id: "utility_yard", label: "Utility Yard" },
	];
