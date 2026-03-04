import type { CSSProperties } from "react";
import styles from "./ProgressBar.module.css";

export function ProgressBar({
	value,
	progress,
	style,
}: {
	value?: number;
	progress?: number;
	style?: CSSProperties;
}) {
	const normalizedValue = value ?? progress ?? 0;
	const clamped = Math.max(0, Math.min(100, normalizedValue));
	return (
		<div className={styles.track} style={style}>
			<div className={styles.fill} style={{ width: `${clamped}%` }} />
		</div>
	);
}
