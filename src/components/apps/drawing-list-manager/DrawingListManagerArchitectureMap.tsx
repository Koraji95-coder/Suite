import styles from "./DrawingListManagerArchitectureMap.module.css";
import type { DrawingListManagerArchitectureMap as ArchMap } from "./useDrawingListManagerState";

interface DrawingListManagerArchitectureMapProps {
	architectureMap: ArchMap;
}

export function DrawingListManagerArchitectureMap({
	architectureMap,
}: DrawingListManagerArchitectureMapProps) {
	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Architecture Map</h3>
			<p className={styles.copy}>
				Summarized by sheet type for quick reporting.
			</p>
			<div className={styles.grid}>
				{architectureMap.map(([type, count]) => (
					<div key={type} className={styles.card}>
						<div className={styles.cardLabel}>{type}</div>
						<div className={styles.cardValue}>{count}</div>
					</div>
				))}
			</div>
		</div>
	);
}
