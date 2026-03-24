// src/components/primitives/Panel.tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./Panel.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type PanelVariant =
	| "default"
	| "elevated"
	| "support"
	| "feature"
	| "sunken"
	| "overlay"
	| "outline"
	| "ghost"
	| "glass"
	| "inset";
type PanelPadding = "none" | "sm" | "md" | "lg" | "xl";
type PanelRadius = "none" | "sm" | "md" | "lg" | "xl";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
	/** Visual variant */
	variant?: PanelVariant;
	/** Inner padding */
	padding?: PanelPadding;
	/** Border radius */
	radius?: PanelRadius;
	/** Hover effect */
	hover?: boolean;
	/** Make clickable */
	interactive?: boolean;
	/** Remove border */
	borderless?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const variantClasses: Record<PanelVariant, string> = {
	default: styles.variantDefault,
	elevated: styles.variantElevated,
	support: styles.variantSupport,
	feature: styles.variantFeature,
	sunken: styles.variantSunken,
	overlay: styles.variantOverlay,
	outline: styles.variantOutline,
	ghost: styles.variantGhost,
	glass: styles.variantGlass,
	inset: styles.variantInset,
};

const paddingClasses: Record<PanelPadding, string> = {
	none: styles.paddingNone,
	sm: styles.paddingSm,
	md: styles.paddingMd,
	lg: styles.paddingLg,
	xl: styles.paddingXl,
};

const radiusClasses: Record<PanelRadius, string> = {
	none: styles.radiusNone,
	sm: styles.radiusSm,
	md: styles.radiusMd,
	lg: styles.radiusLg,
	xl: styles.radiusXl,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Panel — Container primitive (replaces Card, Surface, GlassPanel)
 *
 * @example
 * <Panel padding="lg">Content</Panel>
 * <Panel variant="elevated" hover>Hoverable card</Panel>
 * <Panel variant="glass">Frosted glass</Panel>
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(
	(
		{
			variant = "default",
			padding = "md",
			radius = "lg",
			hover = false,
			interactive = false,
			borderless = false,
			className,
			children,
			...props
		},
		ref,
	) => {
		const isClickable = interactive || !!props.onClick;

		return (
			<div
				ref={ref}
				className={cn(
					// Base
					styles.panel,
					// Variant
					variantClasses[variant],
					// Padding & Radius
					paddingClasses[padding],
					radiusClasses[radius],
					// Borderless override
					borderless && styles.borderless,
					// Hover effects
					hover && styles.hover,
					// Interactive
					isClickable && styles.interactive,
					// Ghost hover (only shows bg on hover)
					variant === "ghost" && hover && styles.ghostHover,
					className,
				)}
				{...props}
			>
				{children}
			</div>
		);
	},
);

Panel.displayName = "Panel";

// ═══════════════════════════════════════════════════════════════════════════
// PANEL SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PanelSectionProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

/** PanelHeader — Top section with bottom border */
export function PanelHeader({
	className,
	children,
	...props
}: PanelSectionProps) {
	return (
		<div className={cn(styles.sectionHeader, className)} {...props}>
			{children}
		</div>
	);
}

/** PanelBody — Main content area */
export function PanelBody({
	className,
	children,
	...props
}: PanelSectionProps) {
	return (
		<div className={className} {...props}>
			{children}
		</div>
	);
}

/** PanelFooter — Bottom section with top border */
export function PanelFooter({
	className,
	children,
	...props
}: PanelSectionProps) {
	return (
		<div className={cn(styles.sectionFooter, className)} {...props}>
			{children}
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL GROUP
// ═══════════════════════════════════════════════════════════════════════════

type Gap = 2 | 3 | 4 | 5 | 6;

export interface PanelGroupProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	/** Gap between panels */
	gap?: Gap;
	/** Stack direction */
	direction?: "row" | "column";
}

const gapClasses: Record<Gap, string> = {
	2: styles.gap2,
	3: styles.gap3,
	4: styles.gap4,
	5: styles.gap5,
	6: styles.gap6,
};

/** PanelGroup — Arrange panels with consistent spacing */
export function PanelGroup({
	gap = 4,
	direction = "column",
	className,
	children,
	...props
}: PanelGroupProps) {
	return (
		<div
			className={cn(
				styles.group,
				direction === "row" ? styles.groupRow : styles.groupColumn,
				gapClasses[gap],
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
