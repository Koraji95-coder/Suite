// src/components/system/base/Button.tsx
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./Button.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	/** Visual variant */
	variant?: ButtonVariant;
	/** Size */
	size?: ButtonSize;
	/** Left icon */
	iconLeft?: ReactNode;
	/** Right icon */
	iconRight?: ReactNode;
	/** Icon-only (square button) */
	iconOnly?: boolean;
	/** Loading state */
	loading?: boolean;
	/** Full width */
	fluid?: boolean;
	/** Active/pressed state */
	active?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const variantClasses: Record<ButtonVariant, string> = {
	primary: styles.variantPrimary,
	secondary: styles.variantSecondary,
	outline: styles.variantOutline,
	ghost: styles.variantGhost,
	danger: styles.variantDanger,
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: styles.sizeSm,
	md: styles.sizeMd,
	lg: styles.sizeLg,
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
	sm: styles.iconOnlySm,
	md: styles.iconOnlyMd,
	lg: styles.iconOnlyLg,
};

// ═══════════════════════════════════════════════════════════════════════════
// SPINNER
// ═══════════════════════════════════════════════════════════════════════════

function Spinner({ className }: { className?: string }) {
	return (
		<svg
			className={cn(styles.spinner, className)}
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
		>
			<circle
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				className={styles.spinnerTrack}
			/>
			<path
				d="M12 2a10 10 0 0 1 10 10"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Button — Primary interaction element
 *
 * @example
 * <Button>Save Changes</Button>
 * <Button variant="secondary" iconLeft={<PlusIcon />}>Add Item</Button>
 * <Button variant="ghost" iconOnly><SettingsIcon /></Button>
 * <Button loading>Saving...</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			variant = "primary",
			size = "md",
			iconLeft,
			iconRight,
			iconOnly = false,
			loading = false,
			fluid = false,
			active = false,
			disabled,
			className,
			children,
			...props
		},
		ref,
	) => {
		const isDisabled = disabled || loading;

		return (
			<button
				ref={ref}
				disabled={isDisabled}
				className={cn(
					styles.button,
					variantClasses[variant],
					iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
					fluid && styles.fluid,
					active && styles.active,
					className,
				)}
				{...props}
			>
				{loading ? (
					<Spinner
						className={size === "sm" ? styles.spinnerSm : styles.spinnerMd}
					/>
				) : iconLeft ? (
					<span className={styles.iconSlot}>{iconLeft}</span>
				) : null}

				{!iconOnly && children && <span>{children}</span>}

				{iconRight && !loading && (
					<span className={styles.iconSlot}>{iconRight}</span>
				)}
			</button>
		);
	},
);

Button.displayName = "Button";

// ═══════════════════════════════════════════════════════════════════════════
// ICON BUTTON SHORTCUT
// ═══════════════════════════════════════════════════════════════════════════

export interface IconButtonProps
	extends Omit<ButtonProps, "iconOnly" | "iconRight" | "children"> {
	/** Icon to display */
	icon: ReactNode;
	/** Required for accessibility */
	"aria-label": string;
}

/**
 * IconButton — Square icon-only button
 *
 * @example
 * <IconButton icon={<SettingsIcon />} aria-label="Settings" />
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	({ icon, variant = "ghost", ...props }, ref) => (
		<Button ref={ref} variant={variant} iconOnly iconLeft={icon} {...props} />
	),
);

IconButton.displayName = "IconButton";

// ═══════════════════════════════════════════════════════════════════════════
// BUTTON GROUP
// ═══════════════════════════════════════════════════════════════════════════

export interface ButtonGroupProps {
	children: ReactNode;
	/** Attach buttons together */
	attached?: boolean;
	className?: string;
}

/**
 * ButtonGroup — Group related buttons
 *
 * @example
 * <ButtonGroup attached>
 *   <Button variant="secondary">Day</Button>
 *   <Button variant="secondary">Week</Button>
 *   <Button variant="secondary">Month</Button>
 * </ButtonGroup>
 */
export function ButtonGroup({
	children,
	attached = false,
	className,
}: ButtonGroupProps) {
	return (
		<div
			role="group"
			className={cn(
				styles.groupRoot,
				attached ? styles.groupAttached : styles.groupGap,
				className,
			)}
		>
			{children}
		</div>
	);
}
