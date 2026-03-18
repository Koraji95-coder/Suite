import type { ColorScheme } from "@/lib/palette";
import styles from "./CoordinatesGrabberHeader.module.css";

interface CoordinatesGrabberHeaderProps {
	palette: ColorScheme;
}

export function CoordinatesGrabberHeader({
	palette: _palette,
}: CoordinatesGrabberHeaderProps) {
	return (
		<div className={styles.root}>
			<div>
				<h1 className={styles.title}>Coordinates Grabber</h1>
				<p className={styles.subtitle}>
					Extract coordinate points from CAD drawings
				</p>
			</div>
			<div className={styles.actions}>
				<div title="Coming soon: Presets" className={styles.presetChip}>
					Presets (coming soon)
				</div>
				<div className={styles.pinMark}>📍</div>
			</div>
		</div>
	);
}
