import { APP_NAME } from "@/appMeta";
import { SurfaceSkeleton } from "@/components/system/SurfaceSkeleton";
import { Text } from "@/components/system/base";
import styles from "./AuthGateLoadingScreen.module.css";

export function AuthGateLoadingScreen() {
	return (
		<div className={styles.root} aria-busy="true" aria-live="polite">
			<div className={styles.shell}>
				<div className={styles.eyebrow}>{APP_NAME} Workspace</div>
				<div className={styles.frame}>
					<div className={styles.kicker}>Suite workspace</div>
					<div className={styles.panelGrid}>
						<SurfaceSkeleton tone="hero" height="compact" />
						<SurfaceSkeleton tone="support" height="regular" />
						<SurfaceSkeleton tone="feature" height="tall" />
					</div>
				</div>
			</div>
			<Text size="sm" color="muted" className={styles.srOnly}>
				Restoring your authenticated workspace.
			</Text>
		</div>
	);
}
