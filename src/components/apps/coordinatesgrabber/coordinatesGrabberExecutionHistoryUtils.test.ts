import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, type ExecutionHistoryEntry } from "./CoordinatesGrabberModels";
import {
	createHistoryEntry,
	resolveLayersToRun,
	restoreStateFromHistory,
} from "./coordinatesGrabberExecutionHistoryUtils";

describe("coordinatesGrabberExecutionHistoryUtils", () => {
	it("resolves selected layers before layerName fallback", () => {
		const selected = resolveLayersToRun({
			...DEFAULT_STATE,
			layerName: "FALLBACK",
			selectedLayers: ["A", "B"],
		});
		const fallback = resolveLayersToRun({
			...DEFAULT_STATE,
			layerName: "  MAIN  ",
			selectedLayers: [],
		});

		expect(selected).toEqual(["A", "B"]);
		expect(fallback).toEqual(["MAIN"]);
	});

	it("creates history entries with normalized config payload", () => {
		const entry = createHistoryEntry({
			durationSeconds: 1.25,
			filePath: "C:\\tmp\\out.xlsx",
			layersToRun: ["Layer-A", "Layer-B"],
			pointsCreated: 12,
			state: {
				...DEFAULT_STATE,
				decimalPlaces: 4,
				extractionStyle: "corners",
				includeModelspace: false,
				mode: "layer_search",
				pointPrefix: "PT",
				refScale: 2.5,
				scanSelection: true,
				startNumber: 100,
			},
			success: true,
		});

		expect(entry.success).toBe(true);
		expect(entry.pointsCreated).toBe(12);
		expect(entry.filePath).toContain("out.xlsx");
		expect(entry.config.selectedLayers).toEqual(["Layer-A", "Layer-B"]);
		expect(entry.config.startNumber).toBe(100);
	});

	it("restores extraction state from history while clamping invalid values", () => {
		const entry: ExecutionHistoryEntry = {
			config: {
				decimalPlaces: 30,
				extractionStyle: "center",
				includeModelspace: false,
				layerName: "Layer-X, Layer-Y",
				pointPrefix: "A",
				refScale: 0,
				scanSelection: true,
				selectedLayers: [],
				startNumber: 0,
			},
			duration: 1,
			success: true,
			timestamp: Date.now(),
		};

		const restored = restoreStateFromHistory(
			{
				...DEFAULT_STATE,
				decimalPlaces: 3,
				pointPrefix: "P",
				refScale: 1,
				startNumber: 10,
			},
			entry,
		);

		expect(restored.mode).toBe("layer_search");
		expect(restored.layerName).toBe("Layer-X");
		expect(restored.selectedLayers).toEqual(["Layer-X", "Layer-Y"]);
		expect(restored.decimalPlaces).toBe(12);
		expect(restored.startNumber).toBe(10);
		expect(restored.refScale).toBe(1);
		expect(restored.scanSelection).toBe(true);
	});
});
