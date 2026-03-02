import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/lib/palette";
import { GridCanvasEmptyState } from "./GridCanvasEmptyState";
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
	const { palette } = useTheme();
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
		<div
			ref={containerRef}
			className="relative h-full min-h-[320px] w-full sm:min-h-[400px]"
		>
			<canvas
				ref={canvasRef}
				style={{ width: "100%", height: "100%", borderRadius: 8 }}
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHoveredValue(null)}
			/>
			<PotentialContourOverlay
				hoveredValue={hoveredValue}
				minVal={minVal}
				maxVal={maxVal}
				backgroundColor={palette.background}
				primaryColor={palette.primary}
				textColor={palette.text}
				mutedTextColor={palette.textMuted}
			/>
		</div>
	);
}
