// src/components/primitives/Badge.tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./Badge.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type BadgeColor =
	| "default"
	| "primary"
	| "accent"
	| "success"
	| "warning"
	| "danger"
	| "info";
type BadgeVariant = "solid" | "soft" | "outline";
type BadgeSize = "sm" | "md";

export interface BadgeProps
	extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
	/** Color scheme */
	color?: BadgeColor;
	/** Visual variant */
	variant?: BadgeVariant;
	/** Size */
	size?: BadgeSize;
	/** Show dot indicator */
	dot?: boolean;
	/** Pulse the dot */
	pulse?: boolean;
	/** Left icon */
	icon?: ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<BadgeSize, string> = {
	sm: styles.sizeSm,
	md: styles.sizeMd,
};

// Variant + Color combinations
const colorVariantClasses: Record<BadgeVariant, Record<BadgeColor, string>> = {
	solid: {
		default: styles.solidDefault,
		primary: styles.solidPrimary,
		accent: styles.solidAccent,
		success: styles.solidSuccess,
		warning: styles.solidWarning,
		danger: styles.solidDanger,
		info: styles.solidInfo,
	},
	soft: {
		default: styles.softDefault,
		primary: styles.softPrimary,
		accent: styles.softAccent,
		success: styles.softSuccess,
		warning: styles.softWarning,
		danger: styles.softDanger,
		info: styles.softInfo,
	},
	outline: {
		default: styles.outlineDefault,
		primary: styles.outlinePrimary,
		accent: styles.outlineAccent,
		success: styles.outlineSuccess,
		warning: styles.outlineWarning,
		danger: styles.outlineDanger,
		info: styles.outlineInfo,
	},
};

const dotColorClasses: Record<BadgeColor, string> = {
	default: styles.dotDefault,
	primary: styles.dotPrimary,
	accent: styles.dotAccent,
	success: styles.dotSuccess,
	warning: styles.dotWarning,
	danger: styles.dotDanger,
	info: styles.dotInfo,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Badge — Status indicators, counts, labels
 *
 * @example
 * <Badge>Default</Badge>
 * <Badge color="success" dot>Active</Badge>
 * <Badge color="warning" variant="outline">Pending</Badge>
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
	(
		{
			color = "default",
			variant = "soft",
			size = "sm",
			dot = false,
			pulse = false,
			icon,
			className,
			children,
			...props
		},
		ref,
	) => {
		return (
			<span
				ref={ref}
				className={cn(
					styles.badge,
					sizeClasses[size],
					colorVariantClasses[variant][color],
					className,
				)}
				{...props}
			>
				{dot && (
					<span
						className={cn(
							styles.dot,
							dotColorClasses[color],
							pulse && styles.dotPulse,
						)}
					/>
				)}
				{icon && <span className={styles.icon}>{icon}</span>}
				{children}
			</span>
		);
	},
);

Badge.displayName = "Badge";

// ═══════════════════════════════════════════════════════════════════════════
// STATUS BADGE PRESET
// ═══════════════════════════════════════════════════════════════════════════

type Status =
	| "active"
	| "inactive"
	| "pending"
	| "complete"
	| "error"
	| "draft";

const statusConfig: Record<Status, { color: BadgeColor; label: string }> = {
	active: { color: "success", label: "Active" },
	inactive: { color: "default", label: "Inactive" },
	pending: { color: "warning", label: "Pending" },
	complete: { color: "primary", label: "Complete" },
	error: { color: "danger", label: "Error" },
	draft: { color: "default", label: "Draft" },
};

export interface StatusBadgeProps
	extends Omit<BadgeProps, "color" | "children"> {
	status: Status;
	label?: string;
}

/** StatusBadge — Preset status indicators */
export function StatusBadge({
	status,
	label,
	dot = true,
	...props
}: StatusBadgeProps) {
	const config = statusConfig[status];
	return (
		<Badge color={config.color} dot={dot} {...props}>
			{label ?? config.label}
		</Badge>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNT BADGE
// ═══════════════════════════════════════════════════════════════════════════

export interface CountBadgeProps extends Omit<BadgeProps, "children" | "dot"> {
	count: number;
	max?: number;
	showZero?: boolean;
}

/** CountBadge — Notification counts */
export function CountBadge({
	count,
	max = 99,
	showZero = false,
	color = "primary",
	...props
}: CountBadgeProps) {
	if (count === 0 && !showZero) return null;
	const display = count > max ? `${max}+` : count.toString();
	return (
		<Badge color={color} {...props}>
			{display}
		</Badge>
	);
}
