// src/components/agent/AgentPixelMark.tsx
import { memo, type CSSProperties, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./AgentPixelMark.module.css";
import { AGENT_MARKS, type MarkExpression } from "./agentMarkPatterns";
import type { AgentProfileId } from "./agentProfiles";
import {
	type AgentMarkState,
	mapLegacyMarkState,
} from "./agentMarkState";

interface AgentPixelMarkProps {
	profileId: AgentProfileId;
	size?: number;
	state?: AgentMarkState;
	motionPreset?: "balanced" | "reduced";
	detailLevel?: "auto" | "micro" | "standard" | "hero";
	expression?: MarkExpression;
	className?: string;
	/** Add a pulsing ring effect */
	pulse?: boolean;
	/** Add a subtle breathing animation */
	breathe?: boolean;
}

function resolveDetailLevel(
	size: number,
	detailLevel: "auto" | "micro" | "standard" | "hero",
): "micro" | "standard" | "hero" {
	if (detailLevel !== "auto") return detailLevel;
	if (size >= 110) return "hero";
	if (size >= 36) return "standard";
	return "micro";
}

function pickDominantCellIndex(
	grid: number[][],
	startRow: number,
	startCol: number,
	rowStride: number,
	colStride: number,
): number {
	const counts = new Map<number, number>();
	for (let row = startRow; row < startRow + rowStride; row++) {
		const sourceRow = grid[row];
		if (!sourceRow) continue;
		for (let col = startCol; col < startCol + colStride; col++) {
			const idx = sourceRow[col] ?? 0;
			if (idx <= 0) continue;
			counts.set(idx, (counts.get(idx) ?? 0) + 1);
		}
	}
	if (counts.size === 0) return 0;

	let selected = 0;
	let selectedCount = 0;
	for (const [idx, count] of counts.entries()) {
		if (count > selectedCount || (count === selectedCount && idx > selected)) {
			selected = idx;
			selectedCount = count;
		}
	}
	return selected;
}

function reduceGridForDetail(
	grid: number[][],
	detail: "micro" | "standard" | "hero",
): number[][] {
	if (!Array.isArray(grid) || grid.length === 0) return [];
	if (detail === "hero") {
		return grid.map((row) => [...row]);
	}
	const rows = grid.length;
	const cols = grid[0]?.length ?? 0;
	if (rows === 0 || cols === 0) return [];

	const targetMax = detail === "standard" ? 32 : 16;
	const rowStride = Math.max(1, Math.floor(rows / targetMax));
	const colStride = Math.max(1, Math.floor(cols / targetMax));
	const outRows = Math.max(1, Math.ceil(rows / rowStride));
	const outCols = Math.max(1, Math.ceil(cols / colStride));

	const reduced = Array.from({ length: outRows }, () =>
		Array<number>(outCols).fill(0),
	);
	for (let outRow = 0; outRow < outRows; outRow++) {
		const sourceRow = outRow * rowStride;
		for (let outCol = 0; outCol < outCols; outCol++) {
			const sourceCol = outCol * colStride;
			reduced[outRow][outCol] = pickDominantCellIndex(
				grid,
				sourceRow,
				sourceCol,
				rowStride,
				colStride,
			);
		}
	}
	return reduced;
}

function AgentPixelMarkInner({
	profileId,
	size = 48,
	state,
	motionPreset = "balanced",
	detailLevel = "auto",
	expression = "neutral",
	className = "",
	pulse = false,
	breathe = false,
}: AgentPixelMarkProps) {
	const mark = AGENT_MARKS[profileId];
	const [frameIndex, setFrameIndex] = useState(0);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const applyReducedPreference = () => {
			setPrefersReducedMotion(mediaQuery.matches);
		};
		applyReducedPreference();
		mediaQuery.addEventListener("change", applyReducedPreference);
		return () => {
			mediaQuery.removeEventListener("change", applyReducedPreference);
		};
	}, []);

	const reducedMotion =
		motionPreset === "reduced" || prefersReducedMotion;
	const effectiveState = state ?? mapLegacyMarkState({ expression, pulse, breathe });

	const framesForState = useMemo(() => {
		const frames = mark.stateFrames?.[effectiveState];
		if (frames?.length) return frames;
		if (effectiveState === "focus" && mark.focusOverlay) return [mark.focusOverlay];
		if (
			(effectiveState === "thinking" ||
				effectiveState === "speaking" ||
				effectiveState === "running") &&
			mark.activeOverlay
		) {
			return [mark.activeOverlay];
		}
		return [];
	}, [mark, effectiveState]);

	const normalizedFrameIndex =
		framesForState.length > 0 ? frameIndex % framesForState.length : 0;
	const activeFrame = framesForState[normalizedFrameIndex] ?? null;
	const effectiveDetail = resolveDetailLevel(size, detailLevel);

	const cadenceMs = useMemo(() => {
		const cadenceByState: Record<AgentMarkState, number> = {
			idle: 3200,
			thinking: 220,
			speaking: 220,
			running: 180,
			waiting: 320,
			success: 220,
			warning: 260,
			error: 260,
			focus: 280,
		};
		const baseCadence = cadenceByState[effectiveState];
		const lowCostMultiplier = size <= 26 ? 1.85 : 1;
		return Math.round(baseCadence * lowCostMultiplier);
	}, [effectiveState, size]);
	const shouldAnimateFrames =
		!reducedMotion && framesForState.length > 1 && size >= 40;

	useEffect(() => {
		setFrameIndex(0);
		if (!shouldAnimateFrames) {
			return;
		}
		const timer = window.setInterval(() => {
			setFrameIndex((current) => (current + 1) % framesForState.length);
		}, cadenceMs);
		return () => {
			window.clearInterval(timer);
		};
	}, [shouldAnimateFrames, framesForState.length, cadenceMs]);

	const sourceGrid = useMemo(() => {
		const rows = mark.grid.length;
		const cols = mark.grid[0]?.length ?? 0;
		const grid = Array.from({ length: rows }, (_, row) =>
			Array.from({ length: cols }, (_, col) => {
				let idx = mark.grid[row]?.[col] ?? 0;
				const overlayIdx = activeFrame?.[row]?.[col] ?? 0;
				if (overlayIdx > 0) {
					idx = overlayIdx;
				} else if (
					!activeFrame &&
					effectiveState === "thinking" &&
					mark.activeOverlay
				) {
					const fallbackOverlay = mark.activeOverlay[row]?.[col] ?? 0;
					if (fallbackOverlay > 0) idx = fallbackOverlay;
				}
				return idx;
			}),
		);
		return grid;
	}, [mark, activeFrame, effectiveState]);

	const renderGrid = useMemo(
		() => reduceGridForDetail(sourceGrid, effectiveDetail),
		[sourceGrid, effectiveDetail],
	);
	const rows = renderGrid.length;
	const cols = renderGrid[0]?.length ?? 0;
	const scaleBase = size / Math.max(1, Math.max(rows, cols));
	const cellSize = scaleBase >= 1 ? Math.max(1, Math.floor(scaleBase)) : scaleBase;
	const svgW = cols * cellSize;
	const svgH = rows * cellSize;

	const rects = useMemo(() => {
		const result: Array<{
			x: number;
			y: number;
			color: string;
			opacity: number;
		}> = [];

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const idx = renderGrid[r]?.[c] ?? 0;
				if (idx === 0) continue;

				const color = mark.colors[idx] ?? mark.colors[1];
				const opacity = effectiveState === "focus" ? 0.9 : 1;

				result.push({
					x: c * cellSize,
					y: r * cellSize,
					color,
					opacity,
				});
			}
		}
		return result;
	}, [mark, rows, cols, cellSize, renderGrid, effectiveState]);

	const glowColor = useMemo(() => {
		switch (effectiveState) {
			case "error":
				return "var(--danger)";
			case "warning":
			case "waiting":
				return "var(--warning)";
			case "success":
				return "var(--success)";
			default:
				return mark.colors[4] ?? mark.colors[3] ?? mark.colors[2];
		}
	}, [effectiveState, mark.colors]);
	const showGlow =
		size >= 28 && effectiveState !== "idle" && effectiveState !== "waiting";
	const showPulseRing =
		!reducedMotion &&
		size >= 34 &&
		(pulse ||
			effectiveState === "speaking" ||
			effectiveState === "running" ||
			effectiveState === "error" ||
			effectiveState === "warning");
	const showBreathe =
		!reducedMotion && size >= 40 && (breathe || effectiveState === "focus");
	const motionMode = reducedMotion ? "reduced" : "balanced";

	return (
		<div
			className={cn(styles.root, className)}
			style={{ width: size, height: size }}
			data-agent-state={effectiveState}
			data-agent-frame={normalizedFrameIndex}
			data-agent-motion={motionMode}
			data-agent-detail={effectiveDetail}
		>
			{/* Pulse ring */}
			{showPulseRing && (
				<div
					data-agent-layer="pulse"
					className={styles.pulseRing}
					style={
						{
							"--agent-glow": glowColor,
						} as CSSProperties
					}
				/>
			)}

			{/* Circular halo; no square backing tile */}
			{showGlow && !reducedMotion && (
				<div
					data-agent-layer="halo"
					className={styles.halo}
					style={
						{
							"--agent-glow": glowColor,
						} as CSSProperties
					}
				/>
			)}

			{/* Breathing wrapper */}
			<div className={cn(styles.spriteWrap, showBreathe && styles.breathe)}>
				<svg
					width={svgW}
					height={svgH}
					viewBox={`0 0 ${svgW} ${svgH}`}
					className={styles.spriteSvg}
					shapeRendering="crispEdges"
					aria-hidden="true"
				>
					<g className={styles.spritePixels}>
						{rects.map((rect) => (
							<rect
								key={`${rect.x}-${rect.y}`}
								x={rect.x}
								y={rect.y}
								width={cellSize}
								height={cellSize}
								fill={rect.color}
								opacity={rect.opacity}
								rx={0}
							/>
						))}
					</g>
				</svg>
			</div>
		</div>
	);
}

function areEqual(
	prev: Readonly<AgentPixelMarkProps>,
	next: Readonly<AgentPixelMarkProps>,
): boolean {
	return (
		prev.profileId === next.profileId &&
		(prev.size ?? 48) === (next.size ?? 48) &&
		(prev.state ?? "idle") === (next.state ?? "idle") &&
		(prev.motionPreset ?? "balanced") === (next.motionPreset ?? "balanced") &&
		(prev.detailLevel ?? "auto") === (next.detailLevel ?? "auto") &&
		(prev.expression ?? "neutral") === (next.expression ?? "neutral") &&
		(prev.className ?? "") === (next.className ?? "") &&
		Boolean(prev.pulse) === Boolean(next.pulse) &&
		Boolean(prev.breathe) === Boolean(next.breathe)
	);
}

export const AgentPixelMark = memo(AgentPixelMarkInner, areEqual);
