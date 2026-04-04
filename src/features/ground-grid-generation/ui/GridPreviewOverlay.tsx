import { hexToRgba } from "@/lib/palette";
import { GridOverlayCard } from "./GridOverlayCard";
import styles from "./GridPreviewOverlay.module.css";

interface GridPreviewOverlayProps {
	backgroundColor: string;
	primaryColor: string;
	textMutedColor: string;
	rodCount: number;
	testWellCount: number;
	conductorCount: number;
	teeCount: number;
	crossCount: number;
}

export function GridPreviewOverlay({
	backgroundColor,
	primaryColor,
	textMutedColor,
	rodCount,
	testWellCount,
	conductorCount,
	teeCount,
	crossCount,
}: GridPreviewOverlayProps) {
	return (
		<>
			<GridOverlayCard
				className={styles.statsCard}
				backgroundColor={backgroundColor}
				borderColor={primaryColor}
				textColor={textMutedColor}
				backgroundAlpha={0.85}
				borderAlpha={0.15}
				padding="8px 12px"
			>
				<span>
					<b className={styles.rods}>Rods (incl. TW):</b> {rodCount}
				</span>
				<span>
					<b className={styles.testWells}>Test Wells:</b> {testWellCount}
				</span>
				<span>
					<b className={styles.conductors}>Conductors:</b> {conductorCount}
				</span>
				<span>
					<b className={styles.tees}>Tees:</b> {teeCount}
				</span>
				<span>
					<b className={styles.crosses}>Crosses:</b> {crossCount}
				</span>
			</GridOverlayCard>

			<GridOverlayCard
				className={styles.hintCard}
				backgroundColor={backgroundColor}
				showBorder={false}
				backgroundAlpha={0.7}
				padding="4px 8px"
				style={{ color: hexToRgba(textMutedColor, 0.6) }}
			>
				Drag to pan / Scroll while panning to zoom
				<br />
				* Rod totals include test wells.
			</GridOverlayCard>
		</>
	);
}
