// src/components/ui/select.tsx

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./select.module.css";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

type SelectTriggerProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.Trigger
>;
type SelectScrollUpButtonProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.ScrollUpButton
>;
type SelectScrollDownButtonProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.ScrollDownButton
>;
type SelectContentProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.Content
>;
type SelectLabelProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.Label
>;
type SelectItemProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.Item
>;
type SelectSeparatorProps = React.ComponentPropsWithoutRef<
	typeof SelectPrimitive.Separator
>;

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
	({ className, children, ...props }, ref) => (
		<SelectPrimitive.Trigger
			ref={ref}
			className={cn(styles.trigger, className)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDown className={styles.triggerIcon} />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	),
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
	HTMLDivElement,
	SelectScrollUpButtonProps
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollUpButton
		ref={ref}
		className={cn(styles.scrollButton, className)}
		{...props}
	>
		<ChevronUp className={styles.scrollIcon} />
	</SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
	HTMLDivElement,
	SelectScrollDownButtonProps
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollDownButton
		ref={ref}
		className={cn(styles.scrollButton, className)}
		{...props}
	>
		<ChevronDown className={styles.scrollIcon} />
	</SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
	SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
	({ className, children, position = "popper", ...props }, ref) => (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				ref={ref}
				className={cn(
					styles.content,
					position === "popper" && styles.contentPopper,
					className,
				)}
				position={position}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport
					className={cn(
						styles.viewport,
						position === "popper" && styles.viewportPopper,
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	),
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<HTMLDivElement, SelectLabelProps>(
	({ className, ...props }, ref) => (
		<SelectPrimitive.Label
			ref={ref}
			className={cn(styles.label, className)}
			{...props}
		/>
	),
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
	({ className, children, ...props }, ref) => (
		<SelectPrimitive.Item
			ref={ref}
			className={cn(styles.item, className)}
			{...props}
		>
			<span className={styles.itemIndicatorWrap}>
				<SelectPrimitive.ItemIndicator>
					<Check className={styles.itemIndicatorIcon} />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	),
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<HTMLDivElement, SelectSeparatorProps>(
	({ className, ...props }, ref) => (
		<SelectPrimitive.Separator
			ref={ref}
			className={cn(styles.separator, className)}
			{...props}
		/>
	),
);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
	Select,
	SelectGroup,
	SelectValue,
	SelectTrigger,
	SelectContent,
	SelectLabel,
	SelectItem,
	SelectSeparator,
	SelectScrollUpButton,
	SelectScrollDownButton,
};
