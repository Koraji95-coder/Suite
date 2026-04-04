// src/components/system/base/Input.tsx
import {
	forwardRef,
	type InputHTMLAttributes,
	type ReactNode,
	type TextareaHTMLAttributes,
	useId,
} from "react";
import { cn } from "@/lib/utils";
import styles from "./Input.module.css";
import { Stack } from "./Stack";
import { Label, Text } from "./Text";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type InputSize = "sm" | "md" | "lg";
type InputVariant = "default" | "filled" | "ghost";

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
		Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {}

export interface TextAreaProps
	extends InputBaseProps,
		Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
	/** Minimum rows */
	minRows?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

const sizeClasses: Record<InputSize, string> = {
	sm: styles.inputSm,
	md: styles.inputMd,
	lg: styles.inputLg,
};

const iconPaddingClasses: Record<InputSize, { left: string; right: string }> = {
	sm: { left: styles.inputPadLeftSm, right: styles.inputPadRightSm },
	md: { left: styles.inputPadLeftMd, right: styles.inputPadRightMd },
	lg: { left: styles.inputPadLeftLg, right: styles.inputPadRightLg },
};

const variantClasses: Record<InputVariant, { normal: string; error: string }> =
	{
		default: {
			normal: styles.variantDefault,
			error: styles.variantDefaultError,
		},
		filled: {
			normal: styles.variantFilled,
			error: styles.variantFilledError,
		},
		ghost: {
			normal: styles.variantGhost,
			error: styles.variantGhostError,
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
			inputSize = "md",
			variant = "default",
			iconLeft,
			iconRight,
			error = false,
			errorMessage,
			helperText,
			label,
			required,
			fluid = true,
			className,
			id,
			name,
			...props
		},
		ref,
	) => {
		const generatedId = useId();
		const inputId = String(id || `input-${generatedId.replace(/:/g, "")}`);
		const inputName = String(name || inputId);
		const hasError = error || !!errorMessage;
		const variantStyle = variantClasses[variant];

		const inputElement = (
			<div className={cn(styles.inputWrap, fluid && styles.fluid)}>
				{iconLeft && (
					<div className={cn(styles.iconSlot, styles.iconLeft)}>{iconLeft}</div>
				)}

				<input
					ref={ref}
					id={inputId}
					name={inputName}
					className={cn(
						styles.inputBase,
						sizeClasses[inputSize],
						hasError ? variantStyle.error : variantStyle.normal,
						iconLeft && iconPaddingClasses[inputSize].left,
						iconRight && iconPaddingClasses[inputSize].right,
						className,
					)}
					{...props}
				/>

				{iconRight && (
					<div className={cn(styles.iconSlot, styles.iconRight)}>
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
			<Stack gap={1} className={cn(fluid && styles.fluid)}>
				{label && (
					<Label htmlFor={inputId} size="sm" weight="medium">
						{label}
						{required && (
							<Text color="danger" className={styles.requiredAsterisk}>
								*
							</Text>
						)}
					</Label>
				)}
				{inputElement}
				{(errorMessage || helperText) && (
					<Text size="xs" color={errorMessage ? "danger" : "muted"}>
						{errorMessage || helperText}
					</Text>
				)}
			</Stack>
		);
	},
);

Input.displayName = "Input";

// ═══════════════════════════════════════════════════════════════════════════
// TEXTAREA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TextArea — Multi-line input
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
	(
		{
			inputSize = "md",
			variant = "default",
			error = false,
			errorMessage,
			helperText,
			label,
			required,
			fluid = true,
			minRows = 3,
			className,
			id,
			name,
			...props
		},
		ref,
	) => {
		const generatedId = useId();
		const textareaId = String(
			id || `textarea-${generatedId.replace(/:/g, "")}`,
		);
		const textareaName = String(name || textareaId);
		const hasError = error || !!errorMessage;
		const variantStyle = variantClasses[variant];

		const textareaSizeClass =
			inputSize === "sm"
				? styles.textareaSm
				: inputSize === "lg"
					? styles.textareaLg
					: styles.textareaMd;

		const textareaElement = (
			<textarea
				ref={ref}
				id={textareaId}
				name={textareaName}
				rows={minRows}
				className={cn(
					styles.inputBase,
					styles.textareaBase,
					textareaSizeClass,
					hasError ? variantStyle.error : variantStyle.normal,
					className,
				)}
				{...props}
			/>
		);

		if (!label && !helperText && !errorMessage) {
			return textareaElement;
		}

		return (
			<Stack gap={1} className={cn(fluid && styles.fluid)}>
				{label && (
					<Label htmlFor={textareaId} size="sm" weight="medium">
						{label}
						{required && (
							<Text color="danger" className={styles.requiredAsterisk}>
								*
							</Text>
						)}
					</Label>
				)}
				{textareaElement}
				{(errorMessage || helperText) && (
					<Text size="xs" color={errorMessage ? "danger" : "muted"}>
						{errorMessage || helperText}
					</Text>
				)}
			</Stack>
		);
	},
);

TextArea.displayName = "TextArea";

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH INPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchInputProps
	extends Omit<InputProps, "iconLeft" | "type"> {
	onSearch?: (value: string) => void;
}

/** SearchInput — Pre-configured search input */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
	({ onSearch, onKeyDown, ...props }, ref) => {
		const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter" && onSearch) {
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
	},
);

SearchInput.displayName = "SearchInput";
