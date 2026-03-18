import type { Dispatch, SetStateAction } from "react";
import type { ColorScheme } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberPointNamingPanel.module.css";

interface CoordinatesGrabberPointNamingPanelProps {
	state: CoordinatesGrabberState;
	setState: Dispatch<SetStateAction<CoordinatesGrabberState>>;
	palette: ColorScheme;
}

export function CoordinatesGrabberPointNamingPanel({
	state,
	setState,
	palette: _palette,
}: CoordinatesGrabberPointNamingPanelProps) {
	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Point Naming</h3>
			<div className={styles.grid}>
				<div>
					<label htmlFor="coords-point-prefix" className={styles.label}>
						Prefix:
					</label>
					<input
						id="coords-point-prefix"
						name="coords_point_prefix"
						type="text"
						value={state.pointPrefix}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								pointPrefix: e.target.value,
							}))
						}
						className={styles.input}
					/>
				</div>
				<div>
					<label htmlFor="coords-point-start-number" className={styles.label}>
						Start #:
					</label>
					<input
						id="coords-point-start-number"
						name="coords_point_start_number"
						type="number"
						value={state.startNumber}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								startNumber: parseInt(e.target.value, 10) || 1,
							}))
						}
						min="1"
						className={styles.input}
					/>
				</div>
				<div>
					<label htmlFor="coords-point-decimals" className={styles.label}>
						Decimals:
					</label>
					<input
						id="coords-point-decimals"
						name="coords_point_decimals"
						type="number"
						value={state.decimalPlaces}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								decimalPlaces: parseInt(e.target.value, 10) || 3,
							}))
						}
						min="0"
						max="12"
						className={styles.input}
					/>
				</div>
			</div>
		</div>
	);
}
