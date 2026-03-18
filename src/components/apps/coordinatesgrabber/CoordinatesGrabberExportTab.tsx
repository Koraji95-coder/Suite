import type { ColorScheme } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberExportTab.module.css";

interface CoordinatesGrabberExportTabProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
	downloadResult: () => Promise<void>;
	openResultLocation: () => Promise<void>;
}

export function CoordinatesGrabberExportTab({
	state,
	palette: _palette,
	downloadResult,
	openResultLocation,
}: CoordinatesGrabberExportTabProps) {
	return (
		<div className={styles.root}>
			<div className={styles.column}>
				<div className={styles.card}>
					<h3 className={styles.cardTitle}>Excel Export</h3>
					{state.excelPath ? (
						<div className={styles.actionColumn}>
							<div className={styles.successPath}>
								OK {state.excelPath}
							</div>
							<button onClick={openResultLocation} className={styles.primaryButton}>
								Open Export Location
							</button>
							<button onClick={downloadResult} className={styles.infoButton}>
								Download Excel
							</button>
						</div>
					) : (
						<p className={styles.emptyState}>
							No export yet. Start extraction to generate Excel file.
						</p>
					)}
				</div>

				<div className={styles.card}>
					<h3 className={styles.cardTitle}>Output Format</h3>
					<p className={styles.description}>
						Excel table format with the following columns:
					</p>
					<ul className={styles.list}>
						<li>Point ID</li>
						<li>East (X)</li>
						<li>North (Y)</li>
						<li>Elevation (Z)</li>
						<li>Layer</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
