import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import type { PlotDiffPreview } from "./GridGeneratorPanelModels";
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
import { useGridAutoCadPlotController } from "./useGridAutoCadPlotController";
import { useGridPlacementGenerationController } from "./useGridPlacementGenerationController";

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

	const runGeneration = useGridPlacementGenerationController({
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
	});

	const handlePlotToAutoCad = useGridAutoCadPlotController({
		addLog,
		backendConnected,
		conductors,
		config,
		placementSourceSignature,
		placements,
		rods,
		setLastPlottedSnapshot,
		showToast,
	});

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
