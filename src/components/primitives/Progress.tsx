// src/components/primitives/Progress.tsx
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./Progress.module.css";
import { Text } from "./Text";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ProgressColor = "primary" | "accent" | "success" | "warning" | "danger";
type ProgressSize = "sm" | "md" | "lg";

export interface ProgressProps
	extends Omit<HTMLAttributes<HTMLDivElement>, "color"> {
	/** Progress value 0-100 */
	value: number;
	/** Max value */
	max?: number;
	/** Color */
	color?: ProgressColor;
	/** Bar height */
	size?: ProgressSize;
	/** Show percentage label */
	showValue?: boolean;
	/** Indeterminate loading */
	indeterminate?: boolean;
	/** Animated fill */
	animated?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<ProgressSize, string> = {
	sm: styles.sizeSm,
	md: styles.sizeMd,
	lg: styles.sizeLg,
};

const colorClasses: Record<ProgressColor, string> = {
	primary: styles.colorPrimary,
	accent: styles.colorAccent,
	success: styles.colorSuccess,
	warning: styles.colorWarning,
	danger: styles.colorDanger,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progress — Progress bar
 *
 * @example
 * <Progress value={65} />
 * <Progress value={65} showValue color="success" />
 * <Progress indeterminate />
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
	(
		{
			value,
			max = 100,
			color = "primary",
			size = "md",
			showValue = false,
			indeterminate = false,
			animated = true,
			className,
			...props
		},
		ref,
	) => {
		const percentage = Math.min(100, Math.max(0, (value / max) * 100));

		const progressBar = (
			<div className={cn(styles.track, sizeClasses[size])}>
				<div
					className={cn(
						styles.fill,
						colorClasses[color],
						animated && !indeterminate && styles.animated,
						indeterminate && styles.indeterminate,
					)}
					style={{ width: indeterminate ? undefined : `${percentage}%` }}
				/>
			</div>
		);

		if (!showValue) {
			return (
				<div ref={ref} className={className} {...props}>
					{progressBar}
				</div>
			);
		}

		return (
			<div ref={ref} className={cn(styles.withValueWrap, className)} {...props}>
				<div className={styles.withValueTrack}>{progressBar}</div>
				<Text size="xs" color="muted" mono className={styles.valueText}>
					{Math.round(percentage)}%
				</Text>
			</div>
		);
	},
);

Progress.displayName = "Progress";

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTED PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentedProgressProps {
	/** Total segments */
	segments: number;
	/** Current step (0-indexed) */
	current: number;
	/** Color */
	color?: ProgressColor;
	/** Size */
	size?: ProgressSize;
	className?: string;
}

/** SegmentedProgress — Multi-step indicator */
export function SegmentedProgress({
	segments,
	current,
	color = "primary",
	size = "md",
	className,
}: SegmentedProgressProps) {
	return (
		<div className={cn(styles.segmentedWrap, className)}>
			{Array.from({ length: segments }).map((_, i) => (
				<div
					key={i}
					className={cn(
						styles.segment,
						sizeClasses[size],
						i <= current ? colorClasses[color] : styles.segmentInactive,
					)}
				/>
			))}
		</div>
	);
}
