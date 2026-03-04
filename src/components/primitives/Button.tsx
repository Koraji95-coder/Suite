// src/components/primitives/Button.tsx
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
// STYLE CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const baseClasses = `
  inline-flex items-center justify-center gap-2
  font-semibold whitespace-nowrap
  transition-all duration-150 ease-out
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg
  disabled:opacity-50 disabled:cursor-not-allowed
  cursor-pointer select-none
`;

const variantClasses: Record<ButtonVariant, string> = {
	primary: `
    bg-primary text-primary-contrast
    hover:brightness-110 active:brightness-95
  `,
	secondary: `
    bg-surface-2 text-text border border-border
    hover:bg-surface-2/80 hover:border-border-strong
    active:bg-surface
  `,
	outline: `
    bg-transparent text-primary border border-primary/40
    hover:bg-primary/10 hover:border-primary
    active:bg-primary/15
  `,
	ghost: `
    bg-transparent text-text-muted
    hover:bg-surface hover:text-text
    active:bg-surface-2
  `,
	danger: `
    bg-danger text-white
    hover:brightness-110 active:brightness-95
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-[13px] rounded-lg",
	md: "h-10 px-4 text-sm rounded-lg",
	lg: "h-12 px-5 text-[15px] rounded-xl",
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
	sm: "h-8 w-8 p-0 rounded-lg",
	md: "h-10 w-10 p-0 rounded-lg",
	lg: "h-12 w-12 p-0 rounded-xl",
};

// ═══════════════════════════════════════════════════════════════════════════
// SPINNER
// ═══════════════════════════════════════════════════════════════════════════

function Spinner({ className }: { className?: string }) {
	return (
		<svg
			className={cn("animate-spin", className)}
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
				className="opacity-25"
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
					baseClasses,
					variantClasses[variant],
					iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
					fluid && "w-full",
					active && "ring-2 ring-primary ring-offset-2 ring-offset-bg",
					className,
				)}
				{...props}
			>
				{loading ? (
					<Spinner className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
				) : iconLeft ? (
					<span className="shrink-0">{iconLeft}</span>
				) : null}

				{!iconOnly && children && <span>{children}</span>}

				{iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
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
				"inline-flex",
				attached
					? "[&>button]:rounded-none [&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button:not(:last-child)]:border-r-0"
					: "gap-2",
				className,
			)}
		>
			{children}
		</div>
	);
}
