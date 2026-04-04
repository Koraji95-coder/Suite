// src/components/ui/dropdown-menu.tsx

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./dropdown-menu.module.css";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

type SubTriggerProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.SubTrigger
> & { inset?: boolean };
type SubContentProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.SubContent
>;
type ContentProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.Content
>;
type ItemProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.Item
> & { inset?: boolean };
type CheckboxItemProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.CheckboxItem
>;
type RadioItemProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.RadioItem
>;
type LabelProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.Label
> & { inset?: boolean };
type SeparatorProps = React.ComponentPropsWithoutRef<
	typeof DropdownMenuPrimitive.Separator
>;

const DropdownMenuSubTrigger = React.forwardRef<
	HTMLDivElement,
	SubTriggerProps
>(({ className, inset, children, ...props }, ref) => (
	<DropdownMenuPrimitive.SubTrigger
		ref={ref}
		className={cn(
			styles.subTrigger,
			inset && styles.subTriggerInset,
			className,
		)}
		{...props}
	>
		{children}
		<ChevronRight className={styles.subTriggerIcon} />
	</DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
	DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
	HTMLDivElement,
	SubContentProps
>(({ className, ...props }, ref) => (
	<DropdownMenuPrimitive.SubContent
		ref={ref}
		className={cn(styles.subContent, className)}
		{...props}
	/>
));
DropdownMenuSubContent.displayName =
	DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<HTMLDivElement, ContentProps>(
	({ className, sideOffset = 4, ...props }, ref) => (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				ref={ref}
				sideOffset={sideOffset}
				className={cn(styles.content, className)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	),
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<HTMLDivElement, ItemProps>(
	({ className, inset, ...props }, ref) => (
		<DropdownMenuPrimitive.Item
			ref={ref}
			className={cn(styles.item, inset && styles.itemInset, className)}
			{...props}
		/>
	),
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
	HTMLDivElement,
	CheckboxItemProps
>(({ className, children, checked, ...props }, ref) => (
	<DropdownMenuPrimitive.CheckboxItem
		ref={ref}
		className={cn(styles.checkboxItem, className)}
		checked={checked}
		{...props}
	>
		<span className={styles.itemIndicatorWrap}>
			<DropdownMenuPrimitive.ItemIndicator>
				<Check className={styles.checkIcon} />
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
	DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<HTMLDivElement, RadioItemProps>(
	({ className, children, ...props }, ref) => (
		<DropdownMenuPrimitive.RadioItem
			ref={ref}
			className={cn(styles.radioItem, className)}
			{...props}
		>
			<span className={styles.itemIndicatorWrap}>
				<DropdownMenuPrimitive.ItemIndicator>
					<Circle className={styles.circleIcon} />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.RadioItem>
	),
);
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, LabelProps>(
	({ className, inset, ...props }, ref) => (
		<DropdownMenuPrimitive.Label
			ref={ref}
			className={cn(styles.label, inset && styles.labelInset, className)}
			{...props}
		/>
	),
);
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, SeparatorProps>(
	({ className, ...props }, ref) => (
		<DropdownMenuPrimitive.Separator
			ref={ref}
			className={cn(styles.separator, className)}
			{...props}
		/>
	),
);
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
	<span className={cn(styles.shortcut, className)} {...props} />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuRadioGroup,
};
