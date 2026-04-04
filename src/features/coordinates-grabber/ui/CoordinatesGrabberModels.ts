import type { CoordinatePoint } from "./types";

export interface CoordinatesGrabberState {
	mode: "polylines" | "blocks" | "layer_search";
	layerName: string;
	selectedLayers: string[];
	extractionStyle: "center" | "corners";
	refScale: number;
	pointPrefix: string;
	startNumber: number;
	decimalPlaces: number;
	scanSelection: boolean;
	includeModelspace: boolean;
	activeTab: "config" | "export" | "history" | "yaml";
	excelPath: string;
	isRunning: boolean;
	selectionCount: number;
	executionHistory: ExecutionHistoryEntry[];
	validationErrors: string[];
	performanceMetrics?: PerformanceMetrics;
	coordinateData: CoordinatePoint[];
}

export interface ExecutionHistoryEntry {
	timestamp: number;
	config: Partial<CoordinatesGrabberState>;
	success: boolean;
	pointsCreated?: number;
	duration: number;
	fileSize?: number;
	filePath?: string;
	message?: string;
}

export interface PerformanceMetrics {
	startTime: number;
	endTime?: number;
	duration: number;
	pointsCreated: number;
	geometriesProcessed: number;
	fileSize: number;
	pointsPerSecond: number;
}

export interface LiveBackendStatus {
	autocadRunning: boolean;
	drawingOpen: boolean;
	drawingName: string | null;
	error: string | null;
	lastUpdated: number | null;
}

export const DEFAULT_STATE: CoordinatesGrabberState = {
	mode: "layer_search",
	layerName: "",
	selectedLayers: [],
	extractionStyle: "center",
	refScale: 1,
	pointPrefix: "P",
	startNumber: 1,
	decimalPlaces: 3,
	scanSelection: false,
	includeModelspace: true,
	activeTab: "config",
	excelPath: "",
	isRunning: false,
	selectionCount: 0,
	executionHistory: [],
	validationErrors: [],
	coordinateData: [],
};
