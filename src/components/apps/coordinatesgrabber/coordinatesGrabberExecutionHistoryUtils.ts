import type {
	CoordinatesGrabberState,
	ExecutionHistoryEntry,
	PerformanceMetrics,
} from "./CoordinatesGrabberModels";

export function calculatePerformanceMetrics(
	startTime: number,
	pointsCreated: number,
	fileSize: number,
): PerformanceMetrics {
	const duration = (Date.now() - startTime) / 1000;
	return {
		duration,
		fileSize,
		geometriesProcessed: 0,
		pointsCreated,
		pointsPerSecond: duration > 0 ? Math.round((pointsCreated / duration) * 100) / 100 : 0,
		startTime,
	};
}

export function resolveLayersToRun(state: CoordinatesGrabberState): string[] {
	if (state.selectedLayers.length > 0) return state.selectedLayers;
	return state.layerName.trim() ? [state.layerName.trim()] : [];
}

function resolveHistoryConfig(
	state: CoordinatesGrabberState,
	layersToRun: string[],
): Partial<CoordinatesGrabberState> {
	return {
		decimalPlaces: state.decimalPlaces,
		extractionStyle: state.extractionStyle,
		includeModelspace: state.includeModelspace,
		layerName: layersToRun.join(", "),
		mode: state.mode,
		pointPrefix: state.pointPrefix,
		refScale: state.refScale,
		scanSelection: state.scanSelection,
		selectedLayers: layersToRun,
		startNumber: state.startNumber,
	};
}

export function createHistoryEntry(params: {
	state: CoordinatesGrabberState;
	layersToRun: string[];
	success: boolean;
	durationSeconds: number;
	pointsCreated?: number;
	filePath?: string;
	message?: string;
	fileSize?: number;
}): ExecutionHistoryEntry {
	return {
		config: resolveHistoryConfig(params.state, params.layersToRun),
		duration: params.durationSeconds,
		filePath: params.filePath,
		fileSize: params.fileSize,
		message: params.message,
		pointsCreated: params.pointsCreated,
		success: params.success,
		timestamp: Date.now(),
	};
}

export function restoreStateFromHistory(
	current: CoordinatesGrabberState,
	entry: ExecutionHistoryEntry,
): CoordinatesGrabberState {
	const config = entry.config;
	const selectedLayersFromConfig = Array.isArray(config.selectedLayers)
		? config.selectedLayers.filter(
				(layer): layer is string =>
					typeof layer === "string" && layer.trim().length > 0,
			)
		: [];
	const layerNameFromConfig =
		typeof config.layerName === "string" ? config.layerName : "";
	const parsedLayerList =
		selectedLayersFromConfig.length > 0
			? selectedLayersFromConfig
			: layerNameFromConfig
					.split(",")
					.map((layer) => layer.trim())
					.filter((layer) => layer.length > 0);
	const nextLayerName = parsedLayerList[0] || layerNameFromConfig;

	return {
		...current,
		decimalPlaces:
			typeof config.decimalPlaces === "number" &&
			Number.isFinite(config.decimalPlaces)
				? Math.min(12, Math.max(0, Math.floor(config.decimalPlaces)))
				: current.decimalPlaces,
		extractionStyle:
			config.extractionStyle === "center" ||
			config.extractionStyle === "corners"
				? config.extractionStyle
				: current.extractionStyle,
		includeModelspace:
			typeof config.includeModelspace === "boolean"
				? config.includeModelspace
				: current.includeModelspace,
		layerName: nextLayerName,
		mode: "layer_search",
		pointPrefix:
			typeof config.pointPrefix === "string" && config.pointPrefix.trim().length > 0
				? config.pointPrefix
				: current.pointPrefix,
		refScale:
			typeof config.refScale === "number" &&
			Number.isFinite(config.refScale) &&
			config.refScale > 0
				? config.refScale
				: current.refScale,
		scanSelection:
			typeof config.scanSelection === "boolean"
				? config.scanSelection
				: current.scanSelection,
		selectedLayers: parsedLayerList,
		startNumber:
			typeof config.startNumber === "number" &&
			Number.isFinite(config.startNumber) &&
			config.startNumber >= 1
				? Math.floor(config.startNumber)
				: current.startNumber,
	};
}
