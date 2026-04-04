// src/components/ui/sheet.tsx

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./sheet.module.css";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

type SheetOverlayProps = React.ComponentPropsWithoutRef<
	typeof SheetPrimitive.Overlay
>;
type SheetTitleProps = React.ComponentPropsWithoutRef<
	typeof SheetPrimitive.Title
>;
type SheetDescriptionProps = React.ComponentPropsWithoutRef<
	typeof SheetPrimitive.Description
>;

const SheetOverlay = React.forwardRef<HTMLDivElement, SheetOverlayProps>(
	({ className, ...props }, ref) => (
		<SheetPrimitive.Overlay
			className={cn(styles.overlay, className)}
			{...props}
			ref={ref}
		/>
	),
);
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sideClassMap = {
	top: styles.top,
	bottom: styles.bottom,
	left: styles.left,
	right: styles.right,
} as const;

type SheetSide = keyof typeof sideClassMap;

interface SheetContentProps
	extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
	side?: SheetSide;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
	({ side = "right", className, children, ...props }, ref) => (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				ref={ref}
				className={cn(styles.content, sideClassMap[side], className)}
				{...props}
			>
				<SheetPrimitive.Close className={styles.closeButton}>
					<X className={styles.closeIcon} />
					<span className={styles.srOnly}>Close</span>
				</SheetPrimitive.Close>
				{children}
			</SheetPrimitive.Content>
		</SheetPortal>
	),
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn(styles.header, className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn(styles.footer, className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<HTMLHeadingElement, SheetTitleProps>(
	({ className, ...props }, ref) => (
		<SheetPrimitive.Title
			ref={ref}
			className={cn(styles.title, className)}
			{...props}
		/>
	),
);
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
	HTMLParagraphElement,
	SheetDescriptionProps
>(({ className, ...props }, ref) => (
	<SheetPrimitive.Description
		ref={ref}
		className={cn(styles.description, className)}
		{...props}
	/>
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
	Sheet,
	SheetPortal,
	SheetOverlay,
	SheetTrigger,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
};
