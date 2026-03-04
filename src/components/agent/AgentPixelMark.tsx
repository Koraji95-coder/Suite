// src/components/agent/AgentPixelMark.tsx
import { useId, useMemo } from "react";
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
	const filterId = useId();
	const glowId = useId();
	const mark = AGENT_MARKS[profileId];

	const rows = mark.grid.length;
	const cols = mark.grid[0].length;
	const cellSize = size / Math.max(rows, cols);
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
			className={`relative inline-flex ${className}`}
			style={{ width: size, height: size }}
		>
			{/* Pulse ring */}
			{pulse && (
				<div
					className="absolute inset-0 rounded-full animate-ping opacity-20"
					style={{
						background: glowColor,
						animationDuration: "2s",
					}}
				/>
			)}

			{/* Breathing wrapper */}
			<div
				className={breathe ? "animate-pulse" : ""}
				style={{ animationDuration: "3s" }}
			>
				<svg
					width={size}
					height={size}
					viewBox={`0 0 ${svgW} ${svgH}`}
					style={{ imageRendering: "pixelated" }}
					aria-hidden="true"
				>
					<defs>
						{/* Glow filter */}
						<filter
							id={`glow-${filterId}`}
							x="-50%"
							y="-50%"
							width="200%"
							height="200%"
						>
							<feGaussianBlur stdDeviation={cellSize * 0.8} result="blur" />
							<feComposite in="SourceGraphic" in2="blur" operator="over" />
						</filter>

						{/* Drop shadow */}
						<filter
							id={`shadow-${glowId}`}
							x="-20%"
							y="-20%"
							width="140%"
							height="140%"
						>
							<feDropShadow
								dx="0"
								dy={cellSize * 0.2}
								stdDeviation={cellSize * 0.3}
								floodOpacity="0.3"
							/>
						</filter>
					</defs>

					{/* Background glow */}
					{showGlow && (
						<rect
							x={svgW * 0.15}
							y={svgH * 0.15}
							width={svgW * 0.7}
							height={svgH * 0.7}
							rx={cellSize * 2}
							fill={glowColor}
							opacity={0.2}
							filter={`url(#glow-${filterId})`}
						/>
					)}

					{/* Pixel grid with shadow */}
					<g filter={showGlow ? `url(#shadow-${glowId})` : undefined}>
						{rects.map((rect) => (
							<rect
								key={`${rect.x}-${rect.y}`}
								x={rect.x}
								y={rect.y}
								width={cellSize}
								height={cellSize}
								fill={rect.color}
								opacity={rect.opacity}
								rx={cellSize * 0.12}
							/>
						))}
					</g>
				</svg>
			</div>
		</div>
	);
}
