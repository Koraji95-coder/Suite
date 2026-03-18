import styles from "./CoordinatesGrabberValidationPanel.module.css";

interface CoordinatesGrabberValidationPanelProps {
	errors: string[];
}

export function CoordinatesGrabberValidationPanel({
	errors,
}: CoordinatesGrabberValidationPanelProps) {
	if (errors.length === 0) return null;

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<span className={styles.icon}>!</span>
				<span className={styles.title}>Validation Errors</span>
			</div>
			<ul className={styles.list}>
				{errors.map((err, idx) => (
					<li key={idx}>{err}</li>
				))}
			</ul>
		</div>
	);
}
