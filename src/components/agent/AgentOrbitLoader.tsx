import { cn } from "@/lib/utils";
import styles from "./AgentOrbitLoader.module.css";

type AgentOrbitLoaderSize = "sm" | "md" | "lg";

interface AgentOrbitLoaderProps {
	className?: string;
	size?: AgentOrbitLoaderSize;
}

const SIZE_CLASS: Record<AgentOrbitLoaderSize, string> = {
	sm: styles.sizeSm,
	md: styles.sizeMd,
	lg: styles.sizeLg,
};

export function AgentOrbitLoader({
	className,
	size = "md",
}: AgentOrbitLoaderProps) {
	return (
		<div className={cn(styles.root, SIZE_CLASS[size], className)} aria-hidden="true">
			<div className={styles.ring}>
				<div className={styles.pulse} />
			</div>
			<div className={styles.core} />
		</div>
	);
}
