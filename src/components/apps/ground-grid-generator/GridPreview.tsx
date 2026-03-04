import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/lib/palette";
import { GridCanvasEmptyState } from "./GridCanvasEmptyState";
import styles from "./GridPreview.module.css";
import { GridPreviewOverlay } from "./GridPreviewOverlay";
import { GridPreviewSvg } from "./GridPreviewSvg";
import {
	boundsToViewBox,
	computeGridBounds2D,
	computeScaleFromViewBox,
} from "./gridViewUtils";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridPreviewProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	layerVisibility: {
		conductors: boolean;
		rods: boolean;
		testWells: boolean;
		tees: boolean;
		crosses: boolean;
	};
	callouts: {
		show: boolean;
		scale: number;
	};
}

const ELASTIC_DAMPING = 0.15;
const SNAP_DURATION = 400;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

export function GridPreview({
	rods,
	conductors,
	placements,
	layerVisibility,
	callouts,
}: GridPreviewProps) {
	const { palette } = useTheme();
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const [viewBox, setViewBox] = useState<{
		x: number;
		y: number;
		w: number;
		h: number;
	} | null>(null);

	const [isPanning, setIsPanning] = useState(false);

	const panStart = useRef<{
		x: number;
		y: number;
		vx: number;
		vy: number;
	} | null>(null);

	const snapAnimRef = useRef<number>(0);

	const bounds = useMemo(
		() => computeGridBounds2D(rods, conductors, { padRatio: 0.25 }),
		[rods, conductors],
	);

	const defaultViewBox = useMemo(() => boundsToViewBox(bounds), [bounds]);

	const effectiveViewBox = viewBox || defaultViewBox;

	const boundsRef = useRef(bounds);
	const defaultViewBoxRef = useRef(defaultViewBox);
	const isPanningRef = useRef(false);
	const viewBoxRef = useRef(viewBox);

	boundsRef.current = bounds;
	defaultViewBoxRef.current = defaultViewBox;
	viewBoxRef.current = viewBox;

	useEffect(() => {
		if (!isPanning) return;
		const blocker = (event: WheelEvent) => {
			event.preventDefault();
		};
		document.addEventListener("wheel", blocker, { passive: false });
		return () => document.removeEventListener("wheel", blocker);
	}, [isPanning]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handler = (event: WheelEvent) => {
			if (!isPanningRef.current) return;
			event.preventDefault();
			event.stopPropagation();

			const factor = event.deltaY > 0 ? 1.05 : 0.9524;
			const b = boundsRef.current;
			const dv = defaultViewBoxRef.current;

			setViewBox((prev) => {
				const vb = prev || { x: b.minX, y: b.minY, w: dv.w, h: dv.h };
				const cx = vb.x + vb.w / 2;
				const cy = vb.y + vb.h / 2;

				let nw = vb.w * factor;
				let nh = vb.h * factor;

				nw = Math.max(dv.w * MIN_ZOOM, Math.min(dv.w * MAX_ZOOM, nw));
				nh = Math.max(dv.h * MIN_ZOOM, Math.min(dv.h * MAX_ZOOM, nh));

				return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
			});
		};

		container.addEventListener("wheel", handler, { passive: false });
		return () => container.removeEventListener("wheel", handler);
	}, []);

	const snapBack = useCallback(
		(from: { x: number; y: number; w: number; h: number }) => {
			cancelAnimationFrame(snapAnimRef.current);

			const b = boundsRef.current;
			const contentCx = (b.minX + b.maxX) / 2;
			const contentCy = (b.minY + b.maxY) / 2;
			const targetX = contentCx - from.w / 2;
			const targetY = contentCy - from.h / 2;

			const startX = from.x;
			const startY = from.y;
			const startTime = performance.now();

			const animate = () => {
				const elapsed = performance.now() - startTime;
				const t = Math.min(1, elapsed / SNAP_DURATION);
				const ease = 1 - (1 - t) ** 3;

				setViewBox({
					x: startX + (targetX - startX) * ease,
					y: startY + (targetY - startY) * ease,
					w: from.w,
					h: from.h,
				});

				if (t < 1) snapAnimRef.current = requestAnimationFrame(animate);
			};

			snapAnimRef.current = requestAnimationFrame(animate);
		},
		[],
	);

	const handleMouseDown = useCallback((event: React.MouseEvent) => {
		if (event.button !== 0) return;

		cancelAnimationFrame(snapAnimRef.current);
		setIsPanning(true);
		isPanningRef.current = true;

		const vb = viewBoxRef.current || defaultViewBoxRef.current;
		panStart.current = {
			x: event.clientX,
			y: event.clientY,
			vx: vb.x,
			vy: vb.y,
		};
	}, []);

	const handleMouseMove = useCallback(
		(event: React.MouseEvent) => {
			if (!isPanning || !panStart.current || !svgRef.current) return;

			const rect = svgRef.current.getBoundingClientRect();
			const vb = viewBoxRef.current || defaultViewBoxRef.current;

			const dx = ((event.clientX - panStart.current.x) / rect.width) * vb.w;
			const dy = ((event.clientY - panStart.current.y) / rect.height) * vb.h;

			let newX = panStart.current.vx - dx;
			let newY = panStart.current.vy - dy;

			const b = boundsRef.current;
			const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
			const margin = span * 0.02;

			const minX = b.minX - margin;
			const maxX = b.maxX - vb.w + margin;
			const minY = b.minY - margin;
			const maxY = b.maxY - vb.h + margin;

			if (newX < minX) newX = minX + (newX - minX) * ELASTIC_DAMPING;
			else if (newX > maxX) newX = maxX + (newX - maxX) * ELASTIC_DAMPING;

			if (newY < minY) newY = minY + (newY - minY) * ELASTIC_DAMPING;
			else if (newY > maxY) newY = maxY + (newY - maxY) * ELASTIC_DAMPING;

			setViewBox({ x: newX, y: newY, w: vb.w, h: vb.h });
		},
		[isPanning],
	);

	const handleMouseUp = useCallback(() => {
		setIsPanning(false);
		isPanningRef.current = false;

		const vb = viewBoxRef.current;
		if (!vb) return;

		const b = boundsRef.current;
		const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
		const margin = span * 0.02;

		const minX = b.minX - margin;
		const maxX = b.maxX - vb.w + margin;
		const minY = b.minY - margin;
		const maxY = b.maxY - vb.h + margin;

		if (vb.x < minX || vb.x > maxX || vb.y < minY || vb.y > maxY) {
			snapBack(vb);
		}
	}, [snapBack]);

	useEffect(() => () => cancelAnimationFrame(snapAnimRef.current), []);

	const tees = placements.filter((placement) => placement.type === "TEE");
	const crosses = placements.filter((placement) => placement.type === "CROSS");
	const testWells = placements.filter(
		(placement) => placement.type === "GROUND_ROD_WITH_TEST_WELL",
	);
	const rodsWithoutTestWells = rods.filter(
		(rod) =>
			!testWells.some(
				(testWell) =>
					Math.abs(testWell.grid_x - rod.grid_x) <= 1e-6 &&
					Math.abs(testWell.grid_y - rod.grid_y) <= 1e-6,
			),
	);
	const rodScale = computeScaleFromViewBox(effectiveViewBox, 0.012);

	const hasData = rods.length > 0 || conductors.length > 0;
	if (!hasData) {
		return (
			<GridCanvasEmptyState message="Import rod and conductor data to see the grid preview" />
		);
	}

	return (
		<div ref={containerRef} className={styles.root}>
			<GridPreviewSvg
				svgRef={svgRef}
				effectiveViewBox={effectiveViewBox}
				isPanning={isPanning}
				backgroundColor={palette.background}
				rods={layerVisibility.rods ? rodsWithoutTestWells : []}
				conductors={layerVisibility.conductors ? conductors : []}
				tees={layerVisibility.tees ? tees : []}
				crosses={layerVisibility.crosses ? crosses : []}
				testWells={layerVisibility.testWells ? testWells : []}
				rodScale={rodScale}
				showCallouts={callouts.show}
				calloutScale={callouts.scale}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
			/>

			<GridPreviewOverlay
				backgroundColor={palette.background}
				primaryColor={palette.primary}
				textMutedColor={palette.textMuted}
				rodCount={rods.length}
				testWellCount={testWells.length}
				conductorCount={conductors.length}
				teeCount={tees.length}
				crossCount={crosses.length}
			/>
		</div>
	);
}
