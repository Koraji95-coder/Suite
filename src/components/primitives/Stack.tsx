// src/components/primitives/Stack.tsx
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./Stack.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
	/** Stack direction */
	direction?: "row" | "column";
	/** Gap between items (shared spacing scale) */
	gap?: Gap;
	/** Align items (cross-axis) */
	align?: "start" | "center" | "end" | "stretch" | "baseline";
	/** Justify content (main-axis) */
	justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
	/** Allow wrapping */
	wrap?: boolean;
	/** Full width */
	fluid?: boolean;
	/** Inline flex */
	inline?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const gapClasses: Record<Gap, string> = {
	0: styles.gap0,
	1: styles.gap1,
	2: styles.gap2,
	3: styles.gap3,
	4: styles.gap4,
	5: styles.gap5,
	6: styles.gap6,
	8: styles.gap8,
	10: styles.gap10,
	12: styles.gap12,
};

const alignClasses = {
	start: styles.alignStart,
	center: styles.alignCenter,
	end: styles.alignEnd,
	stretch: styles.alignStretch,
	baseline: styles.alignBaseline,
};

const justifyClasses = {
	start: styles.justifyStart,
	center: styles.justifyCenter,
	end: styles.justifyEnd,
	between: styles.justifyBetween,
	around: styles.justifyAround,
	evenly: styles.justifyEvenly,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stack — Flexbox layout primitive
 *
 * @example
 * <Stack gap={4}>
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </Stack>
 *
 * @example
 * <Stack direction="row" align="center" justify="between">
 *   <Logo />
 *   <Nav />
 * </Stack>
 */
export const Stack = forwardRef<HTMLDivElement, StackProps>(
	(
		{
			direction = "column",
			gap = 0,
			align,
			justify,
			wrap = false,
			fluid = false,
			inline = false,
			className,
			children,
			...props
		},
		ref,
	) => {
		return (
			<div
				ref={ref}
				className={cn(
					inline ? styles.inlineFlex : styles.flex,
					direction === "row" ? styles.row : styles.column,
					gapClasses[gap],
					align && alignClasses[align],
					justify && justifyClasses[justify],
					wrap && styles.wrap,
					fluid && styles.fluid,
					className,
				)}
				{...props}
			>
				{children}
			</div>
		);
	},
);

Stack.displayName = "Stack";

// ═══════════════════════════════════════════════════════════════════════════
// SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════

/** Horizontal stack */
export const HStack = forwardRef<HTMLDivElement, Omit<StackProps, "direction">>(
	(props, ref) => <Stack ref={ref} direction="row" {...props} />,
);
HStack.displayName = "HStack";

/** Vertical stack */
export const VStack = forwardRef<HTMLDivElement, Omit<StackProps, "direction">>(
	(props, ref) => <Stack ref={ref} direction="column" {...props} />,
);
VStack.displayName = "VStack";

// ═══════════════════════════════════════════════════════════════════════════
// SPACER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spacer — Pushes siblings apart or adds fixed space
 *
 * @example
 * <HStack>
 *   <Logo />
 *   <Spacer />
 *   <Button>Sign in</Button>
 * </HStack>
 */
export function Spacer({ size }: { size?: Gap }) {
	if (size !== undefined) {
		const sizeClasses: Record<Gap, string> = {
			0: styles.spacer0,
			1: styles.spacer1,
			2: styles.spacer2,
			3: styles.spacer3,
			4: styles.spacer4,
			5: styles.spacer5,
			6: styles.spacer6,
			8: styles.spacer8,
			10: styles.spacer10,
			12: styles.spacer12,
		};
		return <div className={cn(styles.spacer, sizeClasses[size])} aria-hidden />;
	}
	return <div className={styles.spacerFlex} aria-hidden />;
}
