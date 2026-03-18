import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import { coordinatesGrabberService } from "./coordinatesGrabberService";
import type { PlotDiffPreview } from "./GridGeneratorPanelModels";
import {
	computeGridMaxY,
	generatePlacements,
	totalConductorLength,
} from "./gridEngine";
import {
	conductorKey,
	coordinateBucketKey,
	dataSignature,
	placementBaseKey,
} from "./gridGeneratorStateShared";
import type {
	GridConductor,
	GridConfig,
	GridPlacement,
	GridRod,
} from "./types";

type PlotSnapshot = {
	conductors: GridConductor[];
	placements: GridPlacement[];
};

interface UseGridPlacementControllerOptions {
	addLog: (source: "grabber" | "generator" | "system", message: string) => void;
	backendConnected: boolean;
	config: GridConfig;
	currentDesignId: string | null;
	rods: GridRod[];
	conductors: GridConductor[];
}

export function useGridPlacementController({
	addLog,
	backendConnected,
	config,
	currentDesignId,
	rods,
	conductors,
}: UseGridPlacementControllerOptions) {
	const { showToast } = useToast();
	const [placements, setPlacements] = useState<GridPlacement[]>([]);
	const [segmentCount, setSegmentCount] = useState(0);
	const [teeCount, setTeeCount] = useState(0);
	const [crossCount, setCrossCount] = useState(0);
	const [generating, setGenerating] = useState(false);
	const [placementLock, setPlacementLock] = useState(false);
	const [placementSourceSignature, setPlacementSourceSignature] =
		useState<string>("");
	const [lastPlottedSnapshot, setLastPlottedSnapshot] =
		useState<PlotSnapshot | null>(null);

	const invalidateGeneratedPlacements = useCallback(() => {
		setPlacements([]);
		setSegmentCount(0);
		setTeeCount(0);
		setCrossCount(0);
		setPlacementSourceSignature("");
	}, []);

	const countPlacementType = useCallback(
		(targetType: GridPlacement["type"], list: GridPlacement[]) =>
			list.filter((placement) => placement.type === targetType).length,
		[],
	);

	const plotDiffPreview = useMemo<PlotDiffPreview>(() => {
		const issues: PlotDiffPreview["issues"] = [];
		const stalePlacements =
			placements.length > 0 &&
			placementSourceSignature !== dataSignature(rods, conductors);
		if (stalePlacements) {
			issues.push({
				severity: "error",
				message: "Placements are stale relative to rods/conductors. Regenerate before plotting.",
			});
		}

		const validTypes = new Set(["ROD", "TEE", "CROSS", "GROUND_ROD_WITH_TEST_WELL"]);
		const unknownTypes = Array.from(
			new Set(
				placements
					.map((placement) => placement.type)
					.filter((type) => !validTypes.has(type)),
			),
		);
		if (unknownTypes.length > 0) {
			issues.push({
				severity: "error",
				message: `Unknown placement type(s): ${unknownTypes.join(", ")}`,
			});
		}

		const placementBuckets = new Map<string, Set<string>>();
		for (const placement of placements) {
			const xy = coordinateBucketKey(placement.grid_x, placement.grid_y);
			const set = placementBuckets.get(xy) || new Set<string>();
			set.add(placement.type);
			placementBuckets.set(xy, set);
		}
		const hardCollisions = Array.from(placementBuckets.values()).filter(
			(types) =>
				types.size > 1 &&
				!(types.size === 2 && types.has("ROD") && types.has("GROUND_ROD_WITH_TEST_WELL")),
		).length;
		if (hardCollisions > 0) {
			issues.push({
				severity: "error",
				message: `Detected ${hardCollisions} placement point collision(s) with mixed types.`,
			});
		}

		if (conductors.length > 0 && placements.length === 0) {
			issues.push({
				severity: "warning",
				message: "No placements are present. Run Generate Grid before plotting.",
			});
		}
		if (!backendConnected) {
			issues.push({
				severity: "warning",
				message: "Backend is currently offline.",
			});
		}
		if (placementLock) {
			issues.push({
				severity: "info",
				message: "Placement lock is ON. Generate Grid keeps existing placements.",
			});
		}

		if (!lastPlottedSnapshot) {
			return {
				hasBaseline: false,
				conductorsAdded: conductors.length,
				conductorsRemoved: 0,
				placementsAdded: placements.length,
				placementsRemoved: 0,
				placementsRotationChanged: 0,
				placementTypeSwaps: 0,
				issues,
				canPlot: issues.every((issue) => issue.severity !== "error"),
			};
		}

		const currentConductorSet = new Set(conductors.map(conductorKey));
		const previousConductorSet = new Set(lastPlottedSnapshot.conductors.map(conductorKey));
		const conductorsAdded = Array.from(currentConductorSet).filter(
			(key) => !previousConductorSet.has(key),
		).length;
		const conductorsRemoved = Array.from(previousConductorSet).filter(
			(key) => !currentConductorSet.has(key),
		).length;

		const currentPlacementMap = new Map(
			placements.map((placement) => [placementBaseKey(placement), placement]),
		);
		const previousPlacementMap = new Map(
			lastPlottedSnapshot.placements.map((placement) => [
				placementBaseKey(placement),
				placement,
			]),
		);
		const placementsAdded = Array.from(currentPlacementMap.keys()).filter(
			(key) => !previousPlacementMap.has(key),
		).length;
		const placementsRemoved = Array.from(previousPlacementMap.keys()).filter(
			(key) => !currentPlacementMap.has(key),
		).length;

		let placementsRotationChanged = 0;
		for (const [key, currentPlacement] of currentPlacementMap) {
			const previousPlacement = previousPlacementMap.get(key);
			if (!previousPlacement) continue;
			if (
				Math.abs(currentPlacement.rotation_deg - previousPlacement.rotation_deg) >
				1e-6
			) {
				placementsRotationChanged++;
			}
		}

		const typeByCoordinateCurrent = new Map<string, string>();
		for (const placement of placements) {
			typeByCoordinateCurrent.set(
				coordinateBucketKey(placement.grid_x, placement.grid_y),
				placement.type,
			);
		}
		const typeByCoordinatePrevious = new Map<string, string>();
		for (const placement of lastPlottedSnapshot.placements) {
			typeByCoordinatePrevious.set(
				coordinateBucketKey(placement.grid_x, placement.grid_y),
				placement.type,
			);
		}
		let placementTypeSwaps = 0;
		for (const [xy, currType] of typeByCoordinateCurrent) {
			const prevType = typeByCoordinatePrevious.get(xy);
			if (prevType && prevType !== currType) placementTypeSwaps++;
		}

		return {
			hasBaseline: true,
			conductorsAdded,
			conductorsRemoved,
			placementsAdded,
			placementsRemoved,
			placementsRotationChanged,
			placementTypeSwaps,
			issues,
			canPlot: issues.every((issue) => issue.severity !== "error"),
		};
	}, [
		backendConnected,
		conductors,
		lastPlottedSnapshot,
		placementLock,
		placementSourceSignature,
		placements,
		rods,
	]);

	const runGeneration = useCallback(() => {
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
					design_id: currentDesignId,
					placements: effectivePlacements as unknown as Json,
					segment_count: result.segmentCount,
					tee_count:
						placementLock && placements.length > 0
							? countPlacementType("TEE", placements)
							: result.teeCount,
					cross_count:
						placementLock && placements.length > 0
							? countPlacementType("CROSS", placements)
							: result.crossCount,
					rod_count: rods.length,
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
		conductors,
		showToast,
		addLog,
		rods,
		config,
		placementLock,
		placements,
		countPlacementType,
		currentDesignId,
	]);

	const handlePlotToAutoCad = useCallback(async () => {
		if (!backendConnected) {
			showToast(
				"error",
				"AutoCAD backend is offline. Check the log for more details.",
			);
			addLog(
				"generator",
				"[ERROR] Cannot plot to AutoCAD - backend is not connected",
			);
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
				y1: conductor.y1,
				x2: conductor.x2,
				y2: conductor.y2,
			})),
			placements: placements.map((placement) => ({
				type: placement.type,
				grid_x: placement.grid_x,
				grid_y: placement.grid_y,
				autocad_x: placement.autocad_x,
				autocad_y: placement.autocad_y,
				rotation_deg: placement.rotation_deg,
			})),
			config: {
				origin_x_feet: plotConfig.origin_x_feet,
				origin_x_inches: plotConfig.origin_x_inches,
				origin_y_feet: plotConfig.origin_y_feet,
				origin_y_inches: plotConfig.origin_y_inches,
				block_scale: plotConfig.block_scale,
				layer_name: plotConfig.layer_name,
				grid_max_y: plotConfig.grid_max_y,
			},
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
		backendConnected,
		showToast,
		addLog,
		conductors,
		placements,
		config,
		rods,
		placementSourceSignature,
	]);

	return {
		countPlacementType,
		crossCount,
		generating,
		handlePlotToAutoCad,
		invalidateGeneratedPlacements,
		lastPlottedSnapshot,
		placementLock,
		placementSourceSignature,
		placements,
		plotDiffPreview,
		runGeneration,
		segmentCount,
		setCrossCount,
		setGenerating,
		setLastPlottedSnapshot,
		setPlacementLock,
		setPlacementSourceSignature,
		setPlacements,
		setSegmentCount,
		setTeeCount,
		teeCount,
	};
}

