// src/components/primitives/Badge.tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
// STYLE CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const baseClasses =
	"inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-full";

const sizeClasses: Record<BadgeSize, string> = {
	sm: "h-5 px-2 text-[11px]",
	md: "h-6 px-2.5 text-xs",
};

// Variant + Color combinations
const colorVariantClasses: Record<BadgeVariant, Record<BadgeColor, string>> = {
	solid: {
		default: "bg-surface-2 text-text",
		primary: "bg-primary text-primary-contrast",
		accent: "bg-accent text-bg",
		success: "bg-success text-white",
		warning: "bg-warning text-black",
		danger: "bg-danger text-white",
		info: "bg-info text-white",
	},
	soft: {
		default: "bg-text/10 text-text-muted",
		primary: "bg-primary/15 text-primary",
		accent: "bg-accent/15 text-accent",
		success: "bg-success/15 text-success",
		warning: "bg-warning/15 text-warning",
		danger: "bg-danger/15 text-danger",
		info: "bg-info/15 text-info",
	},
	outline: {
		default: "border border-border text-text-muted",
		primary: "border border-primary/50 text-primary",
		accent: "border border-accent/50 text-accent",
		success: "border border-success/50 text-success",
		warning: "border border-warning/50 text-warning",
		danger: "border border-danger/50 text-danger",
		info: "border border-info/50 text-info",
	},
};

const dotColorClasses: Record<BadgeColor, string> = {
	default: "bg-text-muted",
	primary: "bg-primary",
	accent: "bg-accent",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
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
					baseClasses,
					sizeClasses[size],
					colorVariantClasses[variant][color],
					className,
				)}
				{...props}
			>
				{dot && (
					<span
						className={cn(
							"w-1.5 h-1.5 rounded-full shrink-0",
							dotColorClasses[color],
							pulse && "animate-pulse-soft",
						)}
					/>
				)}
				{icon && <span className="shrink-0">{icon}</span>}
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
