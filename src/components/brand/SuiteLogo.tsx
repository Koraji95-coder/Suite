import { APP_NAME } from "@/appMeta";
import { cn } from "@/lib/utils";
import styles from "./SuiteLogo.module.css";

type SuiteLogoVariant = "full" | "compact" | "icon";
type SuiteLogoSize = "sm" | "md" | "lg";

interface SuiteLogoProps {
	variant?: SuiteLogoVariant;
	size?: SuiteLogoSize;
	className?: string;
	label?: string;
}

export function SuiteLogo({
	variant = "full",
	size = "md",
	className,
	label = APP_NAME,
}: SuiteLogoProps) {
	const showLabel = variant !== "icon";
	const showMonogramLabel = variant === "full";

	return (
		<span
			className={cn(
				styles.root,
				size === "sm" && styles.rootSm,
				size === "md" && styles.rootMd,
				size === "lg" && styles.rootLg,
				className,
			)}
		>
			<span className={styles.mark} aria-hidden="true">
				<span className={styles.markCore}>
					<span className={styles.markStrokeTop} />
					<span className={styles.markStrokeBottom} />
				</span>
			</span>
			{showLabel ? (
				<span className={styles.labelWrap}>
					<span className={styles.label}>{label}</span>
					{showMonogramLabel ? (
						<span className={styles.subLabel}>Drawing production control</span>
					) : null}
				</span>
			) : null}
		</span>
	);
}
