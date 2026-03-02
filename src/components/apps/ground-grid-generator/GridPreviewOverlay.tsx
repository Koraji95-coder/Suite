import { hexToRgba } from "@/lib/palette";
import { GridOverlayCard } from "./GridOverlayCard";

interface GridPreviewOverlayProps {
	backgroundColor: string;
	primaryColor: string;
	textMutedColor: string;
	rodCount: number;
	testWellCount: number;
	segmentCount: number;
	teeCount: number;
	crossCount: number;
}

export function GridPreviewOverlay({
	backgroundColor,
	primaryColor,
	textMutedColor,
	rodCount,
	testWellCount,
	segmentCount,
	teeCount,
	crossCount,
}: GridPreviewOverlayProps) {
	return (
		<>
			<GridOverlayCard
				className="absolute bottom-2 left-2 flex gap-3 text-[10px]"
				backgroundColor={backgroundColor}
				borderColor={primaryColor}
				textColor={textMutedColor}
				backgroundAlpha={0.85}
				borderAlpha={0.15}
				padding="8px 12px"
			>
				<span>
					<b className="text-success">Rods:</b> {rodCount}
				</span>
				<span>
					<b className="text-danger">Test Wells:</b> {testWellCount}
				</span>
				<span>
					<b className="text-[color:#f59e0b]">Segments:</b> {segmentCount}
				</span>
				<span>
					<b className="text-[color:#3b82f6]">Tees:</b> {teeCount}
				</span>
				<span>
					<b className="text-[color:#06b6d4]">Crosses:</b> {crossCount}
				</span>
			</GridOverlayCard>

			<GridOverlayCard
				className="absolute right-2 top-2 text-[9px]"
				backgroundColor={backgroundColor}
				showBorder={false}
				backgroundAlpha={0.7}
				padding="4px 8px"
				style={{ color: hexToRgba(textMutedColor, 0.6) }}
			>
				Drag to pan / Scroll while panning to zoom
			</GridOverlayCard>
		</>
	);
}
