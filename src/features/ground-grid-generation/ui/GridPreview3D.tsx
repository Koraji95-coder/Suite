import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GridCanvasEmptyState } from "./GridCanvasEmptyState";
import styles from "./GridPreview3D.module.css";
import { createGridPreview3DEngine } from "./GridPreview3DEngine";
import { computeGridBounds2D } from "./gridViewUtils";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridPreview3DProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
}

export function GridPreview3D({
	rods,
	conductors,
	placements,
}: GridPreview3DProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const [paused, setPaused] = useState(false);
	const pausedRef = useRef(false);

	const togglePause = useCallback(() => {
		setPaused((current) => {
			pausedRef.current = !current;
			return !current;
		});
	}, []);

	const bounds = useMemo(
		() => computeGridBounds2D(rods, conductors),
		[rods, conductors],
	);

	const hasData = rods.length > 0 || conductors.length > 0;

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || !hasData) return;

		return createGridPreview3DEngine({
			canvas,
			container,
			rods,
			conductors,
			placements,
			bounds,
			pausedRef,
		});
	}, [hasData, rods, conductors, placements, bounds]);

	if (!hasData) {
		return <GridCanvasEmptyState message="Import data to see the 3D preview" />;
	}

	return (
		<div ref={containerRef} className={styles.root}>
			<canvas ref={canvasRef} className={styles.canvas} />

			<button
				type="button"
				onClick={togglePause}
				className={styles.pauseButton}
			>
				{paused ? <Play size={11} /> : <Pause size={11} />}
				{paused ? "Play" : "Pause"}
			</button>

			<div className={styles.hint}>
				Drag to orbit{paused ? "" : " / Auto-rotating"}
			</div>
		</div>
	);
}
