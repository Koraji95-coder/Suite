// src/components/primitives/Text.tsx
import {
	type CSSProperties,
	type ElementType,
	forwardRef,
	type HTMLAttributes,
	type LabelHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import styles from "./Text.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TextSize = "xs" | "sm" | "base" | "md" | "lg" | "xl" | "2xl" | "3xl";
type TextWeight = "normal" | "medium" | "semibold" | "bold";
type TextColor =
	| "default"
	| "muted"
	| "primary"
	| "accent"
	| "success"
	| "warning"
	| "danger"
	| "inherit";

export interface TextProps extends HTMLAttributes<HTMLElement> {
	/** Text size */
	size?: TextSize;
	/** Font weight */
	weight?: TextWeight;
	/** Text color */
	color?: TextColor;
	/** Render as different element */
	as?: ElementType;
	/** Use monospace font */
	mono?: boolean;
	/** Truncate with ellipsis */
	truncate?: boolean;
	/** Max lines before truncating */
	maxLines?: number;
	/** Text alignment */
	align?: "left" | "center" | "right";
	/** Block display */
	block?: boolean;
	/** Uppercase */
	uppercase?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<TextSize, string> = {
	xs: styles.sizeXs,
	sm: styles.sizeSm,
	base: styles.sizeBase,
	md: styles.sizeMd,
	lg: styles.sizeLg,
	xl: styles.sizeXl,
	"2xl": styles.size2xl,
	"3xl": styles.size3xl,
};

const weightClasses: Record<TextWeight, string> = {
	normal: styles.weightNormal,
	medium: styles.weightMedium,
	semibold: styles.weightSemibold,
	bold: styles.weightBold,
};

const colorClasses: Record<TextColor, string> = {
	default: styles.colorDefault,
	muted: styles.colorMuted,
	primary: styles.colorPrimary,
	accent: styles.colorAccent,
	success: styles.colorSuccess,
	warning: styles.colorWarning,
	danger: styles.colorDanger,
	inherit: styles.colorInherit,
};

const alignClasses = {
	left: styles.alignLeft,
	center: styles.alignCenter,
	right: styles.alignRight,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Text — Typography primitive
 *
 * @example
 * <Text>Default body text</Text>
 * <Text size="2xl" weight="semibold">Heading</Text>
 * <Text color="muted" size="sm">Caption</Text>
 */
export const Text = forwardRef<HTMLElement, TextProps>(
	(
		{
			size = "base",
			weight,
			color = "default",
			as: Component = "span",
			mono = false,
			truncate = false,
			maxLines,
			align,
			block = false,
			uppercase = false,
			className,
			style,
			children,
			...props
		},
		ref,
	) => {
		const computedStyle: CSSProperties | undefined =
			truncate && maxLines
				? {
						...style,
						WebkitLineClamp: maxLines,
					}
				: style;

		return (
			<Component
				ref={ref}
				className={cn(
					sizeClasses[size],
					weight && weightClasses[weight],
					colorClasses[color],
					align && alignClasses[align],
					mono && styles.mono,
					block && styles.block,
					uppercase && styles.uppercase,
					truncate && !maxLines && styles.truncateSingle,
					truncate && maxLines && styles.truncateClamp,
					className,
				)}
				style={computedStyle}
				{...props}
			>
				{children}
			</Component>
		);
	},
);

Text.displayName = "Text";

// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════

export interface HeadingProps extends Omit<TextProps, "as"> {
	level?: 1 | 2 | 3 | 4 | 5 | 6;
}

const headingConfig: Record<number, { size: TextSize; weight: TextWeight }> = {
	1: { size: "3xl", weight: "bold" },
	2: { size: "2xl", weight: "semibold" },
	3: { size: "xl", weight: "semibold" },
	4: { size: "lg", weight: "semibold" },
	5: { size: "md", weight: "medium" },
	6: { size: "base", weight: "medium" },
};

/** Heading — Semantic heading with smart defaults */
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
	({ level = 2, size, weight, ...props }, ref) => {
		const config = headingConfig[level];
		const tag = `h${level}` as ElementType;
		return (
			<Text
				ref={ref}
				as={tag}
				size={size ?? config.size}
				weight={weight ?? config.weight}
				block
				{...props}
			/>
		);
	},
);
Heading.displayName = "Heading";

/** Label — Form labels */
type LabelProps = Omit<TextProps, "as"> & LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
	({ size = "sm", weight = "medium", ...props }, ref) => (
		<Text ref={ref} as="label" size={size} weight={weight} block {...props} />
	),
);
Label.displayName = "Label";

/** Caption — Small muted text */
export const Caption = forwardRef<
	HTMLSpanElement,
	Omit<TextProps, "size" | "color">
>((props, ref) => <Text ref={ref} size="xs" color="muted" {...props} />);
Caption.displayName = "Caption";

/** Code — Inline code */
export const Code = forwardRef<HTMLElement, Omit<TextProps, "as" | "mono">>(
	({ className, ...props }, ref) => (
		<Text
			ref={ref}
			as="code"
			size="sm"
			mono
			className={cn(styles.codeInline, className)}
			{...props}
		/>
	),
);
Code.displayName = "Code";
