import { useCallback, useEffect } from "react";
import { dataSignature } from "./gridGeneratorStateShared";
import type { GridConductor, GridPlacement, GridRod } from "./types";
import { useGridHistory } from "./useGridHistory";

interface UseGridEditingHistoryControllerOptions {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	countPlacementType: (
		targetType: GridPlacement["type"],
		list: GridPlacement[],
	) => number;
	invalidateGeneratedPlacements: () => void;
	setRods: (rows: GridRod[]) => void;
	setConductors: (rows: GridConductor[]) => void;
	setPlacements: (rows: GridPlacement[]) => void;
	setTeeCount: (count: number) => void;
	setCrossCount: (count: number) => void;
	setSegmentCount: (count: number) => void;
	setPlacementSourceSignature: (value: string) => void;
}

export function useGridEditingHistoryController({
	rods,
	conductors,
	placements,
	countPlacementType,
	invalidateGeneratedPlacements,
	setRods,
	setConductors,
	setPlacements,
	setTeeCount,
	setCrossCount,
	setSegmentCount,
	setPlacementSourceSignature,
}: UseGridEditingHistoryControllerOptions) {
	const { pushSnapshot, undo, redo, canUndo, canRedo } = useGridHistory();

	const handleUndo = useCallback(() => {
		const snapshot = undo(rods, conductors, placements);
		if (snapshot) {
			setRods(snapshot.rods);
			setConductors(snapshot.conductors);
			setPlacements(snapshot.placements);
			setPlacementSourceSignature(
				snapshot.placements.length > 0
					? dataSignature(snapshot.rods, snapshot.conductors)
					: "",
			);
			setTeeCount(countPlacementType("TEE", snapshot.placements));
			setCrossCount(countPlacementType("CROSS", snapshot.placements));
			setSegmentCount(0);
		}
	}, [
		undo,
		rods,
		conductors,
		placements,
		setRods,
		setConductors,
		setPlacements,
		setPlacementSourceSignature,
		setTeeCount,
		setCrossCount,
		setSegmentCount,
		countPlacementType,
	]);

	const handleRedo = useCallback(() => {
		const snapshot = redo(rods, conductors, placements);
		if (snapshot) {
			setRods(snapshot.rods);
			setConductors(snapshot.conductors);
			setPlacements(snapshot.placements);
			setPlacementSourceSignature(
				snapshot.placements.length > 0
					? dataSignature(snapshot.rods, snapshot.conductors)
					: "",
			);
			setTeeCount(countPlacementType("TEE", snapshot.placements));
			setCrossCount(countPlacementType("CROSS", snapshot.placements));
			setSegmentCount(0);
		}
	}, [
		redo,
		rods,
		conductors,
		placements,
		setRods,
		setConductors,
		setPlacements,
		setPlacementSourceSignature,
		setTeeCount,
		setCrossCount,
		setSegmentCount,
		countPlacementType,
	]);

	const handleManualRodsChange = useCallback(
		(newRods: GridRod[]) => {
			pushSnapshot(rods, conductors, placements);
			setRods(newRods);
			invalidateGeneratedPlacements();
		},
		[
			pushSnapshot,
			rods,
			conductors,
			placements,
			setRods,
			invalidateGeneratedPlacements,
		],
	);

	const handleManualConductorsChange = useCallback(
		(newConductors: GridConductor[]) => {
			pushSnapshot(rods, conductors, placements);
			setConductors(newConductors);
			invalidateGeneratedPlacements();
		},
		[
			pushSnapshot,
			rods,
			conductors,
			placements,
			setConductors,
			invalidateGeneratedPlacements,
		],
	);

	const handleManualPlacementsChange = useCallback(
		(newPlacements: GridPlacement[]) => {
			setPlacements(newPlacements);
		},
		[setPlacements],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
			if ((event.ctrlKey || event.metaKey) && event.key === "z") {
				if (event.shiftKey) {
					event.preventDefault();
					handleRedo();
				} else {
					event.preventDefault();
					handleUndo();
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleUndo, handleRedo]);

	return {
		canRedo,
		canUndo,
		handleManualConductorsChange,
		handleManualPlacementsChange,
		handleManualRodsChange,
		handleRedo,
		handleUndo,
		pushSnapshot,
	};
}

