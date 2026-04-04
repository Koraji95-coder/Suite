import { useCallback } from "react";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import { computeGridMaxY, generatePlacements, totalConductorLength } from "./gridEngine";
import { dataSignature } from "./gridGeneratorStateShared";
import type { GridConductor, GridConfig, GridPlacement, GridRod } from "./types";

interface UseGridPlacementGenerationControllerOptions {
	addLog: (source: "grabber" | "generator" | "system", message: string) => void;
	conductors: GridConductor[];
	config: GridConfig;
	countPlacementType: (
		targetType: GridPlacement["type"],
		list: GridPlacement[],
	) => number;
	currentDesignId: string | null;
	placementLock: boolean;
	placements: GridPlacement[];
	rods: GridRod[];
	setCrossCount: (value: number) => void;
	setGenerating: (value: boolean) => void;
	setPlacementSourceSignature: (value: string) => void;
	setPlacements: (rows: GridPlacement[]) => void;
	setSegmentCount: (value: number) => void;
	setTeeCount: (value: number) => void;
	showToast: (
		type: "success" | "error" | "warning" | "info",
		message: string,
	) => void;
}

export function useGridPlacementGenerationController({
	addLog,
	conductors,
	config,
	countPlacementType,
	currentDesignId,
	placementLock,
	placements,
	rods,
	setCrossCount,
	setGenerating,
	setPlacementSourceSignature,
	setPlacements,
	setSegmentCount,
	setTeeCount,
	showToast,
}: UseGridPlacementGenerationControllerOptions) {
	return useCallback(() => {
		if (conductors.length === 0) {
			showToast("error", "No conductor data to process");
			return;
		}
		setGenerating(true);
		addLog("generator", "[PROCESSING] Generating grid placements...");

		requestAnimationFrame(() => {
			const maxY = computeGridMaxY(rods, conductors);
			const nextConfig = { ...config, grid_max_y: maxY };
			const result = generatePlacements(rods, conductors, nextConfig);
			const effectivePlacements =
				placementLock && placements.length > 0 ? placements : result.placements;

			setPlacements(effectivePlacements);
			setSegmentCount(result.segmentCount);
			if (placementLock && placements.length > 0) {
				setTeeCount(countPlacementType("TEE", placements));
				setCrossCount(countPlacementType("CROSS", placements));
				addLog(
					"generator",
					"[WARNING] Placement lock is ON. Generated placements were not applied.",
				);
			} else {
				setTeeCount(result.teeCount);
				setCrossCount(result.crossCount);
			}
			setPlacementSourceSignature(dataSignature(rods, conductors));

			if (currentDesignId) {
				void supabase.from("ground_grid_results").insert({
					cross_count:
						placementLock && placements.length > 0
							? countPlacementType("CROSS", placements)
							: result.crossCount,
					design_id: currentDesignId,
					placements: effectivePlacements as unknown as Json,
					rod_count: rods.length,
					segment_count: result.segmentCount,
					tee_count:
						placementLock && placements.length > 0
							? countPlacementType("TEE", placements)
							: result.teeCount,
					total_conductor_length: totalConductorLength(conductors),
				});
			}

			setGenerating(false);
			addLog(
				"generator",
				`[SUCCESS] Generated ${result.placements.length} placements (${result.teeCount} tees, ${result.crossCount} crosses, ${conductors.length} conductors)`,
			);
			showToast("success", `Generated: ${result.placements.length} placements`);
		});
	}, [
		addLog,
		conductors,
		config,
		countPlacementType,
		currentDesignId,
		placementLock,
		placements,
		rods,
		setCrossCount,
		setGenerating,
		setPlacementSourceSignature,
		setPlacements,
		setSegmentCount,
		setTeeCount,
		showToast,
	]);
}
