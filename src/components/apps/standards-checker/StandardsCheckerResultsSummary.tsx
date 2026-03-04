import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import styles from "./StandardsChecker.module.css";

interface StandardsCheckerResultsSummaryProps {
	passCount: number;
	warningCount: number;
	failCount: number;
}

export function StandardsCheckerResultsSummary({
	passCount,
	warningCount,
	failCount,
}: StandardsCheckerResultsSummaryProps) {
	return (
		<section className={styles.panel}>
			<h2 className={styles.summaryTitle}>Results Summary</h2>
			<div className={styles.summaryGrid}>
				<div className={styles.summaryItem}>
					<CheckCircle className={`${styles.iconSm} ${styles.iconPass}`} />
					Pass: {passCount}
				</div>
				<div className={styles.summaryItem}>
					<AlertTriangle className={`${styles.iconSm} ${styles.iconWarning}`} />
					Warning: {warningCount}
				</div>
				<div className={styles.summaryItem}>
					<XCircle className={`${styles.iconSm} ${styles.iconFail}`} />
					Fail: {failCount}
				</div>
			</div>
		</section>
	);
}
