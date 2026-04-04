import { useCallback } from "react";
import { coordinatesGrabberService } from "@/features/cad-runtime/coordinatesGrabberService";
import { computeGridMaxY } from "./gridEngine";
import { dataSignature } from "./gridGeneratorStateShared";
import type { GridConductor, GridConfig, GridPlacement, GridRod } from "./types";

interface UseGridAutoCadPlotControllerOptions {
	addLog: (source: "grabber" | "generator" | "system", message: string) => void;
	backendConnected: boolean;
	conductors: GridConductor[];
	config: GridConfig;
	placementSourceSignature: string;
	placements: GridPlacement[];
	rods: GridRod[];
	setLastPlottedSnapshot: (value: {
		conductors: GridConductor[];
		placements: GridPlacement[];
	} | null) => void;
	showToast: (
		type: "success" | "error" | "warning" | "info",
		message: string,
	) => void;
}

export function useGridAutoCadPlotController({
	addLog,
	backendConnected,
	conductors,
	config,
	placementSourceSignature,
	placements,
	rods,
	setLastPlottedSnapshot,
	showToast,
}: UseGridAutoCadPlotControllerOptions) {
	return useCallback(async () => {
		if (!backendConnected) {
			showToast(
				"error",
				"AutoCAD backend is offline. Check the log for more details.",
			);
			addLog("generator", "[ERROR] Cannot plot to AutoCAD - backend is not connected");
			return;
		}
		if (conductors.length === 0 && placements.length === 0) {
			addLog("generator", "[ERROR] Nothing to plot - generate or load grid data first");
			showToast("error", "Nothing to plot");
			return;
		}
		if (
			placements.length > 0 &&
			placementSourceSignature !== dataSignature(rods, conductors)
		) {
			addLog(
				"generator",
				"[ERROR] Placements are stale relative to rods/conductors. Regenerate before plotting.",
			);
			showToast("error", "Placements are stale. Regenerate grid first.");
			return;
		}

		addLog("generator", "[PROCESSING] Plotting to active AutoCAD drawing...");
		const plotConfig = {
			...config,
			grid_max_y: computeGridMaxY(rods, conductors),
		};
		const result = await coordinatesGrabberService.plotGroundGrid({
			conductors: conductors.map((conductor) => ({
				x1: conductor.x1,
				x2: conductor.x2,
				y1: conductor.y1,
				y2: conductor.y2,
			})),
			config: {
				block_scale: plotConfig.block_scale,
				grid_max_y: plotConfig.grid_max_y,
				layer_name: plotConfig.layer_name,
				origin_x_feet: plotConfig.origin_x_feet,
				origin_x_inches: plotConfig.origin_x_inches,
				origin_y_feet: plotConfig.origin_y_feet,
				origin_y_inches: plotConfig.origin_y_inches,
			},
			placements: placements.map((placement) => ({
				autocad_x: placement.autocad_x,
				autocad_y: placement.autocad_y,
				grid_x: placement.grid_x,
				grid_y: placement.grid_y,
				rotation_deg: placement.rotation_deg,
				type: placement.type,
			})),
		});

		if (!result.success) {
			addLog(
				"generator",
				`[ERROR] Plot failed: ${result.error_details || result.message}`,
			);
			showToast("error", result.message);
			return;
		}

		setLastPlottedSnapshot({
			conductors: conductors.map((conductor) => ({ ...conductor })),
			placements: placements.map((placement) => ({ ...placement })),
		});

		const testWellInfo = result.test_well_block_name
			? ` (test-well block: ${result.test_well_block_name})`
			: "";
		addLog("generator", `[SUCCESS] ${result.message}${testWellInfo}`);
		showToast(
			"success",
			`Plotted ${result.lines_drawn} lines and ${result.blocks_inserted} placements`,
		);
	}, [
		addLog,
		backendConnected,
		conductors,
		config,
		placementSourceSignature,
		placements,
		rods,
		setLastPlottedSnapshot,
		showToast,
	]);
}
