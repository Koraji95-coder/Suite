// src/components/primitives/Stack.tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Stack direction */
  direction?: 'row' | 'column';
  /** Gap between items (Tailwind spacing scale) */
  gap?: Gap;
  /** Align items (cross-axis) */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Justify content (main-axis) */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Allow wrapping */
  wrap?: boolean;
  /** Full width */
  fluid?: boolean;
  /** Inline flex */
  inline?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const gapClasses: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
};

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
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
      direction = 'column',
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
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          inline ? 'inline-flex' : 'flex',
          direction === 'row' ? 'flex-row' : 'flex-col',
          gapClasses[gap],
          align && alignClasses[align],
          justify && justifyClasses[justify],
          wrap && 'flex-wrap',
          fluid && 'w-full',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = 'Stack';

// ═══════════════════════════════════════════════════════════════════════════
// SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════

/** Horizontal stack */
export const HStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
);
HStack.displayName = 'HStack';

/** Vertical stack */
export const VStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
);
VStack.displayName = 'VStack';

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
      0: 'w-0 h-0',
      1: 'w-1 h-1',
      2: 'w-2 h-2',
      3: 'w-3 h-3',
      4: 'w-4 h-4',
      5: 'w-5 h-5',
      6: 'w-6 h-6',
      8: 'w-8 h-8',
      10: 'w-10 h-10',
      12: 'w-12 h-12',
    };
    return <div className={cn('shrink-0', sizeClasses[size])} aria-hidden />;
  }
  return <div className="flex-1" aria-hidden />;
}