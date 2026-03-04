import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./LoadingCard.module.css";

export interface LoadingCardProps {
	title?: string;
	children?: ReactNode;
	label?: string;
	icon?: ReactNode;
	isActive?: boolean;
	isComplete?: boolean;
	index?: number;
}

export function LoadingCard({
	title = "Loading",
	children,
	label,
	icon,
	isActive,
	isComplete,
	index,
}: LoadingCardProps) {
	const displayTitle = label ?? title;
	const statusClass = isActive
		? styles.statusActive
		: isComplete
			? styles.statusComplete
			: styles.statusIdle;

	return (
		<div className={cn(styles.root, statusClass)}>
			<div className={styles.header}>
				<div className={styles.title}>{displayTitle}</div>
				{icon ? <div>{icon}</div> : null}
			</div>
			<div className={styles.body}>
				{children ||
					`Step ${typeof index === "number" ? index + 1 : ""}`.trim() ||
					"Please wait…"}
			</div>
		</div>
	);
}
