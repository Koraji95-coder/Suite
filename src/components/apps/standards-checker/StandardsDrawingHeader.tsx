import { CheckCircle, Settings as SettingsIcon, Upload } from "lucide-react";
import styles from "./StandardsDrawingHeader.module.css";

interface StandardsDrawingHeaderProps {
	onOpenRules: () => void;
	onOpenUpload: () => void;
}

export function StandardsDrawingHeader({
	onOpenRules,
	onOpenUpload,
}: StandardsDrawingHeaderProps) {
	return (
		<section className={styles.root}>
			<div className={styles.titleWrap}>
				<div className={styles.mark}>
					<CheckCircle className={styles.markIcon} />
				</div>
				<div>
					<h2 className={styles.title}>Drawing Standards</h2>
					<p className={styles.subtitle}>
						Automated drawing compliance verification in Unified Standards
						Checker
					</p>
				</div>
			</div>
			<div className={styles.actions}>
				<button
					onClick={onOpenRules}
					className={styles.ghostAction}
					type="button"
				>
					<SettingsIcon className={styles.actionIcon} />
					<span>Configure Rules</span>
				</button>
				<button
					onClick={onOpenUpload}
					className={styles.primaryAction}
					type="button"
				>
					<Upload className={styles.actionIcon} />
					<span>Check Drawing</span>
				</button>
			</div>
		</section>
	);
}
