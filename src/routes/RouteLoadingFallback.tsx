import { PageFrame } from "@/components/apps/ui/PageFrame";
import { SurfaceSkeleton } from "@/components/apps/ui/SurfaceSkeleton";
import styles from "./RouteLoadingFallback.module.css";

export default function RouteLoadingFallback() {
	return (
		<PageFrame maxWidth="full">
			<div
				className={styles.root}
				aria-busy="true"
				aria-live="polite"
				aria-label="Loading workspace module."
			>
				<SurfaceSkeleton tone="hero" height="compact" className={styles.band} />
				<div className={styles.sectionGrid}>
					<SurfaceSkeleton tone="support" height="regular" />
					<SurfaceSkeleton tone="support" height="regular" />
					<SurfaceSkeleton
						tone="feature"
						height="tall"
						className={styles.panelWide}
					/>
				</div>
			</div>
		</PageFrame>
	);
}
