import { useState, useCallback, useRef } from 'react';
import type { GridRod, GridConductor } from './types';

interface GridSnapshot {
  rods: GridRod[];
  conductors: GridConductor[];
}

const MAX_HISTORY = 50;

export function useGridHistory() {
  const [past, setPast] = useState<GridSnapshot[]>([]);
  const [future, setFuture] = useState<GridSnapshot[]>([]);
  const isUndoRedo = useRef(false);

  const pushSnapshot = useCallback((rods: GridRod[], conductors: GridConductor[]) => {
    if (isUndoRedo.current) {
      isUndoRedo.current = false;
      return;
    }
    setPast((prev) => {
      const next = [...prev, { rods, conductors }];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback(
    (currentRods: GridRod[], currentConductors: GridConductor[]) => {
      if (past.length === 0) return null;
      const snapshot = past[past.length - 1];
      setPast((prev) => prev.slice(0, -1));
      setFuture((prev) => [...prev, { rods: currentRods, conductors: currentConductors }]);
      isUndoRedo.current = true;
      return snapshot;
    },
    [past]
  );

  const redo = useCallback(
    (currentRods: GridRod[], currentConductors: GridConductor[]) => {
      if (future.length === 0) return null;
      const snapshot = future[future.length - 1];
      setFuture((prev) => prev.slice(0, -1));
      setPast((prev) => [...prev, { rods: currentRods, conductors: currentConductors }]);
      isUndoRedo.current = true;
      return snapshot;
    },
    [future]
  );

  return {
    pushSnapshot,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
