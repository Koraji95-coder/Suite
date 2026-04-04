import type { ColorScheme } from "@/lib/palette";
import styles from "./CoordinatesGrabberHistoryTab.module.css";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberHistoryTabProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
}

export function CoordinatesGrabberHistoryTab({
	state,
	palette: _palette,
}: CoordinatesGrabberHistoryTabProps) {
	return (
		<div className={styles.root}>
			<div className={styles.stack}>
				{state.performanceMetrics && (
					<div className={styles.metrics}>
						<h3 className={styles.metricsTitle}>Latest Metrics</h3>
						<div className={styles.metricsGrid}>
							<div>
								Points:{" "}
								<strong>{state.performanceMetrics.pointsCreated}</strong>
							</div>
							<div>
								Duration:{" "}
								<strong>{state.performanceMetrics.duration.toFixed(2)}s</strong>
							</div>
							<div>
								Rate:{" "}
								<strong>{state.performanceMetrics.pointsPerSecond}</strong>
								/s
							</div>
							<div>
								Time:{" "}
								<strong>
									{new Date(
										state.performanceMetrics.startTime,
									).toLocaleTimeString()}
								</strong>
							</div>
						</div>
					</div>
				)}

				{state.executionHistory.length === 0 ? (
					<p className={styles.empty}>
						No execution history yet. Start extraction to see results here.
					</p>
				) : (
					state.executionHistory.map((entry, idx) => (
						<div
							key={idx}
							className={
								entry.success
									? `${styles.entry} ${styles.entrySuccess}`
									: `${styles.entry} ${styles.entryFail}`
							}
						>
							<div className={styles.entryHeader}>
								<span className={styles.entryStatus}>
									{entry.success ? "OK" : "FAIL"}
								</span>
								<span className={styles.entryName}>
									{entry.config.layerName || entry.config.mode}
								</span>
								<span className={styles.entryTime}>
									{new Date(entry.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<div className={styles.entryMeta}>
								<div>Extracted: {entry.pointsCreated || "-"}</div>
								<div>Duration: {entry.duration.toFixed(2)}s</div>
							</div>
							{entry.message && !entry.success && (
								<div className={styles.errorMessage}>{entry.message}</div>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
