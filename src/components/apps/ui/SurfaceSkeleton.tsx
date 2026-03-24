import { cn } from "@/lib/utils";
import styles from "./SurfaceSkeleton.module.css";

type SurfaceSkeletonTone = "hero" | "feature" | "support";
type SurfaceSkeletonHeight = "compact" | "regular" | "tall";

export function SurfaceSkeleton({
	tone = "support",
	height = "regular",
	className,
	lines = 3,
}: {
	tone?: SurfaceSkeletonTone;
	height?: SurfaceSkeletonHeight;
	className?: string;
	lines?: number;
}) {
	const lineCount = Math.max(1, lines);

	return (
		<div
			className={cn(
				styles.surface,
				tone === "hero" && styles.hero,
				tone === "feature" && styles.feature,
				tone === "support" && styles.support,
				height === "compact" && styles.compact,
				height === "regular" && styles.regular,
				height === "tall" && styles.tall,
				className,
			)}
			aria-hidden="true"
		>
			<div className={cn(styles.line, styles.lineShort)} />
			<div className={cn(styles.line, styles.lineMedium)} />
			{lineCount > 2 ? <div className={cn(styles.line, styles.lineLong)} /> : null}
			<div className={styles.block} />
		</div>
	);
}
