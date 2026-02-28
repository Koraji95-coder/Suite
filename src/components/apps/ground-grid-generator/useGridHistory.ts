// src/components/apps/ground-grid/useGridHistory.ts
import { useCallback, useRef, useState } from "react";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridSnapshot {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
}

const MAX_HISTORY = 50;

function cloneRods(rods: GridRod[]): GridRod[] {
	// shallow clone each item to prevent later mutation from affecting history
	return rods.map((r) => ({ ...r }));
}

function cloneConductors(conductors: GridConductor[]): GridConductor[] {
	return conductors.map((c) => ({ ...c }));
}

function clonePlacements(placements: GridPlacement[]): GridPlacement[] {
	return placements.map((placement) => ({ ...placement }));
}

export function useGridHistory() {
	const [past, setPast] = useState<GridSnapshot[]>([]);
	const [future, setFuture] = useState<GridSnapshot[]>([]);
	const isUndoRedo = useRef(false);

	const pushSnapshot = useCallback(
		(
			rods: GridRod[],
			conductors: GridConductor[],
			placements: GridPlacement[],
		) => {
		if (isUndoRedo.current) {
			isUndoRedo.current = false;
			return;
		}

		const snapshot: GridSnapshot = {
			rods: cloneRods(rods),
			conductors: cloneConductors(conductors),
			placements: clonePlacements(placements),
		};

		setPast((prev) => {
			const next = [...prev, snapshot];
			if (next.length > MAX_HISTORY) next.shift();
			return next;
		});
		setFuture([]);
		},
		[],
	);

	const undo = useCallback(
		(
			currentRods: GridRod[],
			currentConductors: GridConductor[],
			currentPlacements: GridPlacement[],
		) => {
			if (past.length === 0) return null;

			const snapshot = past[past.length - 1];

			setPast((prev) => prev.slice(0, -1));
			setFuture((prev) => [
				...prev,
				{
					rods: cloneRods(currentRods),
					conductors: cloneConductors(currentConductors),
					placements: clonePlacements(currentPlacements),
				},
			]);

			isUndoRedo.current = true;

			return {
				rods: cloneRods(snapshot.rods),
				conductors: cloneConductors(snapshot.conductors),
				placements: clonePlacements(snapshot.placements),
			} satisfies GridSnapshot;
		},
		[past],
	);

	const redo = useCallback(
		(
			currentRods: GridRod[],
			currentConductors: GridConductor[],
			currentPlacements: GridPlacement[],
		) => {
			if (future.length === 0) return null;

			const snapshot = future[future.length - 1];

			setFuture((prev) => prev.slice(0, -1));
			setPast((prev) => [
				...prev,
				{
					rods: cloneRods(currentRods),
					conductors: cloneConductors(currentConductors),
					placements: clonePlacements(currentPlacements),
				},
			]);

			isUndoRedo.current = true;

			return {
				rods: cloneRods(snapshot.rods),
				conductors: cloneConductors(snapshot.conductors),
				placements: clonePlacements(snapshot.placements),
			} satisfies GridSnapshot;
		},
		[future],
	);

	return {
		pushSnapshot,
		undo,
		redo,
		canUndo: past.length > 0,
		canRedo: future.length > 0,
	};
}