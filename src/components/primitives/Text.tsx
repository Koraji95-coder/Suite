// src/components/primitives/Text.tsx
import {
	type ElementType,
	forwardRef,
	type HTMLAttributes,
	type LabelHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

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
// CLASS MAPS
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<TextSize, string> = {
	xs: "text-[11px] leading-4",
	sm: "text-[13px] leading-5",
	base: "text-sm leading-5",
	md: "text-[15px] leading-6",
	lg: "text-lg leading-7",
	xl: "text-xl leading-7 tracking-tight",
	"2xl": "text-2xl leading-8 tracking-tight",
	"3xl": "text-[32px] leading-10 tracking-tight",
};

const weightClasses: Record<TextWeight, string> = {
	normal: "font-normal",
	medium: "font-medium",
	semibold: "font-semibold",
	bold: "font-bold",
};

const colorClasses: Record<TextColor, string> = {
	default: "text-text",
	muted: "text-text-muted",
	primary: "text-primary",
	accent: "text-accent",
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
	inherit: "text-inherit",
};

const alignClasses = {
	left: "text-left",
	center: "text-center",
	right: "text-right",
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
		return (
			<Component
				ref={ref}
				className={cn(
					sizeClasses[size],
					weight && weightClasses[weight],
					colorClasses[color],
					align && alignClasses[align],
					mono && "font-mono",
					block && "block",
					uppercase && "uppercase tracking-wider",
					truncate && !maxLines && "truncate",
					truncate && maxLines && "line-clamp-" + maxLines,
					className,
				)}
				style={style}
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
			className={cn("px-1.5 py-0.5 rounded-md bg-surface-2", className)}
			{...props}
		/>
	),
);
Code.displayName = "Code";
