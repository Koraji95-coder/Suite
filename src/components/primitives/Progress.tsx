// src/components/primitives/Progress.tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Text } from './Text';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ProgressColor = 'primary' | 'accent' | 'success' | 'warning' | 'danger';
type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color'> {
  /** Progress value 0-100 */
  value: number;
  /** Max value */
  max?: number;
  /** Color */
  color?: ProgressColor;
  /** Bar height */
  size?: ProgressSize;
  /** Show percentage label */
  showValue?: boolean;
  /** Indeterminate loading */
  indeterminate?: boolean;
  /** Animated fill */
  animated?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const colorClasses: Record<ProgressColor, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progress — Progress bar
 *
 * @example
 * <Progress value={65} />
 * <Progress value={65} showValue color="success" />
 * <Progress indeterminate />
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value,
      max = 100,
      color = 'primary',
      size = 'md',
      showValue = false,
      indeterminate = false,
      animated = true,
      className,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    const progressBar = (
      <div
        className={cn(
          'w-full rounded-full bg-text/10 overflow-hidden',
          sizeClasses[size]
        )}
      >
        <div
          className={cn(
            'h-full rounded-full',
            colorClasses[color],
            animated && !indeterminate && 'transition-all duration-300 ease-out',
            indeterminate && 'w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]'
          )}
          style={{ width: indeterminate ? undefined : `${percentage}%` }}
        />
      </div>
    );

    if (!showValue) {
      return (
        <div ref={ref} className={className} {...props}>
          {progressBar}
          <style>{`
            @keyframes progress-indeterminate {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
          `}</style>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn('flex items-center gap-3', className)} {...props}>
        <div className="flex-1">{progressBar}</div>
        <Text size="xs" color="muted" mono className="min-w-9 text-right">
          {Math.round(percentage)}%
        </Text>
        <style>{`
          @keyframes progress-indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENTED PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

export interface SegmentedProgressProps {
  /** Total segments */
  segments: number;
  /** Current step (0-indexed) */
  current: number;
  /** Color */
  color?: ProgressColor;
  /** Size */
  size?: ProgressSize;
  className?: string;
}

/** SegmentedProgress — Multi-step indicator */
export function SegmentedProgress({
  segments,
  current,
  color = 'primary',
  size = 'md',
  className,
}: SegmentedProgressProps) {
  return (
    <div className={cn('flex gap-1 w-full', className)}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex-1 rounded-full transition-colors duration-150',
            sizeClasses[size],
            i <= current ? colorClasses[color] : 'bg-text/10'
          )}
        />
      ))}
    </div>
  );
}