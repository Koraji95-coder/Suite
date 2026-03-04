// src/components/primitives/Input.tsx
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { Text } from './Text';
import { Stack } from './Stack';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type InputSize = 'sm' | 'md' | 'lg';
type InputVariant = 'default' | 'filled' | 'ghost';

interface InputBaseProps {
  /** Size */
  inputSize?: InputSize;
  /** Variant */
  variant?: InputVariant;
  /** Left icon */
  iconLeft?: ReactNode;
  /** Right icon */
  iconRight?: ReactNode;
  /** Error state */
  error?: boolean;
  /** Error message */
  errorMessage?: string;
  /** Helper text */
  helperText?: string;
  /** Label */
  label?: string;
  /** Required */
  required?: boolean;
  /** Full width */
  fluid?: boolean;
}

export interface InputProps
  extends InputBaseProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {}

export interface TextAreaProps
  extends InputBaseProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** Minimum rows */
  minRows?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE CLASSES
// ═══════════════════════════════════════════════════════════════════════════

const baseInputClasses = `
  w-full rounded-lg font-normal transition-all duration-150
  placeholder:text-text-muted/60
  focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-[15px]',
};

const iconPaddingClasses: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'pl-8', right: 'pr-8' },
  md: { left: 'pl-10', right: 'pr-10' },
  lg: { left: 'pl-11', right: 'pr-11' },
};

const variantClasses: Record<InputVariant, { normal: string; error: string }> = {
  default: {
    normal: 'bg-bg border border-border text-text',
    error: 'bg-bg border border-danger text-text focus:ring-danger/20 focus:border-danger',
  },
  filled: {
    normal: 'bg-surface border border-transparent text-text',
    error: 'bg-surface border border-danger text-text focus:ring-danger/20 focus:border-danger',
  },
  ghost: {
    normal: 'bg-transparent border border-transparent text-text hover:bg-surface focus:bg-surface',
    error: 'bg-transparent border border-danger text-text focus:ring-danger/20',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input — Text input field
 *
 * @example
 * <Input placeholder="Enter text..." />
 * <Input label="Email" iconLeft={<MailIcon />} />
 * <Input error errorMessage="Invalid email" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      inputSize = 'md',
      variant = 'default',
      iconLeft,
      iconRight,
      error = false,
      errorMessage,
      helperText,
      label,
      required,
      fluid = true,
      className,
      ...props
    },
    ref
  ) => {
    const hasError = error || !!errorMessage;
    const variantStyle = variantClasses[variant];

    const inputElement = (
      <div className={cn('relative', fluid && 'w-full')}>
        {iconLeft && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {iconLeft}
          </div>
        )}

        <input
          ref={ref}
          className={cn(
            baseInputClasses,
            sizeClasses[inputSize],
            hasError ? variantStyle.error : variantStyle.normal,
            iconLeft && iconPaddingClasses[inputSize].left,
            iconRight && iconPaddingClasses[inputSize].right,
            className
          )}
          {...props}
        />

        {iconRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {iconRight}
          </div>
        )}
      </div>
    );

    // No label or helper - return just input
    if (!label && !helperText && !errorMessage) {
      return inputElement;
    }

    // With label/helper - wrap in stack
    return (
      <Stack gap={1} className={cn(fluid && 'w-full')}>
        {label && (
          <Text as="label" size="sm" weight="medium">
            {label}
            {required && <Text color="danger" className="ml-1">*</Text>}
          </Text>
        )}
        {inputElement}
        {(errorMessage || helperText) && (
          <Text size="xs" color={errorMessage ? 'danger' : 'muted'}>
            {errorMessage || helperText}
          </Text>
        )}
      </Stack>
    );
  }
);

Input.displayName = 'Input';

// ═══════════════════════════════════════════════════════════════════════════
// TEXTAREA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TextArea — Multi-line input
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      inputSize = 'md',
      variant = 'default',
      error = false,
      errorMessage,
      helperText,
      label,
      required,
      fluid = true,
      minRows = 3,
      className,
      ...props
    },
    ref
  ) => {
    const hasError = error || !!errorMessage;
    const variantStyle = variantClasses[variant];

    const fontSizeClass = inputSize === 'sm' ? 'text-[13px]' : inputSize === 'lg' ? 'text-[15px]' : 'text-sm';

    const textareaElement = (
      <textarea
        ref={ref}
        rows={minRows}
        className={cn(
          baseInputClasses,
          'py-2.5 min-h-20 resize-y',
          fontSizeClass,
          hasError ? variantStyle.error : variantStyle.normal,
          className
        )}
        {...props}
      />
    );

    if (!label && !helperText && !errorMessage) {
      return textareaElement;
    }

    return (
      <Stack gap={1} className={cn(fluid && 'w-full')}>
        {label && (
          <Text as="label" size="sm" weight="medium">
            {label}
            {required && <Text color="danger" className="ml-1">*</Text>}
          </Text>
        )}
        {textareaElement}
        {(errorMessage || helperText) && (
          <Text size="xs" color={errorMessage ? 'danger' : 'muted'}>
            {errorMessage || helperText}
          </Text>
        )}
      </Stack>
    );
  }
);

TextArea.displayName = 'TextArea';

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH INPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchInputProps extends Omit<InputProps, 'iconLeft' | 'type'> {
  onSearch?: (value: string) => void;
}

/** SearchInput — Pre-configured search input */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSearch) {
        onSearch(e.currentTarget.value);
      }
      onKeyDown?.(e);
    };

    return (
      <Input
        ref={ref}
        type="search"
        iconLeft={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        }
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';