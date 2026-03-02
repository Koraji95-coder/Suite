import { hexToRgba } from "@/lib/palette";
import { GridOverlayCard } from "./GridOverlayCard";
import type { HoveredPotentialValue } from "./PotentialContourHelpers";

interface PotentialContourOverlayProps {
	hoveredValue: HoveredPotentialValue | null;
	minVal: number;
	maxVal: number;
	backgroundColor: string;
	primaryColor: string;
	textColor: string;
	mutedTextColor: string;
}

export function PotentialContourOverlay({
	hoveredValue,
	minVal,
	maxVal,
	backgroundColor,
	primaryColor,
	textColor,
	mutedTextColor,
}: PotentialContourOverlayProps) {
	return (
		<div className="pointer-events-none absolute inset-0 p-2 sm:p-3">
			<div className="flex h-full flex-col justify-between gap-2">
				<div className="flex flex-wrap items-start justify-between gap-2">
					{hoveredValue ? (
						<GridOverlayCard
							backgroundColor={backgroundColor}
							borderColor={primaryColor}
							textColor={textColor}
							style={{ fontSize: 10, fontFamily: "monospace" }}
						>
							<div>
								Position: ({hoveredValue.x.toFixed(1)},{" "}
								{hoveredValue.y.toFixed(1)})
							</div>
							<div>Potential: {hoveredValue.v.toFixed(2)} V</div>
						</GridOverlayCard>
					) : (
						<div />
					)}
					<GridOverlayCard
						backgroundColor={backgroundColor}
						borderColor={primaryColor}
						textColor={hexToRgba(mutedTextColor, 0.7)}
						padding="4px 8px"
						style={{ fontSize: 9 }}
					>
						Hover to inspect voltage
					</GridOverlayCard>
				</div>

				<GridOverlayCard
					className="self-start sm:self-end"
					backgroundColor={backgroundColor}
					borderColor={primaryColor}
					textColor={mutedTextColor}
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						fontSize: 9,
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: 2 }}>
						Touch/Step Potential
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<div
							style={{
								width: 72,
								height: 8,
								borderRadius: 2,
								background:
									"linear-gradient(90deg, #228b22, #3b82f6, #eab308, #f59e0b, #ef4444)",
							}}
						/>
					</div>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							width: 72,
						}}
					>
						<span>{minVal.toFixed(0)}V</span>
						<span>{maxVal.toFixed(0)}V</span>
					</div>
				</GridOverlayCard>
			</div>
		</div>
	);
}
