// src/components/primitives/Panel.tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type PanelVariant = 'default' | 'elevated' | 'outline' | 'ghost' | 'glass' | 'inset';
type PanelPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';
type PanelRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';

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
// STYLE CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const variantClasses: Record<PanelVariant, string> = {
  default: 'bg-surface border border-border shadow-sm',
  elevated: 'bg-surface border border-border-subtle shadow-md',
  outline: 'bg-transparent border border-border',
  ghost: 'bg-transparent border border-transparent',
  glass: 'bg-surface/60 backdrop-blur-xl border border-border shadow-lg',
  inset: 'bg-bg shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-border-subtle',
};

const paddingClasses: Record<PanelPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

const radiusClasses: Record<PanelRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
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
      variant = 'default',
      padding = 'md',
      radius = 'lg',
      hover = false,
      interactive = false,
      borderless = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isClickable = interactive || !!props.onClick;

    return (
      <div
        ref={ref}
        className={cn(
          // Base
          'relative transition-all duration-150',
          // Variant
          variantClasses[variant],
          // Padding & Radius
          paddingClasses[padding],
          radiusClasses[radius],
          // Borderless override
          borderless && 'border-transparent',
          // Hover effects
          hover && 'hover:-translate-y-0.5 hover:shadow-md hover:border-border-strong',
          // Interactive
          isClickable && 'cursor-pointer active:scale-[0.99]',
          // Ghost hover (only shows bg on hover)
          variant === 'ghost' && hover && 'hover:bg-surface',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = 'Panel';

// ═══════════════════════════════════════════════════════════════════════════
// PANEL SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PanelSectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** PanelHeader — Top section with bottom border */
export function PanelHeader({ className, children, ...props }: PanelSectionProps) {
  return (
    <div
      className={cn('pb-4 mb-4 border-b border-border', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** PanelBody — Main content area */
export function PanelBody({ className, children, ...props }: PanelSectionProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

/** PanelFooter — Bottom section with top border */
export function PanelFooter({ className, children, ...props }: PanelSectionProps) {
  return (
    <div
      className={cn('pt-4 mt-4 border-t border-border', className)}
      {...props}
    >
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
  direction?: 'row' | 'column';
}

const gapClasses: Record<Gap, string> = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
};

/** PanelGroup — Arrange panels with consistent spacing */
export function PanelGroup({
  gap = 4,
  direction = 'column',
  className,
  children,
  ...props
}: PanelGroupProps) {
  return (
    <div
      className={cn(
        'flex',
        direction === 'row' ? 'flex-row' : 'flex-col',
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}