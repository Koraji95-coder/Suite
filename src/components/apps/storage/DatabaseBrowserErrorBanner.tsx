import { AlertTriangle } from "lucide-react";
import styles from "./DatabaseBrowserErrorBanner.module.css";

interface DatabaseBrowserErrorBannerProps {
	error: string | null;
	onDismiss: () => void;
}

export function DatabaseBrowserErrorBanner({
	error,
	onDismiss,
}: DatabaseBrowserErrorBannerProps) {
	if (!error) return null;

	return (
		<div className={styles.root}>
			<AlertTriangle className={styles.icon} />
			<span className={styles.message}>{error}</span>
			<button onClick={onDismiss} className={styles.dismissButton}>
				Dismiss
			</button>
		</div>
	);
}
