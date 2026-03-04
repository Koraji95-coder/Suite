// src/components/layout/PageFrame.tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Stack, Text, Heading } from '@/components/primitives';

interface PageFrameProps {
  children: ReactNode;
  /** Page title */
  title?: string;
  /** Page description */
  description?: string;
  /** Right-aligned actions */
  actions?: ReactNode;
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Additional padding */
  padded?: boolean;
  className?: string;
}

const maxWidthClasses = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

export function PageFrame({
  children,
  title,
  description,
  actions,
  maxWidth = 'xl',
  padded = true,
  className,
}: PageFrameProps) {
  return (
    <div
      className={cn(
        'min-h-full w-full',
        padded && 'p-6 lg:p-8',
        className
      )}
    >
      <div className={cn('mx-auto w-full', maxWidthClasses[maxWidth])}>
        {/* Header */}
        {(title || actions) && (
          <div className="flex items-start justify-between gap-4 mb-6">
            <Stack gap={1}>
              {title && <Heading level={1}>{title}</Heading>}
              {description && (
                <Text color="muted" size="md">{description}</Text>
              )}
            </Stack>
            {actions && (
              <div className="flex items-center gap-3 shrink-0">
                {actions}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {children}
      </div>
    </div>
  );
}