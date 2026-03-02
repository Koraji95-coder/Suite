import { useId, useMemo } from "react";
import type { AgentProfileId } from "./agentProfiles";
import { AGENT_MARKS, type MarkExpression } from "./agentMarkPatterns";

interface AgentPixelMarkProps {
	profileId: AgentProfileId;
	size?: number;
	expression?: MarkExpression;
	className?: string;
}

export function AgentPixelMark({
	profileId,
	size = 48,
	expression = "neutral",
	className = "",
}: AgentPixelMarkProps) {
	const filterId = useId();
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
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${svgW} ${svgH}`}
			className={className}
			style={{ imageRendering: "pixelated" }}
			aria-hidden="true"
		>
			{showGlow && (
				<>
					<defs>
						<filter id={`glow-${filterId}`} x="-30%" y="-30%" width="160%" height="160%">
							<feGaussianBlur stdDeviation={cellSize * 0.6} result="blur" />
							<feComposite in="SourceGraphic" in2="blur" operator="over" />
						</filter>
					</defs>
					<rect
						x={svgW * 0.2}
						y={svgH * 0.2}
						width={svgW * 0.6}
						height={svgH * 0.6}
						rx={cellSize}
						fill={glowColor}
						opacity={0.15}
						filter={`url(#glow-${filterId})`}
					/>
				</>
			)}
			{rects.map((rect) => (
				<rect
					key={`${rect.x}-${rect.y}`}
					x={rect.x}
					y={rect.y}
					width={cellSize}
					height={cellSize}
					fill={rect.color}
					opacity={rect.opacity}
					rx={cellSize * 0.1}
				/>
			))}
		</svg>
	);
}
