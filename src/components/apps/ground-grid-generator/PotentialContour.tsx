import { useEffect, useMemo, useRef, useState } from "react";
import { useResolvedAppearance } from "@/lib/appearance/useResolvedAppearance";
import { GridCanvasEmptyState } from "./GridCanvasEmptyState";
import styles from "./PotentialContour.module.css";
import {
	computeContourBounds,
	computePotentialField,
	drawPotentialContourCanvas,
	getFieldRange,
	type HoveredPotentialValue,
	RESOLUTION,
} from "./PotentialContourHelpers";
import { PotentialContourOverlay } from "./PotentialContourOverlay";
import type { GridConductor, GridRod } from "./types";

interface PotentialContourProps {
	rods: GridRod[];
	conductors: GridConductor[];
	soilResistivity: number;
	faultCurrent: number;
}

export function PotentialContour({
	rods,
	conductors,
	soilResistivity,
	faultCurrent,
}: PotentialContourProps) {
	const appearance = useResolvedAppearance();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [hoveredValue, setHoveredValue] =
		useState<HoveredPotentialValue | null>(null);

	// Trigger redraw when container size changes.
	const [renderTick, setRenderTick] = useState(0);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const resizeObserver = new ResizeObserver(() => {
			setRenderTick((tick) => tick + 1);
		});
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, []);

	const bounds = useMemo(
		() => computeContourBounds(rods, conductors),
		[rods, conductors],
	);

	const field = useMemo(
		() =>
			computePotentialField(
				rods,
				conductors,
				bounds,
				soilResistivity,
				faultCurrent,
			),
		[rods, conductors, bounds, soilResistivity, faultCurrent],
	);

	const { minVal, maxVal } = useMemo(() => getFieldRange(field), [field]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		if (field.length === 0) return;
		void renderTick;

		drawPotentialContourCanvas({
			canvas,
			container,
			field,
			bounds,
			minVal,
			maxVal,
			conductors,
			rods,
		});
	}, [field, bounds, minVal, maxVal, conductors, rods, renderTick]);

	const handleMouseMove = (event: React.MouseEvent) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const rx = (event.clientX - rect.left) / rect.width;
		const ry = (event.clientY - rect.top) / rect.height;

		const i = Math.floor(rx * RESOLUTION);
		const j = Math.floor(ry * RESOLUTION);

		if (i >= 0 && i < RESOLUTION && j >= 0 && j < RESOLUTION) {
			const spanX = bounds.maxX - bounds.minX;
			const spanY = bounds.maxY - bounds.minY;
			setHoveredValue({
				x: bounds.minX + rx * spanX,
				y: bounds.minY + ry * spanY,
				v: field[j][i],
			});
		}
	};

	const hasData = rods.length > 0 || conductors.length > 0;
	if (!hasData) {
		return (
			<GridCanvasEmptyState message="Import data to see the potential contour" />
		);
	}

	return (
		<div ref={containerRef} className={styles.root}>
			<canvas
				ref={canvasRef}
				className={styles.canvas}
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHoveredValue(null)}
			/>
			<PotentialContourOverlay
				hoveredValue={hoveredValue}
				minVal={minVal}
				maxVal={maxVal}
				backgroundColor={appearance.background}
				primaryColor={appearance.primary}
				textColor={appearance.text}
				mutedTextColor={appearance.textMuted}
			/>
		</div>
	);
}
