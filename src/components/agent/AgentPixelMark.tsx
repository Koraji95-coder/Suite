// src/components/agent/AgentPixelMark.tsx
import { type CSSProperties, useMemo } from "react";
import { cn } from "@/lib/utils";
import styles from "./AgentPixelMark.module.css";
import { AGENT_MARKS, type MarkExpression } from "./agentMarkPatterns";
import type { AgentProfileId } from "./agentProfiles";

interface AgentPixelMarkProps {
	profileId: AgentProfileId;
	size?: number;
	expression?: MarkExpression;
	className?: string;
	/** Add a pulsing ring effect */
	pulse?: boolean;
	/** Add a subtle breathing animation */
	breathe?: boolean;
}

export function AgentPixelMark({
	profileId,
	size = 48,
	expression = "neutral",
	className = "",
	pulse = false,
	breathe = false,
}: AgentPixelMarkProps) {
	const mark = AGENT_MARKS[profileId];

	const rows = mark.grid.length;
	const cols = mark.grid[0].length;
	const cellSize = Math.max(1, Math.floor(size / Math.max(rows, cols)));
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
				let idx = mark.grid[r][c];

				if (expression === "active" && mark.activeOverlay) {
					const overlay = mark.activeOverlay[r]?.[c] ?? 0;
					if (overlay > 0) idx = overlay;
				}

				if (idx === 0) continue;

				const color = mark.colors[idx] ?? mark.colors[1];
				const opacity = expression === "focus" ? 0.85 : 1;

				result.push({
					x: c * cellSize,
					y: r * cellSize,
					color,
					opacity,
				});
			}
		}
		return result;
	}, [mark, rows, cols, cellSize, expression]);

	const glowColor = mark.colors[4] ?? mark.colors[3] ?? mark.colors[2];
	const showGlow = expression === "active" || expression === "focus";

	return (
		<div
			className={cn(styles.root, className)}
			style={{ width: size, height: size }}
		>
			{/* Pulse ring */}
			{pulse && (
				<div
					className={styles.pulseRing}
					style={
						{
							"--agent-glow": glowColor,
						} as CSSProperties
					}
				/>
			)}

			{/* Circular halo; no square backing tile */}
			{showGlow && (
				<div
					className={styles.halo}
					style={
						{
							"--agent-glow": glowColor,
						} as CSSProperties
					}
				/>
			)}

			{/* Breathing wrapper */}
			<div className={cn(styles.spriteWrap, breathe && styles.breathe)}>
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
